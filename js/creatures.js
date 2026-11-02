import * as THREE from 'three';
import { heightAt, randomLand, randomWater } from './world.js';

// DoodleNet label → how the creature lives in the world
const SWIM = ['fish', 'whale', 'shark', 'dolphin', 'octopus', 'crab', 'lobster', 'submarine', 'sailboat', 'speedboat',
  'cruise ship', 'canoe', 'sea turtle', 'mermaid', 'swan', 'duck', 'snorkel', 'jellyfish'];
const FLY = ['bird', 'butterfly', 'bee', 'mosquito', 'dragon', 'airplane', 'helicopter', 'bat', 'owl', 'parrot', 'angel',
  'hot air balloon', 'parachute', 'flying saucer', 'dragonfly', 'feather'];
const SKY = ['sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'snowflake', 'rain', 'tornado', 'hurricane', 'hexagon'];
const ROOT = ['tree', 'flower', 'palm tree', 'cactus', 'mushroom', 'grass', 'bush', 'leaf', 'house plant', 'house', 'castle',
  'tent', 'windmill', 'lighthouse', 'the eiffel tower', 'skyscraper', 'barn', 'church', 'hospital', 'igloo', 'bridge',
  'garden', 'mountain', 'campfire', 'fence', 'pond', 'traffic light', 'stop sign', 'streetlight', 'broccoli', 'carrot'];

export const BEHAVIORS = {
  swim: { label: 'Swim', emoji: '🐟', size: 6.5 },
  fly: { label: 'Fly', emoji: '🕊️', size: 6 },
  walk: { label: 'Walk', emoji: '🐾', size: 5.5 },
  root: { label: 'Root', emoji: '🌱', size: 8.5 },
  sky: { label: 'Sky', emoji: '✨', size: 30 },
};

export function behaviorFor(label = '') {
  const l = label.toLowerCase();
  if (SWIM.includes(l)) return 'swim';
  if (FLY.includes(l)) return 'fly';
  if (SKY.includes(l)) return 'sky';
  if (ROOT.includes(l)) return 'root';
  return 'walk';
}

const NAMES = {
  swim: ['Bubbles', 'Finn', 'Splash', 'Coral', 'Ripple', 'Marina', 'Gill', 'Tide', 'Pearl'],
  fly: ['Breeze', 'Zephyr', 'Pip', 'Skye', 'Feather', 'Kite', 'Hoot', 'Wren', 'Gale'],
  walk: ['Biscuit', 'Pebble', 'Mochi', 'Ziggy', 'Tofu', 'Noodle', 'Pickle', 'Waffle', 'Bean'],
  root: ['Fern', 'Willow', 'Sprout', 'Maple', 'Moss', 'Bramble', 'Juniper', 'Basil'],
  sky: ['Lumen', 'Nimbus', 'Aurora', 'Halo', 'Comet', 'Nova', 'Zenith'],
};
export function makeName(behavior) {
  const list = NAMES[behavior] || NAMES.walk;
  return list[Math.floor(Math.random() * list.length)];
}

const capGeo = new THREE.SphereGeometry(1, 10, 8);
const hitGeo = new THREE.PlaneGeometry(2.6, 2.6);

// Strokes are arrays of {x, y} in [-1, 1] (y points down, like the drawing pad)
function strokesToGroup(strokes, color) {
  const group = new THREE.Group();
  const front = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.1 });
  const back = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.4, roughness: 0.6 });
  const R = 0.075;
  const addCap = (p, mat, z) => {
    const m = new THREE.Mesh(capGeo, mat);
    m.scale.setScalar(R); m.position.set(p.x, -p.y, z); m.castShadow = true;
    group.add(m);
  };
  for (const s of strokes) {
    if (s.length < 2) {
      const dot = new THREE.Mesh(capGeo, front);
      dot.scale.setScalar(R * 1.8); dot.position.set(s[0].x, -s[0].y, 0.02);
      group.add(dot);
      continue;
    }
    const pts = s.map((p) => new THREE.Vector3(p.x, -p.y, 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, Math.min(220, Math.max(12, pts.length * 3)), R, 6, false);
    const tube = new THREE.Mesh(geo, front);
    tube.castShadow = true;
    const ghost = new THREE.Mesh(geo, back);
    ghost.position.z = -0.16;
    group.add(tube, ghost);
    addCap(s[0], front, 0); addCap(s[s.length - 1], front, 0);
  }
  return group;
}

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const tmpV = new THREE.Vector3();

