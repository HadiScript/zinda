import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Realistic buildings from ambientCG PBR textures (CC0). Walls use world-space
// UVs so facades keep real floor heights whatever size the building is.

const TEX = 'assets/textures/';
const tl = new THREE.TextureLoader();
const night = { value: 0 };
const glowing = []; // [material, strength]

function tex(path, srgb = false, onLoad) {
  const t = tl.load(path, onLoad);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Map wall UVs from world position: u runs along the wall, v up from the base
function worldUV(mat, tile) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: new THREE.Vector2(...tile) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uTile;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          mat4 im = mat4(1.0);
          #ifdef USE_INSTANCING
            im = instanceMatrix;
          #endif
          vec4 fw = modelMatrix * im * vec4(transformed, 1.0);
          vec3 wn = normalize(mat3(modelMatrix) * mat3(im) * normal);
          float base = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).y;
          vec2 fuv = abs(wn.y) > 0.5
            ? fw.xz
            : vec2(abs(wn.x) > 0.5 ? fw.z * sign(wn.x) : -fw.x * sign(wn.z), fw.y - base);
          fuv /= uTile;
          #ifdef USE_MAP
            vMapUv = fuv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = fuv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = fuv;
          #endif
          #ifdef USE_METALNESSMAP
            vMetalnessMapUv = fuv;
          #endif
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = fuv;
          #endif
        }`);
  };
  mat.customProgramCacheKey = () => 'worldUV';
  return mat;
}

// Night windows for facades that ship without an emission map: find the glass
// in the colour texture and light a random subset of panes.
function litWindows(img, cols, rows, glassIsDark) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S);
  const lit = Array.from({ length: cols * rows }, () => Math.random() < 0.45 ? 0.55 + Math.random() * 0.45 : 0);
  const warm = Array.from({ length: cols * rows }, () => Math.random() < 0.8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const l = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 765;
      const glass = glassIsDark ? l < 0.45 : l > 0.12;
      const cell = Math.floor((y / S) * rows) * cols + Math.floor((x / S) * cols);
      const k = glass ? lit[cell] : 0;
      const [r, gg, b] = warm[cell] ? [255, 196, 120] : [200, 225, 255];
      px.data[i] = r * k; px.data[i + 1] = gg * k; px.data[i + 2] = b * k; px.data[i + 3] = 255;
    }
  }
  g.putImageData(px, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function facade(name, tile, { metal = false, emission = null } = {}) {
  const dir = TEX + name + '/';
  const mat = new THREE.MeshStandardMaterial({
    normalMap: tex(dir + 'normalgl.jpg'),
    roughnessMap: tex(dir + 'roughness.jpg'),
    metalnessMap: metal ? tex(dir + 'metalness.jpg') : null,
    metalness: metal ? 1 : 0,
    emissive: '#ffffff',
    emissiveIntensity: 0,
  });
  mat.map = tex(dir + 'color.jpg', true, (t) => {
    if (emission && !mat.emissiveMap) {
      mat.emissiveMap = litWindows(t.image, ...emission);
      mat.needsUpdate = true;
    }
  });
  if (emission === 'file') {
    mat.emissiveMap = tex(dir + 'emission.jpg', true);
  }
  glowing.push([mat, 1.0]);
  return worldUV(mat, tile);
}

function surface(name, tile, extra = {}) {
  const dir = TEX + name + '/';
  return worldUV(new THREE.MeshStandardMaterial({
    map: tex(dir + 'color.jpg', true), normalMap: tex(dir + 'normalgl.jpg'), roughnessMap: tex(dir + 'roughness.jpg'), ...extra,
  }), tile);
}

let M = null;
export function materials() {
  if (M) return M;
  M = {
    glass: facade('Facade001', [36, 36], { metal: true, emission: [16, 10, false] }),
    office: facade('Facade006', [28.8, 28.8], { emission: [14, 8, true] }),
    brickFlats: facade('Facade018A', [19.2, 19.2], { emission: 'file' }),
    brick: surface('Bricks075A', [3, 3]),
    plaster: surface('PaintedPlaster017', [4, 4]),
    cream: surface('PaintedPlaster017', [4, 4], { color: '#f2e2c4' }),
    sand: surface('PaintedPlaster017', [4, 4], { color: '#d9c7a6' }),
    grey: surface('PaintedPlaster017', [4, 4], { color: '#b9bcbf' }),
    stone: surface('Bricks075A', [2.4, 2.4], { color: '#d8d0c4' }),
    metal: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.45, metalness: 0.6 }),
    tank: new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.7 }),
    roofRed: surface('RoofingTiles012A', [2.5, 2.5]),
    roofSlate: surface('RoofingTiles013A', [2.5, 2.5]),
    roofTop: new THREE.MeshStandardMaterial({ color: '#7d8186', roughness: 0.92 }),
    unit: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.6, metalness: 0.4 }),
    frame: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 }),
    pane: new THREE.MeshStandardMaterial({ color: '#2a3440', roughness: 0.08, metalness: 0.7, emissive: '#ffbf73', emissiveIntensity: 0 }),
    door: new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.7 }),
  };
  glowing.push([M.pane, 1.1]);
  return M;
}

// Box with walls/roof as separate groups (BoxGeometry order: +x −x +y −y +z −z)
function shell(w, h, d, y0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, y0 + h / 2, 0);
  g.clearGroups();
  const per = 6;
  g.addGroup(0, per * 2, 0); g.addGroup(per * 2, per * 2, 1); g.addGroup(per * 4, per * 2, 0);
  return g;
}

function tower(wall, w, d, h) {
  const m = materials();
  const body = shell(w, h, d);
  const crownH = Math.max(4, h * 0.08);
  const crown = shell(w * 0.72, crownH, d * 0.72, h);
  const wallGeo = mergeGeometries([body, crown].map((g) => onlyGroup(g, 0)));
  const roofGeo = mergeGeometries([body, crown].map((g) => onlyGroup(g, 1)));
  const units = mergeGeometries([
    new THREE.BoxGeometry(w * 0.25, 2.2, d * 0.18).translate(-w * 0.15, h + crownH + 1.1, d * 0.1),
    new THREE.BoxGeometry(2.2, 3.2, 2.2).translate(w * 0.2, h + crownH + 1.6, -d * 0.18),
    new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6).translate(0, 0.3, 0), // plinth
  ]);
  return {
    parts: [
      { geometry: wallGeo, material: wall },
      { geometry: roofGeo, material: m.roofTop },
      { geometry: units, material: m.unit },
    ],
    size: new THREE.Vector3(w, h + crownH, d),
  };
}

function onlyGroup(geo, matIndex) {
  const idx = [];
  for (const grp of geo.groups) if (grp.materialIndex === matIndex) idx.push(...geo.index.array.slice(grp.start, grp.start + grp.count));
  const g = geo.clone();
  g.setIndex(idx);
  g.clearGroups();
  return g;
}

// Gable roof along X: two tiled slopes plus the wall triangles at each end
function gable(w, d, y, rise, over = 0.6) {
  const W = w / 2 + over, D = d / 2 + over;
  const ridge = y + rise + over * (rise / (d / 2));
  const yE = y - over * (rise / (d / 2));
  const slopeLen = Math.hypot(D, ridge - yE);
  const roof = new THREE.BufferGeometry();
  const P = [
    -W, yE, D, W, yE, D, -W, ridge, 0, W, ridge, 0, // front slope
    W, yE, -D, -W, yE, -D, W, ridge, 0, -W, ridge, 0, // back slope
  ];
  const T = 2.5;
  const UV = [0, 0, 2 * W / T, 0, 0, slopeLen / T, 2 * W / T, slopeLen / T, 0, 0, 2 * W / T, 0, 0, slopeLen / T, 2 * W / T, slopeLen / T];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  roof.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  roof.computeVertexNormals();
  const ends = new THREE.BufferGeometry();
  const hw = w / 2, hd = d / 2;
  ends.setAttribute('position', new THREE.Float32BufferAttribute([
    hw, y, hd, hw, y, -hd, hw, y + rise, 0,
    -hw, y, -hd, -hw, y, hd, -hw, y + rise, 0,
  ], 3));
  ends.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  ends.computeVertexNormals();
  return { roof, ends };
}

function house({ w, d, floors, wall, roof, chimney = false }) {
  const m = materials();
  const h = floors * 3;
  const rise = d * 0.36;
  const body = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const { roof: roofGeo, ends } = gable(w, d, h, rise);
  const wallParts = [body.toNonIndexed(), ends];
  if (chimney) wallParts.push(new THREE.BoxGeometry(1, rise + 1.5, 1).translate(w * 0.28, h + (rise + 1.5) / 2, -d * 0.12).toNonIndexed());
  for (const g of wallParts) g.deleteAttribute('uv');
  const wallGeo = mergeGeometries(wallParts);

  // windows on every side, a door on the front
  const frames = [], panes = [], doors = [];
  const win = (x, y, z, rotY) => {
    const q = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    frames.push(new THREE.BoxGeometry(1.5, 1.7, 0.14).applyMatrix4(q));
    panes.push(new THREE.BoxGeometry(1.22, 1.42, 0.18).applyMatrix4(q));
  };
  for (let f = 0; f < floors; f++) {
    const y = f * 3 + 1.7;
    const nx = Math.max(1, Math.floor(w / 3.2));
    for (let k = 0; k < nx; k++) {
      const x = -w / 2 + (w / nx) * (k + 0.5);
      if (f === 0 && k === Math.floor(nx / 2)) continue; // door goes here
      win(x, y, d / 2, 0);
      win(x, y, -d / 2, Math.PI);
    }
    const nz = Math.max(1, Math.floor(d / 3.4));
    for (let k = 0; k < nz; k++) {
      const z = -d / 2 + (d / nz) * (k + 0.5);
      win(w / 2, y, z, Math.PI / 2);
      win(-w / 2, y, z, -Math.PI / 2);
    }
  }
  const nx = Math.max(1, Math.floor(w / 3.2));
  const doorX = -w / 2 + (w / nx) * (Math.floor(nx / 2) + 0.5);
  doors.push(new THREE.BoxGeometry(1.2, 2.3, 0.16).translate(doorX, 1.15, d / 2));
  frames.push(new THREE.BoxGeometry(1.5, 2.5, 0.12).translate(doorX, 1.25, d / 2));
  frames.push(new THREE.BoxGeometry(2.4, 0.18, 1.2).translate(doorX, 2.7, d / 2 + 0.55)); // porch canopy

  const clean = (list) => mergeGeometries(list.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  return {
    parts: [
      { geometry: wallGeo, material: wall },
      { geometry: roofGeo, material: roof },
      { geometry: clean(frames), material: m.frame, castShadow: false },
      { geometry: clean(panes), material: m.pane, castShadow: false },
      { geometry: clean(doors), material: m.door, castShadow: false },
    ],
    size: new THREE.Vector3(w + 1.2, h + rise, d + 1.2),
  };
}

// Karachi-style villa: two storeys, flat roof with parapet, stone-clad front,
// balcony, stair room ("mumty") and water tank on the roof, boundary wall and
// a steel gate. Front faces +z; the yard reaches 4 m forward.
function villa({ w, d, wall, yard = 3.5 }) {
  const m = materials();
  const H = 6.6;
  const wallParts = [
    new THREE.BoxGeometry(w, H, d).translate(0, H / 2, 0),
    // parapet
    new THREE.BoxGeometry(w + 0.3, 1, 0.25).translate(0, H + 0.5, d / 2),
    new THREE.BoxGeometry(w + 0.3, 1, 0.25).translate(0, H + 0.5, -d / 2),
    new THREE.BoxGeometry(0.25, 1, d).translate(w / 2, H + 0.5, 0),
    new THREE.BoxGeometry(0.25, 1, d).translate(-w / 2, H + 0.5, 0),
    // mumty (stair room) at the back corner
    new THREE.BoxGeometry(3.2, 2.8, 4).translate(-w / 2 + 2, H + 1.4, -d / 2 + 2.4),
    // boundary walls around the front yard, with a gap for the gate
    new THREE.BoxGeometry(0.25, 1.9, yard).translate(w / 2, 0.95, d / 2 + yard / 2),
    new THREE.BoxGeometry(0.25, 1.9, yard).translate(-w / 2, 0.95, d / 2 + yard / 2),
    new THREE.BoxGeometry(w * 0.55, 1.9, 0.25).translate(-w * 0.225, 0.95, d / 2 + yard),
    // floor slab band between storeys
    new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2).translate(0, 3.35, 0),
  ];
  const stone = [new THREE.BoxGeometry(w * 0.38, H, 0.16).translate(-w / 2 + w * 0.19, H / 2, d / 2 + 0.05)];
  const frames = [], panes = [], metal = [];
  const win = (x, y, z, ww, hh, rotY = 0) => {
    const q = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    frames.push(new THREE.BoxGeometry(ww + 0.2, hh + 0.2, 0.14).applyMatrix4(q));
    panes.push(new THREE.BoxGeometry(ww, hh, 0.2).applyMatrix4(q));
  };
  // big front windows, the stone panel side gets a tall glass strip
  win(w * 0.18, 1.7, d / 2, w * 0.36, 1.7);
  win(w * 0.18, 5, d / 2, w * 0.36, 1.6);
  win(-w / 2 + w * 0.19, 3.3, d / 2 + 0.1, 0.9, 5.2);
  for (const side of [1, -1]) for (const y of [1.7, 5]) win(side * w / 2, y, 0, 2.2, 1.4, side * Math.PI / 2);
  for (const y of [1.7, 5]) win(0, y, -d / 2, 2.6, 1.4, Math.PI);
  // balcony with railing
  const balcony = [
    new THREE.BoxGeometry(w * 0.5, 0.22, 1.4).translate(w * 0.18, 3.5, d / 2 + 0.7),
  ];
  metal.push(new THREE.BoxGeometry(w * 0.5, 0.06, 0.06).translate(w * 0.18, 4.5, d / 2 + 1.38));
  for (let k = 0; k <= 6; k++) metal.push(new THREE.BoxGeometry(0.05, 1, 0.05).translate(w * 0.18 - w * 0.25 + (w * 0.5 * k) / 6, 4, d / 2 + 1.38));
  // front door, steel gate and car gate
  const doors = [new THREE.BoxGeometry(1.3, 2.4, 0.18).translate(-w * 0.05, 1.2, d / 2)];
  metal.push(new THREE.BoxGeometry(w * 0.42, 1.9, 0.1).translate(w * 0.28, 0.95, d / 2 + yard));
  // water tank on the roof
  const tank = [new THREE.CylinderGeometry(0.8, 0.8, 1.5, 14).translate(-w / 2 + 2, H + 3.55, -d / 2 + 2.4)];

  const clean = (list) => mergeGeometries(list.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  return {
    parts: [
      { geometry: clean(wallParts), material: wall },
      { geometry: clean(stone), material: m.stone },
      { geometry: clean(balcony), material: m.frame },
      { geometry: clean(frames), material: m.frame, castShadow: false },
      { geometry: clean(panes), material: m.pane, castShadow: false },
      { geometry: clean(doors), material: m.door, castShadow: false },
      { geometry: clean(metal), material: m.metal, castShadow: false },
      { geometry: clean(tank), material: m.tank },
    ],
    size: new THREE.Vector3(w, H + 4, d + yard),
  };
}

export const BUILDINGS = {
  'villa-cream': { label: 'Villa (cream)', emoji: '🏘️', make: (m) => villa({ w: 10, d: 10.5, wall: m.cream }) },
  'villa-white': { label: 'Villa (white)', emoji: '🏘️', make: (m) => villa({ w: 10, d: 10.5, wall: m.plaster }) },
  'villa-sand': { label: 'Villa (sand)', emoji: '🏘️', make: (m) => villa({ w: 10, d: 10.5, wall: m.sand }) },
  'villa-grey': { label: 'Villa (grey)', emoji: '🏘️', make: (m) => villa({ w: 10, d: 10.5, wall: m.grey }) },
  'glass-tower': { label: 'Glass tower', emoji: '🏙️', make: (m) => tower(m.glass, 18, 18, 72) },
  'glass-tower-tall': { label: 'Skyscraper', emoji: '🏙️', make: (m) => tower(m.glass, 18, 18, 99) },
  'office-tower': { label: 'Office tower', emoji: '🏢', make: (m) => tower(m.office, 16.5, 16.5, 50) },
  'office-tower-tall': { label: 'Tall office', emoji: '🏢', make: (m) => tower(m.office, 16.5, 16.5, 72) },
  'brick-flats': { label: 'Apartments', emoji: '🏬', make: (m) => tower(m.brickFlats, 19.2, 12.8, 22.4) },
  'brick-flats-tall': { label: 'Tall apartments', emoji: '🏬', make: (m) => tower(m.brickFlats, 19.2, 12.8, 32) },
  'house-brick': { label: 'Brick house', emoji: '🏠', make: (m) => house({ w: 10, d: 8, floors: 2, wall: m.brick, roof: m.roofRed, chimney: true }) },
  'house-white': { label: 'White house', emoji: '🏡', make: (m) => house({ w: 9.5, d: 8, floors: 2, wall: m.plaster, roof: m.roofSlate }) },
  'house-small': { label: 'Cottage', emoji: '🏠', make: (m) => house({ w: 8, d: 7, floors: 1, wall: m.brick, roof: m.roofSlate, chimney: true }) },
  'villa': { label: 'Villa', emoji: '🏡', make: (m) => house({ w: 14, d: 10, floors: 2, wall: m.plaster, roof: m.roofRed, chimney: true }) },
};

export function buildBuildingModels() {
  const m = materials();
  const out = {};
  for (const [id, b] of Object.entries(BUILDINGS)) out[`proc/${id}`] = { key: `proc/${id}`, ...b.make(m) };
  return out;
}

export function setBuildingNight(n) {
  night.value = n;
  for (const [mat, k] of glowing) mat.emissiveIntensity = n * k;
}
