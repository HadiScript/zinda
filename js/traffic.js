import * as THREE from 'three';
import { CELL } from './roads.js';

// Vehicles placed on a road drive cell to cell, picking a random turn at each
// junction and U-turning at dead ends. Off-road vehicles stay parked.

const LANE = 1.85;
const up = new THREE.Vector3(0, 1, 0);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();

export class Traffic {
  constructor(scene, grid) {
    this.grid = grid;
    this.agents = [];
    // Head/tail light quads that follow each vehicle and glow at night
    const head = new THREE.BoxGeometry(0.22, 0.1, 0.02);
    const pair = (z) => {
      const a = head.clone().translate(-0.3, 0.42, z), b = head.clone().translate(0.3, 0.42, z);
      const g = new THREE.BufferGeometry();
      const pos = [...a.attributes.position.array, ...b.attributes.position.array];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const ia = [...a.index.array], off = a.attributes.position.count;
      g.setIndex([...ia, ...b.index.array].map((v, i) => (i < ia.length ? v : v + off)));
      g.computeVertexNormals();
      return g;
    };
    this.headMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0 });
    this.tailMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0 });
    this.heads = new THREE.InstancedMesh(pair(0.51), this.headMat, 512);
    this.tails = new THREE.InstancedMesh(pair(-0.51), this.tailMat, 512);
    this.heads.count = this.tails.count = 0;
    this.heads.frustumCulled = this.tails.frustumCulled = false;
    scene.add(this.heads, this.tails);
  }

  // item: { handle, def, x, z, rot, size } from the placement layer
  add(item) {
    const { i, j } = this.grid.cellAt(item.x, item.z);
    const cell = this.grid.get(i, j);
    const a = { item, from: cell, to: null, t: 0, yaw: item.rot || 0, speed: 0, parked: !cell };
    if (cell) {
      const ns = this.grid.neighbors(i, j);
      a.to = ns.length ? ns[Math.floor(Math.random() * ns.length)] : cell;
      a.t = 0.5;
      a.speed = (item.def.label === 'Motorbike' ? 13 : 8) + Math.random() * 4;
    }
    this.agents.push(a);
    this.place(a);
    return a;
  }

  remove(item) {
    this.agents = this.agents.filter((a) => a.item !== item);
  }

  place(a) {
    const it = a.item;
    if (a.parked || !a.to) {
      p.set(it.x, it.y, it.z);
    } else {
      const fx = a.from.i * CELL, fz = a.from.j * CELL, tx = a.to.i * CELL, tz = a.to.j * CELL;
      const dx = tx - fx, dz = tz - fz, L = Math.hypot(dx, dz) || 1;
      p.set(fx + dx * a.t - (dz / L) * LANE, a.from.y + (a.to.y - a.from.y) * a.t + 0.12, fz + dz * a.t + (dx / L) * LANE);
      it.x = p.x; it.z = p.z; it.y = p.y;
    }
    q.setFromAxisAngle(up, a.yaw);
    s.setScalar(it.def.scale);
    m.compose(p, q, s);
    it.handle.pool.set(it.handle, m);
  }

  update(dt, night) {
    let n = 0;
    for (const a of this.agents) {
      if (!a.parked && a.to) {
        // the road under us was erased → pull over and park
        if (!this.grid.has(a.from.i, a.from.j) || !this.grid.has(a.to.i, a.to.j)) a.parked = true;
        else {
          a.t += (a.speed * dt) / CELL;
          while (a.t >= 1) {
            a.t -= 1;
            const ns = this.grid.neighbors(a.to.i, a.to.j);
            const fwd = ns.filter((c) => c !== a.from);
            const next = fwd.length ? fwd[Math.floor(Math.random() * fwd.length)] : a.from;
            a.from = a.to; a.to = next;
          }
          const want = Math.atan2(a.to.i - a.from.i, a.to.j - a.from.j);
          const d = Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw));
          a.yaw += d * Math.min(1, dt * 7);
        }
      }
      this.place(a);
      // lights share the vehicle transform, stretched to its footprint
      const sz = a.item.size;
      s.set(sz.x, sz.y, sz.z);
      m.compose(p, q, s);
      this.heads.setMatrixAt(n, m); this.tails.setMatrixAt(n, m);
      n++;
    }
    this.heads.count = this.tails.count = Math.min(n, 512);
    this.heads.instanceMatrix.needsUpdate = this.tails.instanceMatrix.needsUpdate = true;
    this.headMat.opacity = night;
    this.tailMat.opacity = 0.3 + night * 0.7;
  }
}