class Creature {
  constructor(data, opts) {
    this.data = data;
    this.behavior = data.behavior;
    const cfg = BEHAVIORS[this.behavior] || BEHAVIORS.walk;
    this.size = cfg.size * (0.85 + Math.random() * 0.3);
    this.phase = Math.random() * 100;
    this.facing = 1;

    this.root = new THREE.Group();
    this.root.userData.creature = this;
    this.pivot = new THREE.Group();
    this.body = strokesToGroup(data.strokes, data.color);
    if (this.behavior === 'root') {
      const box = new THREE.Box3().setFromObject(this.body);
      this.body.position.y = -box.min.y;
    }
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.userData.creature = this;
    if (this.behavior === 'root') hit.position.y = 1.2;
    this.joy = new THREE.Group(); // separate layer for click reactions
    this.joy.add(this.body, hit);
    this.pivot.add(this.joy);
    this.root.add(this.pivot);
    this.root.scale.setScalar(this.size / 2);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.initBehavior();
    this.root.position.copy(this.homePosition());

    // Spawn: arc in from in front of the camera, or just grow in place
    this.spawnT = 0;
    this.spawnDur = opts.from ? 1.8 : 1.1;
    this.spawnDelay = opts.delay || 0;
    this.from = opts.from ? opts.from.clone() : null;
    this.root.scale.setScalar(0.0001);
  }

