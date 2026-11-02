import * as THREE from 'three';
import { makeNoise } from './noise.js';
import { CELL } from './roads.js';
import { heightAt } from './world.js';
import { CITY, GROUND_H } from './layout.js';
import { makeGate, makeFountain } from './landmarks.js';

// A planned city in the spirit of Bahria Town Karachi: one grand boulevard
// with a green median, avenues branching off into gated precincts of villas,
// a grand mosque, a commercial district and a park with a dancing fountain.

const W = -14, E = 26;                 // boulevard ends (cell i)
const AVENUES = [-14, -4, 6, 16, 26];  // cross avenues (cell i)
const STREET_ROWS = [3, 8, 13, 18];    // precinct streets, mirrored north/south
const LIMIT = CITY.r - 12;

const inside = (i, j) => Math.hypot(i * CELL - CITY.x, j * CELL - CITY.z) <= LIMIT;

function road(grid, i, j) {
  if (grid.has(i, j)) return;
  const c = grid.check(i, j);
  grid.add(i, j, { y: c.ok ? c.y : heightAt(i * CELL, j * CELL) + 0.06, gen: 'road' });
}

export function generateTown(scene, grid, items) {
  const rand = makeNoise(4321).rand;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  let gid = 0;
  const gen = () => `town:${gid++}`;
  const extras = { gates: [], update: [] };
  const Y = GROUND_H;

  // ---------- boulevard: two carriageways joined at each end ----------
  for (let i = W; i <= E; i++) { road(grid, i, -1); road(grid, i, 1); }
  road(grid, W, 0); road(grid, E, 0);
  const median = new THREE.Mesh(new THREE.BoxGeometry((E - W - 1) * CELL, 0.45, CELL - 1),
    new THREE.MeshStandardMaterial({ color: '#5f8a3a', roughness: 0.95 }));
  median.position.set(((W + E) / 2) * CELL, Y + 0.2, 0);
  median.receiveShadow = true;
  scene.add(median);
  for (let i = W + 2; i <= E - 2; i += 3) {
    items.add({ type: 'light-curved-double', x: i * CELL, z: 0, rot: Math.PI / 2, y: Y + 0.4, gen: gen() });
    items.add({ type: (i % 2 ? 'ez-aspen' : 'ez-ash'), x: (i + 1.5) * CELL, z: 0, y: Y + 0.4, scale: 0.55, rot: rand() * 6.28, gen: gen() });
  }

  // ---------- avenues into each side ----------
  const sides = [1, -1];
  for (const a of AVENUES) {
    for (const s of sides) {
      for (let j = 2; j <= 20; j++) if (inside(a, s * j)) road(grid, a, s * j);
    }
  }
  // airport link: the west avenue runs on south to the terminal road
  for (let j = 2; j <= 14; j++) road(grid, W, -j);
  for (let i = -16; i <= 0; i++) road(grid, i, -14);

  // ---------- sectors between avenues ----------
  const SECTORS = [];
  for (let k = 0; k < AVENUES.length - 1; k++) for (const s of sides) SECTORS.push({ a: AVENUES[k], b: AVENUES[k + 1], s });
  const kind = (sec) => {
    if (sec.a === -4 && sec.s === 1) return 'mosque';
    if (sec.a === 6 && sec.s === 1) return 'commercial';
    if (sec.a === -4 && sec.s === -1) return 'park';
    return 'villas';
  };
  let precinct = 1;
  const VILLAS = ['villa-cream', 'villa-white', 'villa-sand', 'villa-grey'];

  for (const sec of SECTORS) {
    const type = kind(sec);
    const xa = sec.a * CELL, xb = sec.b * CELL, xm = (xa + xb) / 2, s = sec.s;

    if (type === 'villas') {
      // gate over the avenue entrance
      const gate = makeGate(`PRECINCT ${precinct}`);
      gate.position.set(xa, Y, s * 2 * CELL);
      scene.add(gate);
      extras.gates.push(gate);
      precinct++;
      // streets
      for (const r of STREET_ROWS) for (let i = sec.a + 1; i < sec.b; i++) if (inside(i, s * r)) road(grid, i, s * r);
      // two rows of villas between each pair of streets, facing their street
      for (let k = 0; k < STREET_ROWS.length - 1; k++) {
        const r1 = STREET_ROWS[k], r2 = STREET_ROWS[k + 1];
        for (const [street, dir] of [[r1, 1], [r2, -1]]) {
          const zStreet = s * street * CELL;
          const face = dir * s; // +1: villa front faces −z… toward the street side
          const edge = zStreet + face * (CELL / 2 + 0.3);
          const zc = edge + face * (3.5 + 10.5 / 2);
          const lot = (xb - xa - CELL) / 6;
          for (let n = 0; n < 6; n++) {
            const x = xa + CELL / 2 + lot * (n + 0.5);
            if (!inside(x / CELL, zc / CELL) || !inside(x / CELL, zStreet / CELL)) continue;
            if (!grid.has(Math.round(x / CELL), s * street)) continue;
            const rot = face > 0 ? Math.PI : 0;
            if (rand() < 0.1) { // an empty plot, a bit overgrown
              items.add({ type: 'ez-bush', x, z: zc, rot: rand() * 6.28, gen: gen() });
              continue;
            }
            items.add({ type: pick(VILLAS), x, z: zc, rot, gen: gen() });
            if (n % 3 === 1) items.add({ type: 'light-curved', x: x + lot / 2, z: edge, rot: face > 0 ? 0 : Math.PI, gen: gen() });
          }
        }
      }
    } else if (type === 'mosque') {
      const plaza = new THREE.Mesh(new THREE.BoxGeometry(xb - xa - CELL - 2, 0.3, 120),
        new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.8 }));
      plaza.position.set(xm, Y + 0.12, s * 75);
      plaza.receiveShadow = true;
      scene.add(plaza);
      items.add({ type: 'mosque', x: xm, z: s * 80, rot: s > 0 ? Math.PI : 0, y: Y + 0.25, scale: 0.78, gen: gen() });
      for (let k = -3; k <= 3; k++) {
        items.add({ type: 'ez-oak', x: xm + k * 10, z: s * 22, rot: rand() * 6.28, scale: 0.7, gen: gen() });
      }
    } else if (type === 'commercial') {
      for (const r of [3, 8, 13]) for (let i = sec.a + 1; i < sec.b; i++) if (inside(i, s * r)) road(grid, i, s * r);
      const TOWERS = ['glass-tower', 'glass-tower-tall', 'office-tower', 'office-tower-tall', 'brick-flats-tall', 'brick-flats'];
      for (const rowZ of [5.5, 10.5]) for (const di of [2.5, 5, 7.5]) {
        const x = xa + di * CELL, z = s * rowZ * CELL;
        if (!inside(x / CELL, z / CELL)) continue;
        items.add({ type: pick(TOWERS), x, z, rot: Math.floor(rand() * 4) * (Math.PI / 2), gen: gen() });
      }
    } else if (type === 'park') {
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(33, 48).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#b5ad9e', roughness: 0.8 }));
      const fz = s * 62;
      lawn.position.set(xm, Y + 0.05, fz);
      lawn.receiveShadow = true;
      scene.add(lawn);
      const fountain = makeFountain(22);
      fountain.group.position.set(xm, Y, fz);
      scene.add(fountain.group);
      extras.update.push(fountain.update);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        items.add({ type: 'light-curved', x: xm + Math.cos(a) * 25, z: fz + Math.sin(a) * 25, rot: -a + Math.PI / 2, gen: gen() });
        items.add({ type: pick(['ez-oak', 'ez-ash', 'ez-aspen']), x: xm + Math.cos(a + 0.2) * 30, z: fz + Math.sin(a + 0.2) * 30, rot: rand() * 6.28, scale: 0.65, gen: gen() });
      }
    }
  }

  // ---------- traffic ----------
  const cells = [...grid.cells.values()];
  const CARS = ['sedan', 'sedan', 'taxi', 'suv-luxury', 'van', 'delivery', 'police', 'sedan-sports', 'truck', 'garbage-truck', 'ambulance', 'bike', 'bike', 'bike'];
  for (let k = 0; k < 60; k++) {
    const c = cells[Math.floor(rand() * cells.length)];
    items.add({ type: CARS[k % CARS.length], x: c.i * CELL, z: c.j * CELL, y: c.y, gen: `car:${k}` });
  }

  function update(t, night) {
    for (const g of extras.gates) g.userData.signMat.emissiveIntensity = 0.15 + night * 1.4;
    for (const f of extras.update) f(t, night);
  }
  return { update };
}
