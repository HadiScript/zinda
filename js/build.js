import * as THREE from 'three';
import { CATALOG, CATEGORIES } from './catalog.js';
import { CELL } from './roads.js';

// Build mode: pick something from the palette, see a ghost under the cursor,
// click to place (drag to paint roads), R to rotate, eraser to remove.

const STORE = 'zinda.build.v1';

export class Builder {
  constructor({ scene, camera, canvas, controls, items, grid, heightAt, pickTargets, toast, sfx }) {
    Object.assign(this, { scene, camera, canvas, controls, items, grid, heightAt, pickTargets, toast, sfx });
    this.active = false;
    this.tool = 'road';
    this.rot = 0;
    this.cat = 'road';
    this.ray = new THREE.Raycaster();
    this.hit = null;
    this.painting = false;

    this.state = this.load();
    this.buildGhosts();
    this.buildUI();
    this.bindPointer();
  }

  // ---------- persistence ----------
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      // Erasures from older layouts point at scenery that no longer exists;
      // keep the player's own roads and items, drop those
      const current = s?.v === 3;
      if (s) return { roads: s.roads || [], roadsRemoved: current ? s.roadsRemoved || [] : [], items: s.items || [], removed: current ? s.removed || [] : [] };
    } catch {}
    return { roads: [], roadsRemoved: [], items: [], removed: [] };
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const items = this.items.list.filter((it) => it.user).map((it) => ({
        type: it.type, x: +it.x.toFixed(2), z: +it.z.toFixed(2), rot: +it.rot.toFixed(3),
        ...(it.def.kind === 'vehicle' && it.agent && !it.agent.parked ? { onRoad: true } : {}),
      }));
      const roads = [...this.grid.cells.values()].filter((c) => !c.gen).map((c) => [c.i, c.j]);
      const out = { v: 3, roads, roadsRemoved: this.state.roadsRemoved, items, removed: this.state.removed };
      try { localStorage.setItem(STORE, JSON.stringify(out)); } catch {}
    }, 300);
  }

  // Called once the generated world exists: replay the player's edits on top
  restore() {
    const gone = new Set(this.state.removed);
    for (const it of [...this.items.list]) if (it.gen && gone.has(it.gen)) this.items.remove(it);
    for (const k of this.state.roadsRemoved) {
      const [i, j] = k.split(',').map(Number);
      this.grid.remove(i, j);
    }
    for (const [i, j] of this.state.roads) this.grid.add(i, j);
    for (const it of this.state.items) this.items.add({ ...it, user: true });
  }

  // ---------- ghosts ----------
  buildGhosts() {
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#7dff6a', transparent: true, opacity: 0.45, depthWrite: false });
    this.roadGhost = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.3, CELL), this.ghostMat);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff5f7a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ghost = new THREE.Group();
    this.ghost.visible = this.roadGhost.visible = this.ring.visible = false;
    this.scene.add(this.ghost, this.roadGhost, this.ring);
  }

  setGhostModel(type) {
    this.ghost.clear();
    const def = CATALOG[type];
    if (!def?.model) return;
    const model = this.items.models[def.model.join('/')];
    const mesh = new THREE.Mesh(model.geometry, this.ghostMat);
    mesh.scale.setScalar(def.scale);
    this.ghost.add(mesh);
  }

  // ---------- UI ----------
  buildUI() {
    this.panel = document.getElementById('build');
    const tabs = this.panel.querySelector('.build-tabs');
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'btab'; b.dataset.cat = c.id; b.type = 'button';
      b.innerHTML = `<span>${c.emoji}</span>${c.label}`;
      b.onclick = () => this.showCat(c.id);
      tabs.appendChild(b);
    }
    this.grid_el = this.panel.querySelector('.build-items');
    document.getElementById('build-rotate').onclick = () => this.rotate();
    document.getElementById('build-erase').onclick = () => this.select(this.tool === 'erase' ? this.lastTool || 'road' : 'erase');
    document.getElementById('build-close').onclick = () => this.toggle(false);
    this.showCat('road');
  }

  showCat(cat) {
    this.cat = cat;
    this.panel.querySelectorAll('.btab').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
    this.grid_el.innerHTML = '';
    for (const [id, def] of Object.entries(CATALOG)) {
      if (def.cat !== cat || def.hidden) continue;
      const b = document.createElement('button');
      b.className = 'bitem'; b.dataset.id = id; b.type = 'button';
      b.innerHTML = `<span class="be">${def.emoji}</span><span class="bl">${def.label}</span>`;
      b.onclick = () => this.select(id);
      this.grid_el.appendChild(b);
    }
    if (cat === 'road') this.grid_el.insertAdjacentHTML('beforeend', '<p class="bhint">Click or drag on the ground to lay road. Tiles join up automatically, and cars drive on them.</p>');
    if (cat === 'vehicle') this.grid_el.insertAdjacentHTML('beforeend', '<p class="bhint">Drop a vehicle on a road and it drives off. Anywhere else, it parks.</p>');
    this.syncSelected();
  }

  select(id) {
    if (id !== 'erase') this.lastTool = id;
    this.tool = id;
    if (id !== 'erase' && id !== 'road') this.setGhostModel(id);
    this.syncSelected();
  }

  syncSelected() {
    this.panel.querySelectorAll('.bitem').forEach((b) => b.classList.toggle('active', b.dataset.id === this.tool));
    document.getElementById('build-erase').classList.toggle('on', this.tool === 'erase');
    document.body.classList.toggle('erasing', this.active && this.tool === 'erase');
  }

  rotate() {
    this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2);
    this.sfx.stroke();
  }

  toggle(on = !this.active) {
    this.active = on;
    this.panel.hidden = !on;
    document.getElementById('btn-build').classList.toggle('on', on);
    document.body.classList.toggle('building', on);
    if (!on) { this.ghost.visible = this.roadGhost.visible = this.ring.visible = false; }
    this.syncSelected();
  }

  // ---------- pointer ----------
  groundHit(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.pickTargets(), false);
    return hits[0]?.point || null;
  }

  bindPointer() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      if (this.tool === 'road') {
        this.painting = true;
        this.lastPaint = null;
        this.controls.enabled = false;
        this.paintAt(this.groundHit(e));
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.hit = this.groundHit(e);
      if (this.painting) this.paintAt(this.hit);
      this.updateGhost();
    });
    addEventListener('pointerup', (e) => {
      if (!this.active) return;
      if (this.painting) {
        this.painting = false;
        this.controls.enabled = true;
        this.save();
        return;
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || e.target !== this.canvas) { down = null; return; }
      down = null;
      const p = this.groundHit(e);
      if (!p) return;
      if (this.tool === 'erase') this.eraseAt(p);
      else this.placeAt(p);
    });
    addEventListener('keydown', (e) => {
      if (!this.active || e.target.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') this.rotate();
      if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') this.select('erase');
      if (e.key === 'Escape') this.toggle(false);
    });
  }

  // Fast drags skip cells, so walk an L-shaped path from the last painted cell
  paintAt(p) {
    if (!p) return;
    const c = this.grid.cellAt(p.x, p.z);
    const from = this.lastPaint || c;
    let { i, j } = from;
    this.paintCell(i, j);
    while (i !== c.i) { i += Math.sign(c.i - i); this.paintCell(i, j); }
    while (j !== c.j) { j += Math.sign(c.j - j); this.paintCell(i, j); }
    this.lastPaint = c;
  }

  paintCell(i, j) {
    if (this.grid.has(i, j)) return;
    const c = this.grid.check(i, j);
    if (!c.ok) {
      if (this.lastWarn !== c.reason) { this.toast(`🚧 ${c.reason}`); this.lastWarn = c.reason; }
      return;
    }
    this.lastWarn = null;
    // clear scenery standing on the new road
    const { x, z } = this.grid.center(i, j);
    for (const it of [...this.items.list]) {
      if (Math.abs(it.x - x) < CELL * 0.55 && Math.abs(it.z - z) < CELL * 0.55 && it.def.kind !== 'vehicle') this.forget(it);
    }
    this.grid.add(i, j, { y: c.y });
    this.sfx.stroke();
  }

  placeAt(p) {
    const def = CATALOG[this.tool];
    if (!def) return;
    if (this.heightAt(p.x, p.z) < 0.3 && !this.grid.has(...Object.values(this.grid.cellAt(p.x, p.z)))) {
      this.toast('🌊 That spot is under water');
      return;
    }
    let { x, z } = p;
    let rot = this.rot;
    if (def.kind === 'vehicle') {
      const { i, j } = this.grid.cellAt(x, z);
      if (this.grid.has(i, j)) ({ x, z } = this.grid.center(i, j));
    }
    const it = this.items.add({ type: this.tool, x, z, rot, user: true });
    if (!it) return;
    this.sfx.pop();
    if (def.kind === 'vehicle' && it.agent && !it.agent.parked) this.toast(`${def.emoji} ${def.label} hit the road!`);
    this.save();
  }

  // Remove an item; generated scenery is remembered so it stays gone
  forget(it) {
    if (it.gen && !it.gen.startsWith('car:')) this.state.removed.push(it.gen);
    this.items.remove(it);
  }

  eraseAt(p) {
    const it = this.items.nearest(p.x, p.z, 0.5);
    const { i, j } = this.grid.cellAt(p.x, p.z);
    const cell = this.grid.get(i, j);
    if (it && (!cell || it.def.kind === 'vehicle' || Math.hypot(it.x - p.x, it.z - p.z) < it.radius)) {
      this.forget(it);
    } else if (cell) {
      if (cell.gen) this.state.roadsRemoved.push(`${i},${j}`);
      this.grid.remove(i, j);
    } else return;
    this.sfx.release();
    this.save();
  }

  updateGhost() {
    const p = this.hit;
    this.ghost.visible = this.roadGhost.visible = this.ring.visible = false;
    if (!this.active || !p) return;
    if (this.tool === 'road') {
      const { i, j } = this.grid.cellAt(p.x, p.z);
      const c = this.grid.check(i, j);
      const { x, z } = this.grid.center(i, j);
      this.roadGhost.position.set(x, (c.y ?? this.heightAt(x, z)) + 0.2, z);
      this.ghostMat.color.set(c.ok ? '#7dff6a' : '#ff5f7a');
      this.roadGhost.visible = true;
    } else if (this.tool === 'erase') {
      const it = this.items.nearest(p.x, p.z, 0.5);
      const { i, j } = this.grid.cellAt(p.x, p.z);
      if (it) {
        this.ring.position.set(it.x, it.y + 0.3, it.z);
        this.ring.scale.setScalar(it.radius);
        this.ring.visible = true;
      } else if (this.grid.has(i, j)) {
        const c = this.grid.get(i, j);
        this.ring.position.set(i * CELL, c.y + 0.3, j * CELL);
        this.ring.scale.setScalar(CELL * 0.6);
        this.ring.visible = true;
      }
    } else {
      let { x, z } = p;
      const def = CATALOG[this.tool];
      if (def?.kind === 'vehicle') {
        const { i, j } = this.grid.cellAt(x, z);
        if (this.grid.has(i, j)) ({ x, z } = this.grid.center(i, j));
      }
      const wet = this.heightAt(x, z) < 0.3 && !this.grid.has(...Object.values(this.grid.cellAt(x, z)));
      this.ghostMat.color.set(wet ? '#ff5f7a' : '#7dff6a');
      this.ghost.position.set(x, this.items.ground(x, z), z);
      this.ghost.rotation.y = this.rot;
      this.ghost.visible = true;
    }
  }
}
