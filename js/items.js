import * as THREE from 'three';
import { Pool } from './assets.js';
import { CATALOG, makeBike } from './catalog.js';

// Every placed object (generated scenery and things the player builds) lives
// here: one instanced pool per model, plus night glow for lamps and lit windows.

const up = new THREE.Vector3(0, 1, 0);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Kenney building textures use a light-blue swatch for glass; light some of it at night
function addWindowGlow(material, night) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying vec3 vWPos;
        float hash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float glass = step(0.55, c.b) * step(0.18, c.b - c.r) * step(c.r, c.g);
          float lit = step(0.45, hash13(floor(vWPos * vec3(0.55, 0.38, 0.55))));
          vec3 warm = mix(vec3(1.0, 0.7, 0.38), vec3(0.8, 0.9, 1.0), step(0.85, hash13(floor(vWPos * 0.3) + 7.0)));
          totalEmissiveRadiance += glass * lit * uNight * warm * 1.1;
        }`);
  };
  material.customProgramCacheKey = () => 'windows';
}

export class Items {
  constructor(scene, models, { ground, traffic }) {
    this.scene = scene;
    this.models = { ...models, 'proc/bike': makeBike() };
    this.ground = ground;
    this.traffic = traffic;
    this.pools = {};
    this.list = [];
    this.night = { value: 0 };
    this.onChange = null;

    const tex = glowTexture();
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe1a0' });
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 10, 6), this.bulbMat, 1024);
    this.poolMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), this.poolMat, 1024);
    this.bulbs.count = this.glows.count = 0;
    this.bulbs.frustumCulled = this.glows.frustumCulled = false;
    scene.add(this.bulbs, this.glows);
  }

  pool(def) {
    const k = def.model.join('/');
    if (!this.pools[k]) {
      const model = this.models[k];
      if (!model) throw new Error(`Model not loaded: ${k}`);
      if (def.windows) for (const mat of model.materials || []) if (!mat.userData.windows) { addWindowGlow(mat, this.night); mat.userData.windows = true; }
      this.pools[k] = new Pool(this.scene, model, { capacity: 64 });
    }
    return this.pools[k];
  }

  // type: catalog id. gen: stable id for generated scenery (so erasing it can be remembered)
  add({ type, x, z, rot = 0, y = null, gen = null, scale = 1, user = false }) {
    const def = CATALOG[type];
    if (!def || !def.model) return null;
    const pool = this.pool(def);
    const yy = y ?? this.ground(x, z);
    const sc = def.scale * scale;
    const model = this.models[def.model.join('/')];
    const item = {
      type, def, x, z, y: yy, rot, gen, user, scale,
      size: model.size.clone().multiplyScalar(sc),
      radius: Math.max(model.size.x, model.size.z) * sc * 0.5 + 0.8,
    };
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, yy, z), new THREE.Quaternion().setFromAxisAngle(up, rot), new THREE.Vector3(sc, sc, sc));
    item.handle = pool.add(m);
    if (def.kind === 'light') this.addLight(item);
    if (def.kind === 'vehicle') item.agent = this.traffic.add(item);
    this.list.push(item);
    if (user) this.onChange?.();
    return item;
  }

  addLight(item) {
    const sc = item.def.scale * item.scale;
    const q = new THREE.Quaternion().setFromAxisAngle(up, item.rot);
    item.glows = [];
    for (const b of [item.def.bulb, item.def.bulb2].filter(Boolean)) {
      const off = new THREE.Vector3(...b).multiplyScalar(sc).applyQuaternion(q);
      const bi = this.bulbs.count++, gi = this.glows.count++;
      this.bulbs.setMatrixAt(bi, new THREE.Matrix4().makeTranslation(item.x + off.x, item.y + off.y, item.z + off.z));
      this.glows.setMatrixAt(gi, new THREE.Matrix4().makeTranslation(item.x + off.x, item.y + 0.25, item.z + off.z));
      item.glows.push(bi);
    }
    this.bulbs.instanceMatrix.needsUpdate = this.glows.instanceMatrix.needsUpdate = true;
  }

  removeLight(item) {
    // swap-remove each of this lamp's bulbs; re-point any lamp whose bulb moved
    for (const idx of [...item.glows].sort((a, b) => b - a)) {
      const last = this.bulbs.count - 1;
      if (idx !== last) {
        const tmp = new THREE.Matrix4();
        this.bulbs.getMatrixAt(last, tmp); this.bulbs.setMatrixAt(idx, tmp);
        this.glows.getMatrixAt(last, tmp); this.glows.setMatrixAt(idx, tmp);
        for (const o of this.list) if (o.glows) o.glows = o.glows.map((g) => (g === last ? idx : g));
      }
      this.bulbs.count = this.glows.count = last;
    }
    this.bulbs.instanceMatrix.needsUpdate = this.glows.instanceMatrix.needsUpdate = true;
  }

  remove(item) {
    item.handle.pool.remove(item.handle);
    if (item.glows) this.removeLight(item);
    if (item.agent) this.traffic.remove(item);
    this.list = this.list.filter((o) => o !== item);
    this.onChange?.();
  }

  nearest(x, z, maxExtra = 1.5) {
    let best = null, bd = Infinity;
    for (const it of this.list) {
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < it.radius + maxExtra && d - it.radius < bd) { bd = d - it.radius; best = it; }
    }
    return best;
  }

  setNight(n) {
    this.night.value = n;
    this.bulbMat.color.setScalar(1).multiplyScalar(0.6 + n * 2.4);
    this.poolMat.opacity = n * 0.5;
  }
}
