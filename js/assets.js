import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Loads Kenney GLB models and flattens each into one geometry (with material
// groups) so it can be drawn with a single InstancedMesh.

THREE.Cache.enabled = true; // every kit shares one colormap.png

const loader = new GLTFLoader();
const cache = new Map();

export const KITS = {
  car: 'assets/car-kit/',
  road: 'assets/city-kit-roads/',
  shop: 'assets/city-kit-commercial/',
  home: 'assets/city-kit-suburban/',
  nature: 'assets/nature-kit/',
};

// Nature kit ships unlit materials; swap them for lit ones so day/night works
function litMaterial(m) {
  if (m.isMeshStandardMaterial) {
    m.roughness = Math.max(m.roughness, 0.7);
    m.metalness = 0;
    return m;
  }
  return new THREE.MeshStandardMaterial({
    color: m.color, map: m.map || null, vertexColors: m.vertexColors, roughness: 0.85,
    transparent: m.transparent, opacity: m.opacity, side: m.side,
  });
}

// The nature kit's flat colours read as pastel teal under our sun; pull foliage
// toward leaf green and calm the trunks/rocks so they sit with the terrain.
const hsl = {};
function natureTone(mat) {
  mat.color.getHSL(hsl);
  if (hsl.h > 0.3 && hsl.h < 0.58) { hsl.h = 0.27 + (hsl.h - 0.3) * 0.25; hsl.s = Math.min(1, hsl.s * 1.05); hsl.l *= 0.72; }
  else { hsl.s *= 0.7; hsl.l *= 0.8; }
  mat.color.setHSL(hsl.h, hsl.s, hsl.l);
}

function flatten(scene) {
  scene.updateMatrixWorld(true);
  const geos = [], mats = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (list.length > 1 && g.groups.length) {
      for (const grp of g.groups) {
        const part = g.clone();
        part.setIndex(g.index ? Array.from(g.index.array.slice(grp.start, grp.start + grp.count)) : null);
        part.clearGroups();
        geos.push(part); mats.push(litMaterial(list[grp.materialIndex]));
      }
    } else {
      g.clearGroups();
      geos.push(g); mats.push(litMaterial(list[0]));
    }
  });
  // Keep only attributes every part has, so they can merge
  const common = ['position', 'normal', 'uv', 'color'].filter((a) => geos.every((g) => g.attributes[a]));
  for (const g of geos) {
    for (const a of Object.keys(g.attributes)) if (!common.includes(a)) g.deleteAttribute(a);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  }
  // Merge parts that share a material
  const byMat = new Map();
  geos.forEach((g, i) => {
    const m = mats[i];
    const k = m.map ? `map:${m.map.uuid}` : `c:${m.color.getHexString()}:${m.vertexColors}`;
    if (!byMat.has(k)) byMat.set(k, { mat: m, geos: [] });
    byMat.get(k).geos.push(g);
  });
  const parts = [...byMat.values()];
  const geometry = mergeGeometries(parts.map((p) => mergeGeometries(p.geos)), true);
  geometry.computeBoundingBox();
  return { geometry, materials: parts.map((p) => p.mat) };
}

export function loadModel(kit, name) {
  const url = KITS[kit] + name + '.glb';
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => {
      const m = flatten(gltf.scene);
      if (kit === 'nature') m.materials.forEach(natureTone);
      m.key = `${kit}/${name}`;
      m.size = m.geometry.boundingBox.getSize(new THREE.Vector3());
      return m;
    }));
  }
  return cache.get(url);
}

export async function loadAll(list, onProgress) {
  let done = 0;
  const out = {};
  await Promise.all(list.map(async ([kit, name]) => {
    out[`${kit}/${name}`] = await loadModel(kit, name);
    onProgress?.(++done / list.length);
  }));
  return out;
}

// A growable set of InstancedMeshes for one model (one per part: e.g. a tree's
// bark and leaves). add/update/remove by handle.
export class Pool {
  constructor(scene, model, { capacity = 64, shadows = true } = {}) {
    this.scene = scene;
    this.parts = model.parts || [{ geometry: model.geometry, material: model.materials.length === 1 ? model.materials[0] : model.materials }];
    this.shadows = shadows;
    this.handles = []; // index → handle
    this.count = 0;
    this.meshes = [];
    this.make(capacity);
  }

  get mesh() { return this.meshes[0]; }

  make(capacity) {
    const old = this.meshes;
    this.meshes = this.parts.map((part, k) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.castShadow = part.castShadow ?? this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.count = this.count;
      mesh.frustumCulled = false;
      if (part.depthMaterial) mesh.customDepthMaterial = part.depthMaterial;
      if (old[k]) {
        mesh.instanceMatrix.array.set(old[k].instanceMatrix.array.subarray(0, this.count * 16));
        this.scene.remove(old[k]);
      }
      mesh.userData.pool = this;
      this.scene.add(mesh);
      return mesh;
    });
    this.capacity = capacity;
  }

  add(matrix) {
    if (this.count >= this.capacity) this.make(this.capacity * 2);
    const i = this.count++;
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.setMatrixAt(i, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    const h = { i, pool: this };
    this.handles[i] = h;
    return h;
  }

  set(h, matrix) {
    for (const mesh of this.meshes) {
      mesh.setMatrixAt(h.i, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  remove(h) {
    const last = this.count - 1;
    if (h.i !== last) {
      const m = new THREE.Matrix4();
      for (const mesh of this.meshes) {
        mesh.getMatrixAt(last, m);
        mesh.setMatrixAt(h.i, m);
      }
      const moved = this.handles[last];
      moved.i = h.i;
      this.handles[h.i] = moved;
    }
    this.handles.length = last;
    this.count = last;
    for (const mesh of this.meshes) { mesh.count = last; mesh.instanceMatrix.needsUpdate = true; }
    h.i = -1;
  }
}
