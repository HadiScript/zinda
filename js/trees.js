import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

// Realistic trees from EZ-Tree (procedural bark + leaf cards). Each variant is
// generated once, slimmed down for integrated GPUs, then drawn instanced.

// [catalog id, preset, seed, target height in metres]
export const TREE_VARIANTS = [
  ['ez-oak', 'Oak Medium', 11, 13],
  ['ez-oak-2', 'Oak Large', 23, 16],
  ['ez-ash', 'Ash Medium', 5, 15],
  ['ez-aspen', 'Aspen Medium', 7, 16],
  ['ez-pine', 'Pine Medium', 3, 17],
  ['ez-pine-2', 'Pine Large', 19, 22],
  ['ez-bush', 'Bush 1', 2, 2.4],
  ['ez-bush-2', 'Bush 2', 9, 2.2],
];

const trees = [];

function slim(tree) {
  const b = tree.options.branch, l = tree.options.leaves;
  for (const k of Object.keys(b.segments)) b.segments[k] = Math.max(3, Math.ceil(b.segments[k] * 0.6));
  for (const k of Object.keys(b.sections)) b.sections[k] = Math.max(2, Math.ceil(b.sections[k] * 0.7));
  l.count = Math.max(4, Math.round(l.count * 0.95));
  l.size *= 1.2; // fewer but larger cards keep the canopy full
}

// EZ-Tree's leaf shader writes its own projection and skips instanceMatrix,
// which would stack every instance's leaves at the origin. Re-insert it.
function instancedWind(mat) {
  const original = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    original.call(mat, sh, renderer);
    sh.vertexShader = sh.vertexShader.replace(
      'vec4 mvPosition = vec4(transformed, 1.0);',
      `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif`
    );
  };
  mat.customProgramCacheKey = () => 'ez-leaves-instanced';
}

// Weathered boulders: a noisy icosahedron, squashed, with mottled grey-brown
export function buildRockModels() {
  const out = {};
  for (let v = 1; v <= 3; v++) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const p = g.attributes.position, n = new THREE.Vector3();
    const cols = [];
    const seed = v * 13.7;
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(p, i).normalize();
      const d = 1 + 0.22 * Math.sin(n.x * 3.1 + seed) * Math.cos(n.z * 2.7 - seed) + 0.1 * Math.sin(n.y * 7 + n.x * 5 + seed) + 0.05 * Math.sin(n.z * 13 + seed);
      n.multiplyScalar(d);
      p.setXYZ(i, n.x * (1.3 + v * 0.15), Math.max(n.y, -0.25) * (0.75 + v * 0.05), n.z);
      const k = 0.16 + 0.04 * Math.sin(n.x * 9 + n.z * 7 + seed) + (n.y > 0.5 ? 0.02 : 0);
      cols.push(k * 1.05, k, k * 0.92);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    g.translate(0, 0.15, 0);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    g.computeBoundingBox();
    out[`proc/rock-${v}`] = { key: `proc/rock-${v}`, parts: [{ geometry: g, material }], size: g.boundingBox.getSize(new THREE.Vector3()) };
  }
  return out;
}

export function buildTreeModels() {
  const models = {};
  for (const [id, preset, seed, height] of TREE_VARIANTS) {
    const tree = new Tree();
    tree.loadPreset(preset);
    tree.options.seed = seed;
    slim(tree);
    tree.generate();
    trees.push(tree);

    const box = new THREE.Box3().setFromObject(tree);
    const s = height / (box.max.y - box.min.y);
    const fit = (geo) => geo.clone().scale(s, s, s).translate(0, -box.min.y * s, 0);
    const leafMat = tree.leavesMesh.material;
    const barkMat = tree.branchesMesh.material;
    instancedWind(leafMat);
    const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMat.map, alphaTest: leafMat.alphaTest });
    const parts = [
      { geometry: fit(tree.branchesMesh.geometry), material: barkMat },
      { geometry: fit(tree.leavesMesh.geometry), material: leafMat, depthMaterial: leafDepth },
    ];
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(s);
    // canopy footprint is wide but the trunk is what you click/erase
    models[`proc/${id}`] = { key: `proc/${id}`, parts, size: new THREE.Vector3(Math.min(size.x, 6), size.y, Math.min(size.z, 6)) };
  }
  return models;
}

// Leaves sway in the wind via EZ-Tree's own shader uniforms
export function updateTrees(t) {
  for (const tree of trees) tree.update(t);
}
