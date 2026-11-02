import * as THREE from 'three';
import { Pool } from './assets.js';
import { heightAt } from './world.js';

// Road network on a square grid. Each cell picks the Kenney tile that matches
// its neighbours (straight, bend, T, crossroad, dead end) automatically.

export const CELL = 7.5;
const N = 1, E = 2, S = 4, W = 8;
const DIRS = [[0, -1, N], [1, 0, E], [0, 1, S], [-1, 0, W]];

// Openings of each Kenney tile in its default orientation (+X = E, +Z = S)
const BASE = { 'road-straight': E | W, 'road-bend': W | S, 'road-intersection': W | E | S, 'road-crossroad': 15, 'road-end-round': E };
// Rotating a tile +90° about Y turns E→N, N→W, W→S, S→E
const rot1 = (m) => ((m & E) ? N : 0) | ((m & N) ? W : 0) | ((m & W) ? S : 0) | ((m & S) ? E : 0);

const TILE_FOR = {};
for (const [name, base] of Object.entries(BASE)) {
  let m = base;
  for (let k = 0; k < 4; k++) {
    if (!(m in TILE_FOR)) TILE_FOR[m] = { name, k };
    m = rot1(m);
  }
}
TILE_FOR[0] = { name: 'road-crossroad', k: 0 };

export const key = (i, j) => `${i},${j}`;

export class RoadGrid {
  constructor(scene, models) {
    this.cells = new Map();
    this.pools = {};
    for (const name of Object.keys(BASE)) {
      this.pools[name] = new Pool(scene, models[`road/${name}`], { capacity: 256, shadows: false });
      this.pools[name].mesh.receiveShadow = true;
    }
    this.onChange = null;
  }

  cellAt(x, z) { return { i: Math.round(x / CELL), j: Math.round(z / CELL) }; }
  center(i, j) { return { x: i * CELL, z: j * CELL }; }
  get(i, j) { return this.cells.get(key(i, j)); }
  has(i, j) { return this.cells.has(key(i, j)); }

  mask(i, j) {
    let m = 0;
    for (const [di, dj, bit] of DIRS) if (this.has(i + di, j + dj)) m |= bit;
    return m;
  }

  neighbors(i, j) {
    return DIRS.filter(([di, dj]) => this.has(i + di, j + dj)).map(([di, dj]) => this.get(i + di, j + dj));
  }

  // Roads need fairly level dry ground; returns the deck height
  check(i, j) {
    if (this.has(i, j)) return { ok: false, reason: 'Already a road here' };
    const { x, z } = this.center(i, j);
    const hs = [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([a, b]) => heightAt(x + a * CELL, z + b * CELL));
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (lo < 0.4) return { ok: false, reason: 'Roads can\'t go on water' };
    if (hi - lo > 3) return { ok: false, reason: 'Too steep for a road' };
    return { ok: true, y: hi + 0.04 };
  }

  add(i, j, { y, gen = null } = {}) {
    if (this.has(i, j)) return null;
    if (y == null) {
      const c = this.check(i, j);
      if (!c.ok) return null;
      y = c.y;
    }
    const cell = { i, j, y, gen, tile: null, handle: null };
    this.cells.set(key(i, j), cell);
    this.refresh(i, j);
    for (const [di, dj] of DIRS) this.refresh(i + di, j + dj);
    this.onChange?.();
    return cell;
  }

  remove(i, j) {
    const cell = this.get(i, j);
    if (!cell) return null;
    cell.handle.pool.remove(cell.handle);
    this.cells.delete(key(i, j));
    for (const [di, dj] of DIRS) this.refresh(i + di, j + dj);
    this.onChange?.();
    return cell;
  }

  refresh(i, j) {
    const cell = this.get(i, j);
    if (!cell) return;
    const { name, k } = TILE_FOR[this.mask(i, j)];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(i * CELL, cell.y, j * CELL),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (k * Math.PI) / 2),
      new THREE.Vector3(CELL, CELL, CELL)
    );
    if (cell.tile === name) { this.pools[name].set(cell.handle, m); return; }
    if (cell.handle) cell.handle.pool.remove(cell.handle);
    cell.handle = this.pools[name].add(m);
    cell.tile = name;
  }

  meshes() { return Object.values(this.pools).map((p) => p.mesh); }
}