  initBehavior() {
    const b = this.behavior;
    if (b === 'walk') { this.pos.copy(randomLand(1, 14)); this.target = this.pos.clone(); this.speed = 2.5 + Math.random() * 2.5; this.pause = 0; }
    if (b === 'swim') { this.pos.copy(randomWater()); this.target = this.pos.clone(); this.speed = 4 + Math.random() * 3; this.leap = -1; this.leapIn = 3 + Math.random() * 6; }
    if (b === 'root') { this.pos.copy(randomLand(1.2, 7)); }
    if (b === 'fly') {
      this.center = randomLand(0, 30).setY(0);
      this.radius = 20 + Math.random() * 30; this.alt = 32 + Math.random() * 28;
      this.ang = Math.random() * Math.PI * 2; this.angSpeed = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4);
    }
    if (b === 'sky') {
      this.ang = Math.random() * Math.PI * 2; this.radius = 150 + Math.random() * 80; this.alt = 120 + Math.random() * 30;
    }
  }

  homePosition() {
    const b = this.behavior;
    if (b === 'walk') return tmpV.set(this.pos.x, heightAt(this.pos.x, this.pos.z) + this.size * 0.5, this.pos.z);
    if (b === 'swim') return tmpV.set(this.pos.x, this.size * 0.22, this.pos.z);
    if (b === 'root') return tmpV.set(this.pos.x, heightAt(this.pos.x, this.pos.z) - 0.2, this.pos.z);
    if (b === 'fly') return tmpV.set(this.center.x + Math.cos(this.ang) * this.radius, this.alt, this.center.z + Math.sin(this.ang) * this.radius);
    return tmpV.set(Math.cos(this.ang) * this.radius, this.alt, Math.sin(this.ang) * this.radius);
  }

  // fx: { arrive(c), splash(c) } — hooks for particles and sound
  update(dt, t, camera, fx) {
    if (this.spawnDelay > 0) { this.spawnDelay -= dt; return; }
    const tt = t + this.phase;

    if (this.leaving != null) {
      this.leaving += dt / 1.2;
      const u = Math.min(1, this.leaving);
      this.root.position.y += dt * 25 * u;
      this.root.scale.setScalar(Math.max(0.0001, (this.size / 2) * (1 - u * u)));
      this.pivot.rotation.z += dt * 8;
      this.faceCamera(camera);
      return;
    }

    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / this.spawnDur);
      const e = easeOut(this.spawnT);
      const home = this.homePosition().clone();
      if (this.from) {
        const mid = this.from.clone().lerp(home, 0.5); mid.y += 18;
        const a = this.from.clone().lerp(mid, e), b = mid.lerp(home, e);
        this.root.position.copy(a.lerp(b, e));
        this.pivot.rotation.z = (1 - e) * Math.PI * 2;
      } else {
        this.root.position.copy(home);
      }
      const pop = e < 1 ? e * (1 + Math.sin(e * Math.PI) * 0.25) : 1;
      this.root.scale.setScalar(Math.max(0.0001, (this.size / 2) * pop));
      if (this.spawnT >= 1) { this.pivot.rotation.z = 0; fx.arrive(this); }
      this.faceCamera(camera);
      return;
    }

    const b = this.behavior;
    if (b === 'walk') this.walk(dt, tt);
    else if (b === 'swim') this.swim(dt, tt, fx);
    else if (b === 'fly') this.fly(dt, tt);
    else if (b === 'root') this.pivot.rotation.z = Math.sin(tt * 1.4) * 0.06;
    else if (b === 'sky') {
      this.ang += dt * 0.012;
      this.root.position.copy(this.homePosition());
      this.root.position.y += Math.sin(tt * 0.4) * 2;
      this.pivot.rotation.z = Math.sin(tt * 0.3) * 0.12;
    }

    // Happy hop + spin when someone clicks it
    if (this.reactT != null) {
      this.reactT += dt / 0.9;
      const u = Math.min(1, this.reactT);
      this.joy.position.y = Math.sin(Math.PI * u) * 1.2;
      this.joy.rotation.z = u < 1 ? easeOut(u) * Math.PI * 2 : 0;
      if (u >= 1) this.reactT = null;
    }
    this.faceCamera(camera);
  }

  react() { this.reactT = 0; }
  leave() { this.leaving = 0; }


  walk(dt, t) {
    if (this.pause > 0) {
      this.pause -= dt;
      this.pivot.position.y *= 0.9;
      this.vel.set(0, 0, 0);
    } else {
      tmpV.subVectors(this.target, this.pos).setY(0);
      if (tmpV.length() < 1) {
        this.target = randomLand(0.8, 16, this.pos, 22);
        if (Math.random() < 0.35) this.pause = 1 + Math.random() * 2.5;
      } else {
        tmpV.normalize().multiplyScalar(this.speed * dt);
        const nx = this.pos.x + tmpV.x, nz = this.pos.z + tmpV.z;
        if (heightAt(nx, nz) < 0.5) this.target = randomLand(0.8, 16, this.pos, 22);
        else { this.pos.x = nx; this.pos.z = nz; this.vel.copy(tmpV); }
      }
      this.pivot.position.y = Math.abs(Math.sin(t * 9)) * 0.35;
      this.pivot.rotation.z = Math.sin(t * 9) * 0.08;
    }
    this.root.position.set(this.pos.x, heightAt(this.pos.x, this.pos.z) + this.size * 0.5, this.pos.z);
  }

  swim(dt, t, fx) {
    tmpV.subVectors(this.target, this.pos).setY(0);
    if (tmpV.length() < 1.5) this.target = randomWater(this.pos, 35);
    else {
      tmpV.normalize().multiplyScalar(this.speed * dt);
      const nx = this.pos.x + tmpV.x, nz = this.pos.z + tmpV.z;
      if (heightAt(nx, nz) > -0.9) this.target = randomWater(this.pos, 35);
      else { this.pos.x = nx; this.pos.z = nz; this.vel.copy(tmpV); }
    }
    let y = this.size * 0.22 + Math.sin(t * 2) * 0.2;
    this.pivot.rotation.z = Math.sin(t * 6) * 0.1;
    this.leapIn -= dt;
    if (this.leapIn <= 0 && this.leap < 0) { this.leap = 0; fx.splash(this); }
    if (this.leap >= 0) {
      this.leap += dt / 1.3;
      const u = Math.min(1, this.leap);
      y += Math.sin(Math.PI * u) * this.size * 1.4;
      this.pivot.rotation.z = (0.5 - u) * 1.3;
      if (u >= 1) { this.leap = -1; this.leapIn = 4 + Math.random() * 8; fx.splash(this); }
    }
    this.root.position.set(this.pos.x, y, this.pos.z);
  }

  fly(dt, t) {
    this.ang += (this.angSpeed / this.radius) * dt;
    const prev = this.root.position.clone();
    this.root.position.copy(this.homePosition());
    this.root.position.y += Math.sin(t * 1.3) * 2;
    this.vel.subVectors(this.root.position, prev);
    this.pivot.scale.y = 1 + Math.sin(t * 11) * 0.18;
    this.pivot.rotation.z = Math.sin(t * 1.3) * 0.12;
  }

  faceCamera(camera) {
    const p = this.root.position;
    this.root.lookAt(camera.position.x, p.y, camera.position.z);
    const right = tmpV.setFromMatrixColumn(camera.matrixWorld, 0);
    const s = this.vel.dot(right);
    if (Math.abs(s) > 0.002) this.facing = Math.sign(s);
    this.pivot.scale.x += (this.facing - this.pivot.scale.x) * 0.15;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry !== capGeo && o.geometry !== hitGeo) o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}

