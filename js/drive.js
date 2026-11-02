import * as THREE from 'three';

// Drive mode: take the wheel of a car. WASD / arrows to drive, Space to brake,
// H to honk. A chase camera trails behind with a little lag so it feels smooth.

const MAX_FWD = 34, MAX_REV = -10, ACCEL = 18, BRAKE = 40, DRAG = 0.6;

export class Driver {
  constructor({ scene, camera, model, scale, ground, isRoad, isLand, sfx }) {
    this.camera = camera;
    this.ground = ground;
    this.isRoad = isRoad;
    this.isLand = isLand;
    this.sfx = sfx;
    this.active = false;
    this.keys = new Set();
    this.speed = 0;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.look = new THREE.Vector3();

    this.car = new THREE.Group();
    const body = new THREE.Mesh(model.geometry, model.materials);
    body.scale.setScalar(scale);
    body.castShadow = true;
    this.car.add(body);
    // headlights that actually light the road at night
    this.lamps = [-0.5, 0.5].map((x) => {
      const l = new THREE.SpotLight('#fff1d0', 0, 60, 0.5, 0.6, 1.4);
      l.position.set(x, 1, 1.8);
      l.target.position.set(x * 2, 0, 20);
      this.car.add(l, l.target);
      return l;
    });
    this.car.visible = false;
    scene.add(this.car);

    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'h') this.sfx.boop();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  // solids: [{x, z, rot, hx, hz}] boxes (buildings) or [{x, z, r}] circles (trunks),
  // bucketed into a coarse hash so each step only checks its neighbourhood
  setSolids(solids) {
    this.hash = new Map();
    for (const s of solids) {
      const reach = s.r ?? Math.hypot(s.hx, s.hz);
      for (let a = Math.floor((s.x - reach) / 20); a <= Math.floor((s.x + reach) / 20); a++) {
        for (let b = Math.floor((s.z - reach) / 20); b <= Math.floor((s.z + reach) / 20); b++) {
          const k = a * 4096 + b;
          if (!this.hash.has(k)) this.hash.set(k, []);
          this.hash.get(k).push(s);
        }
      }
    }
  }

  blocked(x, z) {
    const list = this.hash?.get(Math.floor(x / 20) * 4096 + Math.floor(z / 20));
    if (!list) return false;
    for (const s of list) {
      const dx = x - s.x, dz = z - s.z;
      if (s.r != null) { if (dx * dx + dz * dz < (s.r + 1) ** 2) return true; continue; }
      const c = Math.cos(s.rot), n = Math.sin(s.rot);
      const lx = dx * c - dz * n, lz = dx * n + dz * c;
      if (Math.abs(lx) < s.hx + 1 && Math.abs(lz) < s.hz + 1) return true;
    }
    return false;
  }

  start(x, z, yaw) {
    this.active = true;
    this.speed = 0;
    this.yaw = yaw;
    this.pos.set(x, this.ground(x, z), z);
    this.car.visible = true;
    this.camPos.copy(this.camera.position);
    this.look.copy(this.pos);
  }

  stop() {
    this.active = false;
    this.car.visible = false;
    this.keys.clear();
  }

  // touch / on-screen buttons feed the same key set
  press(k, down) { if (down) this.keys.add(k); else this.keys.delete(k); }

  update(dt, night) {
    if (!this.active) return;
    const k = this.keys;
    const fwd = k.has('w') || k.has('arrowup');
    const back = k.has('s') || k.has('arrowdown');
    const left = k.has('a') || k.has('arrowleft');
    const right = k.has('d') || k.has('arrowright');
    const onRoad = this.isRoad(this.pos.x, this.pos.z);
    const top = MAX_FWD * (onRoad ? 1 : 0.55);

    if (k.has(' ')) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    else if (fwd) this.speed += (this.speed < 0 ? BRAKE : ACCEL) * dt;
    else if (back) this.speed -= (this.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else this.speed -= this.speed * DRAG * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REV, Math.max(top, Math.min(this.speed, MAX_FWD)));
    if (this.speed > top) this.speed -= (this.speed - top) * 2 * dt; // grass slows you down

    // steering tightens at low speed and gently eases off at high speed
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const grip = Math.min(1, Math.abs(this.speed) / 6) * (1 - Math.abs(this.speed) / (MAX_FWD * 2.2));
    this.yaw += steer * grip * 1.9 * dt * Math.sign(this.speed || 1);

    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    if (this.isLand(nx, nz) && !this.blocked(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else {
      // bump off walls and the shoreline
      if (Math.abs(this.speed) > 8) this.sfx.pop();
      this.speed *= -0.3;
    }

    const y = this.ground(this.pos.x, this.pos.z);
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 12);
    this.car.position.copy(this.pos);
    this.car.rotation.y = this.yaw;
    // lean into turns a touch
    this.car.rotation.z = THREE.MathUtils.lerp(this.car.rotation.z, -steer * grip * 0.06, dt * 6);
    for (const l of this.lamps) l.intensity = night * 40;

    // chase camera: sits behind and above, pulled back further at speed
    const back_ = 13 + Math.abs(this.speed) * 0.18;
    const want = new THREE.Vector3(
      this.pos.x - Math.sin(this.yaw) * back_, this.pos.y + 5.5 + Math.abs(this.speed) * 0.04, this.pos.z - Math.cos(this.yaw) * back_);
    want.y = Math.max(want.y, this.ground(want.x, want.z) + 2);
    const a = 1 - Math.exp(-dt * 4);
    this.camPos.lerp(want, a);
    this.look.lerp(new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 6, this.pos.y + 1.5, this.pos.z + Math.cos(this.yaw) * 6), 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
  }

  get kmh() { return Math.round(Math.abs(this.speed) * 3.6); }
}
