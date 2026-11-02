import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREE_VARIANTS } from './trees.js';
import { BUILDINGS } from './buildings.js';

// Everything the player can place. `model` is [kit, file] from assets/, scale is
// world units per model unit. kind drives special behaviour (vehicles drive,
// lights glow at night, roads auto-connect).

export const CATEGORIES = [
  { id: 'road', label: 'Roads', emoji: '🛣️' },
  { id: 'vehicle', label: 'Vehicles', emoji: '🚗' },
  { id: 'tree', label: 'Trees', emoji: '🌳' },
  { id: 'nature', label: 'Nature', emoji: '🌼' },
  { id: 'light', label: 'Lights', emoji: '💡' },
  { id: 'building', label: 'Buildings', emoji: '🏢' },
  { id: 'prop', label: 'Props', emoji: '🚧' },
];

const V = 1.7, T = 7, N = 6, B = 10, S = 8, H = 7.5;

export const CATALOG = {
  road: { cat: 'road', label: 'Road', emoji: '🛣️', kind: 'road' },

  sedan: { cat: 'vehicle', label: 'Car', emoji: '🚗', model: ['car', 'sedan'], scale: V, kind: 'vehicle' },
  'sedan-sports': { cat: 'vehicle', label: 'Sports car', emoji: '🏎️', model: ['car', 'sedan-sports'], scale: V, kind: 'vehicle' },
  'suv-luxury': { cat: 'vehicle', label: 'SUV', emoji: '🚙', model: ['car', 'suv-luxury'], scale: V, kind: 'vehicle' },
  taxi: { cat: 'vehicle', label: 'Taxi', emoji: '🚕', model: ['car', 'taxi'], scale: V, kind: 'vehicle' },
  police: { cat: 'vehicle', label: 'Police', emoji: '🚓', model: ['car', 'police'], scale: V, kind: 'vehicle' },
  ambulance: { cat: 'vehicle', label: 'Ambulance', emoji: '🚑', model: ['car', 'ambulance'], scale: V, kind: 'vehicle' },
  firetruck: { cat: 'vehicle', label: 'Fire truck', emoji: '🚒', model: ['car', 'firetruck'], scale: V, kind: 'vehicle' },
  truck: { cat: 'vehicle', label: 'Truck', emoji: '🚚', model: ['car', 'truck'], scale: V, kind: 'vehicle' },
  'garbage-truck': { cat: 'vehicle', label: 'Garbage truck', emoji: '🗑️', model: ['car', 'garbage-truck'], scale: V, kind: 'vehicle' },
  delivery: { cat: 'vehicle', label: 'Delivery', emoji: '📦', model: ['car', 'delivery'], scale: V, kind: 'vehicle' },
  van: { cat: 'vehicle', label: 'Van', emoji: '🚐', model: ['car', 'van'], scale: V, kind: 'vehicle' },
  tractor: { cat: 'vehicle', label: 'Tractor', emoji: '🚜', model: ['car', 'tractor'], scale: V, kind: 'vehicle' },
  bike: { cat: 'vehicle', label: 'Motorbike', emoji: '🏍️', model: ['proc', 'bike'], scale: 1, kind: 'vehicle' },
  airliner: { cat: 'vehicle', label: 'Airliner', emoji: '✈️', model: ['proc', 'airliner'], scale: 1 },

  'rock-1': { cat: 'nature', label: 'Rock', emoji: '🪨', model: ['proc', 'rock-1'], scale: 1.6 },
  'rock-2': { cat: 'nature', label: 'Boulder', emoji: '🪨', model: ['proc', 'rock-2'], scale: 2.6 },
  'rock-3': { cat: 'nature', label: 'Stone', emoji: '🪨', model: ['proc', 'rock-3'], scale: 1 },
  flower_redA: { cat: 'nature', label: 'Red flowers', emoji: '🌺', model: ['nature', 'flower_redA'], scale: N },
  flower_yellowA: { cat: 'nature', label: 'Yellow flowers', emoji: '🌼', model: ['nature', 'flower_yellowA'], scale: N },
  flower_purpleA: { cat: 'nature', label: 'Purple flowers', emoji: '🪻', model: ['nature', 'flower_purpleA'], scale: N },
  mushroom_redGroup: { cat: 'nature', label: 'Mushrooms', emoji: '🍄', model: ['nature', 'mushroom_redGroup'], scale: N },
  log_stack: { cat: 'nature', label: 'Log pile', emoji: '🪵', model: ['nature', 'log_stack'], scale: N },
  campfire_logs: { cat: 'nature', label: 'Campfire', emoji: '🔥', model: ['nature', 'campfire_logs'], scale: N },

  'light-curved': { cat: 'light', label: 'Street light', emoji: '💡', model: ['road', 'light-curved'], scale: B, kind: 'light', bulb: [0, 0.62, -0.17] },
  'light-curved-double': { cat: 'light', label: 'Double light', emoji: '💡', model: ['road', 'light-curved-double'], scale: B, kind: 'light', bulb: [0, 0.62, -0.17], bulb2: [0, 0.62, 0.17] },
  'light-square': { cat: 'light', label: 'Square light', emoji: '🔦', model: ['road', 'light-square'], scale: B, kind: 'light', bulb: [0, 0.57, -0.17] },
  'traffic-light': { cat: 'light', label: 'Traffic light', emoji: '🚦', model: ['road', 'traffic-light'], scale: B },

  'construction-cone': { cat: 'prop', label: 'Cone', emoji: '🚧', model: ['road', 'construction-cone'], scale: B },
  'construction-barrier': { cat: 'prop', label: 'Barrier', emoji: '🚧', model: ['road', 'construction-barrier'], scale: B },
  dumpster: { cat: 'prop', label: 'Dumpster', emoji: '🗑️', model: ['road', 'dumpster'], scale: B },
  'road-sign-stop': { cat: 'prop', label: 'Stop sign', emoji: '🛑', model: ['road', 'road-sign-stop'], scale: B },
  'detail-parasol-a': { cat: 'prop', label: 'Parasol', emoji: '⛱️', model: ['shop', 'detail-parasol-a'], scale: B },
  planter: { cat: 'prop', label: 'Planter', emoji: '🪴', model: ['home', 'planter'], scale: H },
  fence: { cat: 'prop', label: 'Fence', emoji: '🧱', model: ['home', 'fence'], scale: H },
};