let heartTex = null;
function heartTexture() {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 4, 10, 22, 10);
  g.bezierCurveTo(28, 10, 32, 16, 32, 20);
  g.bezierCurveTo(32, 16, 36, 10, 42, 10);
  g.bezierCurveTo(60, 10, 60, 36, 32, 56);
  g.fill();
  heartTex = new THREE.CanvasTexture(c);
  return heartTex;
}

// kind: 'spark' (spawn), 'splash' (water droplets), 'hearts' (click reaction)
class Burst {
  constructor(scene, at, color, kind = 'spark') {
    const n = kind === 'hearts' ? 14 : kind === 'splash' ? 40 : 90;
    this.gravity = kind === 'hearts' ? -1.5 : kind === 'splash' ? 14 : 4;
    this.vel = [];
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr.set([at.x, at.y, at.z], i * 3);
      const v = new THREE.Vector3().randomDirection();
      if (kind === 'splash') v.set(v.x * 0.6, Math.abs(v.y) + 0.8, v.z * 0.6).multiplyScalar(5 + Math.random() * 6);
      else if (kind === 'hearts') v.set(v.x * 2, 2 + Math.random() * 2, v.z * 2);
      else v.multiplyScalar(6 + Math.random() * 10);
      this.vel.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: kind === 'splash' ? '#e9fffb' : kind === 'hearts' ? '#ff5fa2' : color,
      size: kind === 'hearts' ? 1.6 : kind === 'splash' ? 0.45 : 0.6,
      map: kind === 'hearts' ? heartTexture() : null,
      transparent: true, depthWrite: false,
      blending: kind === 'splash' ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    this.life = 0;
    this.scene = scene;
    scene.add(this.points);
  }
  update(dt) {
    this.life += dt;
    const p = this.points.geometry.attributes.position;
    this.vel.forEach((v, i) => {
      v.multiplyScalar(0.95); v.y -= this.gravity * dt;
      p.setXYZ(i, p.getX(i) + v.x * dt, p.getY(i) + v.y * dt, p.getZ(i) + v.z * dt);
    });
    p.needsUpdate = true;
    this.points.material.opacity = Math.max(0, 1 - this.life / 1.4);
    if (this.life > 1.4) {
      this.scene.remove(this.points);
      this.points.geometry.dispose(); this.points.material.dispose();
      return false;
    }
    return true;
  }
}

const MAX_CREATURES = 60;

export class CreatureManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.bursts = [];
    this.onChange = null;
  }

  add(data, opts = {}) {
    const c = new Creature(data, opts);
    this.scene.add(c.root);
    this.list.push(c);
    while (this.list.length > MAX_CREATURES) this.remove(this.list[0]);
    this.onChange?.();
    return c;
  }

  remove(c) {
    this.scene.remove(c.root);
    c.dispose();
    this.list = this.list.filter((x) => x !== c);
    this.onChange?.();
  }

  burst(at, color, kind) {
    this.bursts.push(new Burst(this.scene, at, color, kind));
  }

  release(c) {
    c.leave();
    this.burst(c.root.position, c.data.color, 'spark');
    setTimeout(() => this.remove(c), 1300);
  }

  update(dt, t, camera) {
    const fx = {
      arrive: (c) => { if (c.from) { this.burst(c.root.position, c.data.color); this.onArrive?.(c); } },
      splash: (c) => { this.burst(tmpV.set(c.pos.x, 0.3, c.pos.z).clone(), null, 'splash'); this.onSplash?.(c); },
    };
    for (const c of this.list) c.update(dt, t, camera, fx);
    this.bursts = this.bursts.filter((b) => b.update(dt));
  }

  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.list.map((c) => c.root), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.creature) o = o.parent;
      if (o) return o.userData.creature;
    }
    return null;
  }

  serialize() {
    return this.list.filter((c) => c.leaving == null).map((c) => c.data);
  }
}