// Realistic procedural trees and buildings (models built at startup)
const TREE_NAMES = { 'ez-oak': ['Oak', '🌳'], 'ez-oak-2': ['Big oak', '🌳'], 'ez-ash': ['Ash', '🌳'], 'ez-aspen': ['Aspen', '🌳'],
  'ez-pine': ['Pine', '🌲'], 'ez-pine-2': ['Tall pine', '🌲'], 'ez-bush': ['Bush', '🌿'], 'ez-bush-2': ['Shrub', '🌿'] };
for (const [id] of TREE_VARIANTS) {
  const [label, emoji] = TREE_NAMES[id];
  CATALOG[id] = { cat: id.includes('bush') ? 'nature' : 'tree', label, emoji, model: ['proc', id], scale: 1 };
}
CATALOG.mosque = { cat: 'building', label: 'Grand mosque', emoji: '🕌', model: ['proc', 'mosque'], scale: 0.78 };
for (const [id, b] of Object.entries(BUILDINGS)) {
  CATALOG[id] = { cat: 'building', label: b.label, emoji: b.emoji, model: ['proc', id], scale: 1 };
}

// Extra models the generated town and forest use
const SCENERY = [
  ['road', 'road-straight'], ['road', 'road-bend'], ['road', 'road-intersection'], ['road', 'road-crossroad'], ['road', 'road-end-round'],
  ['nature', 'grass_large'], ['nature', 'flower_redB'], ['nature', 'flower_yellowB'],
];

// Scenery-only models get catalog entries too so the eraser can identify them
for (const [kit, name] of SCENERY) {
  if (kit === 'road') continue;
  const id = kit === 'home' && name.startsWith('tree') ? `home-${name}` : name;
  if (CATALOG[id]) continue;
  const cat = name.startsWith('tree') ? 'tree' : kit === 'nature' ? 'nature' : 'building';
  const scale = kit === 'nature' ? (cat === 'tree' ? T : N) : name.includes('skyscraper') ? S : kit === 'home' ? H : B;
  CATALOG[id] = { cat, label: name, model: [kit, name], scale, hidden: true, windows: cat === 'building' };
}

export function modelList() {
  const set = new Map();
  for (const e of Object.values(CATALOG)) if (e.model && e.model[0] !== 'proc') set.set(e.model.join('/'), e.model);
  for (const m of SCENERY) set.set(m.join('/'), m);
  return [...set.values()];
}

// Low-poly motorbike built in code (the Kenney kits have no bikes)
export function makeBike() {
  const parts = [];
  const mats = [
    new THREE.MeshStandardMaterial({ color: '#d92b3a', roughness: 0.35, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: '#b9bec7', roughness: 0.3, metalness: 0.8 }),
  ];
  const add = (geo, m) => { geo.clearGroups(); geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, m); parts.push(geo); };
  for (const z of [-0.85, 0.85]) {
    add(new THREE.TorusGeometry(0.42, 0.12, 8, 18).rotateY(Math.PI / 2).translate(0, 0.42, z), 1);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10).rotateZ(Math.PI / 2).translate(0, 0.42, z), 2);
  }
  add(new THREE.BoxGeometry(0.34, 0.42, 0.9).translate(0, 0.78, 0.05), 0);            // tank/body
  add(new THREE.BoxGeometry(0.3, 0.14, 0.7).translate(0, 1.02, -0.35), 1);            // seat
  add(new THREE.BoxGeometry(0.24, 0.28, 0.5).translate(0, 0.6, -0.15), 2);            // engine
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6).rotateX(-0.45).translate(0, 0.85, 0.72), 2); // fork
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6).rotateZ(Math.PI / 2).translate(0, 1.25, 0.9), 1); // bars
  add(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6).rotateX(Math.PI / 2).translate(0.2, 0.42, -0.55), 2); // exhaust
  // rider
  add(new THREE.BoxGeometry(0.42, 0.62, 0.32).translate(0, 1.42, -0.15), 0);
  add(new THREE.SphereGeometry(0.2, 12, 8).translate(0, 1.92, -0.05), 1);
  for (const g of parts) for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
  const geometry = mergeGeometries(parts.map((g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]))), true);
  // mergeGeometries makes one group per input; remap them to our material indices
  geometry.groups.forEach((grp, i) => { grp.materialIndex = parts[i].groups[0].materialIndex; });
  geometry.computeBoundingBox();
  return { key: 'proc/bike', geometry, materials: mats, size: geometry.boundingBox.getSize(new THREE.Vector3()) };
}
