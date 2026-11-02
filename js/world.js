import * as THREE from 'three';
import { makeNoise } from './noise.js';
import { GROUND_H, zoneWeight, inDeveloped } from './layout.js';
import { buildWater } from './water.js';

export const ISLAND_R = 300;
const EXTENT = 430; // half-size of the terrain mesh
const DAY_LENGTH = 300; // seconds for a full day
const noise = makeNoise(42);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Hills to the north-west, away from the city and airport (like the Kirthar
// foothills behind the real thing)
const MOUNTAINS = [
  { x: -180, z: 120, r: 120, h: 50 },
  { x: -60, z: 215, r: 80, h: 28 },
  { x: -235, z: -10, r: 70, h: 24 },
];

export function heightAt(x, z) {
  // Wobbly coastline: island radius varies smoothly with angle
  const a = Math.atan2(z, x);
  const wob = noise.noise(Math.cos(a) * 1.6 + 5.3, Math.sin(a) * 1.6 - 2.1) * 0.5
            + noise.noise(Math.cos(a) * 4 + 9, Math.sin(a) * 4 + 1) * 0.18;
  const d = Math.hypot(x, z) / (ISLAND_R * (1 + wob));
  const fall = 1 - sstep(0.62, 1.0, d);
  const n = noise.fbm(x * 0.012 + 3.1, z * 0.012 - 1.7, 5) * 0.5 + 0.5;
  let h = (n - 0.3) * 20 + 2.5;
  for (const m of MOUNTAINS) {
    const k = Math.max(0, 1 - Math.hypot(x - m.x, z - m.z) / m.r);
    h += k * k * (3 - 2 * k) * m.h * (0.8 + noise.noise(x * 0.05, z * 0.05) * 0.4);
  }
  h = h * fall + (fall - 1) * 7;

  // Flatten the city and airport, easing back into the hills
  const w = zoneWeight(x, z);
  return h + (GROUND_H - h) * w;
}

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  day: { top: C('#2f6fd6'), bottom: C('#b4defa'), sun: C('#fff1d0'), hemiSky: C('#cfe9ff'), hemiGround: C('#6d8a4f') },
  dusk: { top: C('#36196e'), bottom: C('#ff6f6a'), sun: C('#ffa070'), hemiSky: C('#ff9aa8'), hemiGround: C('#4b2a5a') },
  // synthwave night: indigo overhead, magenta haze on the horizon
  night: { top: C('#0c0322'), bottom: C('#7a0f4c'), sun: C('#000000'), hemiSky: C('#c2306e'), hemiGround: C('#12041f') },
};

const CLOUD_DAY = C('#ffffff'), CLOUD_DUSK = C('#ffc2a8'), CLOUD_NIGHT = C('#7a2f6e');
const FOG_NIGHT = C('#24072c');
const MOON_COLOR = C('#ffc2dc');
// The moon hangs low behind the city from the default view, like a poster
const MOON_DIR = new THREE.Vector3(-0.67, 0.15, -0.72).normalize();

// Real lunar phase for today: days since a known new moon, modulo the synodic month
export function moonPhase(date = new Date()) {
  const age = ((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588;
  return (age < 0 ? age + 29.530588 : age) / 29.530588; // 0 new, 0.5 full
}

function mix3(a, b, c, wa, wb, wc) {
  return new THREE.Color(
    a.r * wa + b.r * wb + c.r * wc,
    a.g * wa + b.g * wb + c.g * wc,
    a.b * wa + b.b * wb + c.b * wc
  );
}

// Fine grain so close-up ground doesn't read as flat paint
function grainTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 200 + (Math.random() - 0.5) * 70 + noise.noise((i % S) * 0.08, Math.floor(i / S) * 0.08) * 40;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Smooth-shaded ground with natural colours blended by height, slope and noise
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, 300, 300).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const sandWet = C('#a08a62'), sand = C('#d9c79c'), grassA = C('#6e8f3e'), grassB = C('#4f7432'), dry = C('#8f9150');
  const forest = C('#3e5e2c'), rock = C('#7b766d'), rockDark = C('#5d5a54'), snow = C('#eef1f4');
  const nrm = geo.attributes.normal, tmp = new THREE.Color(), t2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), slope = nrm.getY(i);
    const n1 = noise.noise(x * 0.05, z * 0.05), n2 = noise.noise(x * 0.17 + 9, z * 0.17 - 4);
    if (h < -0.3) tmp.copy(sandWet).lerp(sand, sstep(-2, -0.3, h));
    else if (h < 1.3 + n2 * 0.4) tmp.copy(sand).lerp(grassA, sstep(0.9, 1.6, h + n2 * 0.4));
    else {
      tmp.copy(grassA).lerp(grassB, clamp01(n1 * 0.9 + 0.5)).lerp(dry, clamp01(n2 * 0.6) * 0.5);
      tmp.lerp(forest, sstep(10, 20, h));
      t2.copy(rock).lerp(rockDark, clamp01(n2 + 0.5));
      tmp.lerp(t2, sstep(0.82, 0.68, slope) * sstep(2, 5, h));
      tmp.lerp(snow, sstep(29, 33, h + n1 * 3) * sstep(0.6, 0.75, slope));
    }
    tmp.multiplyScalar(0.92 + n2 * 0.08);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: grainTexture() }));
  mesh.receiveShadow = true;
  return mesh;
}

// Land spots for creatures and scenery. Skips the town so nothing spawns inside a building.
export function randomLand(minH = 1, maxH = 8, near = null, spread = 25, allowTown = false, rand = Math.random) {
  for (let i = 0; i < 400; i++) {
    let x, z;
    if (near && i < 200) {
      x = near.x + (rand() * 2 - 1) * spread;
      z = near.z + (rand() * 2 - 1) * spread;
    } else {
      const r = Math.sqrt(rand()) * ISLAND_R * 1.15, t = rand() * Math.PI * 2;
      x = Math.cos(t) * r; z = Math.sin(t) * r;
    }
    if (!allowTown && inDeveloped(x, z, 8)) continue;
    const h = heightAt(x, z);
    if (h >= minH && h <= maxH) return new THREE.Vector3(x, h, z);
  }
  return new THREE.Vector3(-40, heightAt(-40, 0), 0);
}

export function randomWater(near = null, spread = 35) {
  for (let i = 0; i < 400; i++) {
    let x, z;
    if (near && i < 200) {
      x = near.x + (Math.random() * 2 - 1) * spread;
      z = near.z + (Math.random() * 2 - 1) * spread;
    } else {
      const r = ISLAND_R * (0.75 + Math.random() * 0.6), t = Math.random() * Math.PI * 2;
      x = Math.cos(t) * r; z = Math.sin(t) * r;
    }
    if (Math.hypot(x, z) < EXTENT - 20 && heightAt(x, z) < -1.4) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(ISLAND_R * 1.25, 0, 0);
}

// Forest, beach palms, rocks and meadow flowers, placed through the items layer
// with a seeded RNG so every visit grows the same island (and erasures stick).
export function populateNature(items) {
  const rand = makeNoise(77).rand;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  let gid = 0;
  const gen = () => `nat:${gid++}`;
  const LEAFY = ['ez-oak', 'ez-oak-2', 'ez-ash', 'ez-aspen'];
  const PINES = ['ez-pine', 'ez-pine-2'];
  const ROCKS = ['rock-1', 'rock-2', 'rock-3'];
  const MEADOW = ['ez-bush', 'ez-bush-2', 'ez-bush', 'grass_large', 'flower_redA', 'flower_yellowA', 'flower_purpleA'];

  let trees = 0;
  // Realistic trees cost ~10k triangles each, so plant fewer, in groves
  for (let i = 0; i < 20000 && trees < 260; i++) {
    const p = randomLand(1.8, 30, null, 0, false, rand);
    if (noise.noise(p.x * 0.035, p.z * 0.035) < 0.02) continue;
    const type = p.y > 13 ? pick(PINES) : p.y > 7 ? (rand() < 0.5 ? pick(PINES) : pick(LEAFY)) : pick(LEAFY);
    items.add({ type, x: p.x, z: p.z, y: p.y - 0.3, rot: rand() * 6.28, scale: 0.75 + rand() * 0.5, gen: gen() });
    trees++;
  }
  for (let i = 0; i < 110; i++) {
    const p = randomLand(-0.5, 34, null, 0, false, rand);
    items.add({ type: pick(ROCKS), x: p.x, z: p.z, y: p.y - 0.35, rot: rand() * 6.28, scale: 0.5 + rand() * 1.2, gen: gen() });
  }
  for (let i = 0; i < 200; i++) {
    const p = randomLand(1.8, 9, null, 0, false, rand);
    items.add({ type: pick(MEADOW), x: p.x, z: p.z, y: p.y - 0.1, rot: rand() * 6.28, scale: 0.8 + rand() * 0.6, gen: gen() });
  }
}

function buildClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 20; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(geo, mat);
      const k = 4 + Math.random() * 5;
      puff.scale.set(k * 1.3, k * 0.8, k);
      puff.position.set((j - puffs / 2) * 5.5, Math.random() * 2.5, (Math.random() - 0.5) * 5);
      cloud.add(puff);
    }
    const r = 40 + Math.random() * 420, t = Math.random() * Math.PI * 2;
    cloud.position.set(Math.cos(t) * r, 175 + Math.random() * 40, Math.sin(t) * r);
    cloud.userData.speed = 2 + Math.random() * 3;
    group.add(cloud);
  }
  group.userData.mat = mat;
  return group;
}

function buildSky() {
  const uniforms = {
    top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunVis: { value: 1 },
    moonDir: { value: MOON_DIR.clone() }, night: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunVis;
      uniform vec3 moonDir; uniform float night;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
        float s = max(dot(d, normalize(sunDir)), 0.);
        col += sunColor * (pow(s, 900.) * 8. + pow(s, 14.) * 0.45) * sunVis;
        float m = max(dot(d, normalize(moonDir)), 0.);
        col += night * (vec3(1.0, 0.25, 0.55) * pow(m, 5.) * 0.9 + vec3(1.0, 0.75, 0.6) * pow(m, 40.) * 0.8);
        col += night * vec3(0.55, 0.05, 0.3) * smoothstep(0.35, 0.0, d.y) * 0.5;
        col = mix(col, bottom * 0.7, smoothstep(0.0, -0.35, d.y));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.renderOrder = -1;
  return { sky, uniforms };
}

function buildStars() {
  const n = 1800, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.05;
    v.normalize().multiplyScalar(850);
    arr.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
}

function buildFireflies(n = 320) {
  const base = [], arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = randomLand(0.8, 14);
    p.y += 1 + Math.random() * 3;
    base.push({ p, ph: Math.random() * 10 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: '#ffe680', size: 0.7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pts.userData.base = base;
  return pts;
}

// Striped lighthouse on a headland with a sweeping beam at night
function buildLighthouse() {
  const ang = 2.35;
  let r = ISLAND_R * 0.6, x = 0, z = 0;
  for (; r < EXTENT; r += 1) {
    x = Math.cos(ang) * r; z = Math.sin(ang) * r;
    if (heightAt(x, z) < 1.5) break;
  }
  r -= 7; x = Math.cos(ang) * r; z = Math.sin(ang) * r;
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(1.7, 2.6, 16, 14, 8).toNonIndexed();
  const pos = body.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const red = C('#d8362f'), white = C('#f6f3ee');
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = Math.floor((y + 8) / 4) % 2 ? red : white;
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const tower = new THREE.Mesh(body.translate(0, 8, 0), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  tower.castShadow = true;
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe9a8', emissiveIntensity: 0.5 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 12).translate(0, 17, 0), lampMat);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 12).translate(0, 19.2, 0), new THREE.MeshStandardMaterial({ color: '#2b2f36' }));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 1.2, 16).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ color: '#c9c2b4' }));
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1c0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Group();
  for (const s of [1, -1]) {
    beam.add(new THREE.Mesh(new THREE.ConeGeometry(9, 120, 20, 1, true).translate(0, -60, 0).rotateZ(s * Math.PI / 2), beamMat));
  }
  beam.position.y = 17;
  g.add(base, tower, lamp, cap, beam);
  g.position.set(x, heightAt(x, z) - 0.3, z);
  return { group: g, beam, beamMat, lampMat };
}

export function createWorld(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const terrain = buildTerrain();
  scene.add(terrain);

  const water = buildWater(heightAt, EXTENT);
  scene.add(water.mesh);
  const lighthouse = buildLighthouse();
  scene.add(lighthouse.group);

  const clouds = buildClouds(); scene.add(clouds);
  const { sky, uniforms } = buildSky(); scene.add(sky);
  const stars = buildStars(); scene.add(stars);
  const fireflies = buildFireflies(); scene.add(fireflies);

  const moonTex = new THREE.TextureLoader().load('assets/space/2k_moon.jpg');
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moonUniforms = { map: { value: moonTex }, light: { value: new THREE.Vector3() }, opacity: { value: 0 } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.ShaderMaterial({
    uniforms: moonUniforms, transparent: true, fog: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize((modelMatrix * vec4(normal, 0.)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D map; uniform vec3 light; uniform float opacity; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        float lit = smoothstep(-0.08, 0.25, dot(normalize(vN), normalize(light)));
        vec3 col = c * (vec3(1.0, 0.93, 0.85) * 1.9 * lit + vec3(0.25, 0.08, 0.18) * 0.35);
        gl_FragColor = vec4(col, opacity);
      }`,
  }));
  moon.renderOrder = -0.5;
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,120,190,0.9)'); gr.addColorStop(0.4, 'rgba(220,30,120,0.35)'); gr.addColorStop(1, 'rgba(120,0,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
  halo.scale.setScalar(520);
  halo.renderOrder = -0.6;
  scene.add(moon, halo);
  const phase = moonPhase();

  const hemi = new THREE.HemisphereLight('#cfe9ff', '#6d8a4f', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -330, right: 330, top: 330, bottom: -330, near: 10, far: 1200 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  const moonLight = new THREE.DirectionalLight('#8fa6ff', 0);
  scene.add(hemi, sun, sun.target, moonLight);
  scene.fog = new THREE.Fog('#b4defa', 450, 1350);

  let dayT = 0.12; // 0 sunrise, .25 noon, .5 sunset, .75 midnight
  let fastForward = 0;
  const state = { night: 0, dayT };

  function update(dt, t, camera) {
    const step = Math.min(fastForward, dt * 0.35);
    fastForward -= step;
    dayT = (dayT + dt / DAY_LENGTH + step) % 1;
    state.dayT = dayT;

    const ang = dayT * Math.PI * 2;
    const elev = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, elev, 0.45).normalize();

    const wDay = sstep(0.05, 0.38, elev);
    const wNight = sstep(0.02, -0.22, elev);
    const wDusk = Math.max(0, 1 - wDay - wNight);
    const P = PALETTE;
    uniforms.top.value.copy(mix3(P.day.top, P.dusk.top, P.night.top, wDay, wDusk, wNight));
    uniforms.bottom.value.copy(mix3(P.day.bottom, P.dusk.bottom, P.night.bottom, wDay, wDusk, wNight));
    uniforms.sunColor.value.copy(mix3(P.day.sun, P.dusk.sun, P.night.sun, wDay, wDusk, wNight));
    uniforms.sunDir.value.copy(sunDir);
    uniforms.sunVis.value = sstep(-0.12, 0.05, elev);
    scene.fog.color.copy(uniforms.bottom.value).lerp(FOG_NIGHT, sstep(0.05, -0.2, elev) * 0.8);

    hemi.color.copy(mix3(P.day.hemiSky, P.dusk.hemiSky, P.night.hemiSky, wDay, wDusk, wNight));
    hemi.groundColor.copy(mix3(P.day.hemiGround, P.dusk.hemiGround, P.night.hemiGround, wDay, wDusk, wNight));
    hemi.intensity = 0.32 + wDay * 0.83 + wDusk * 0.4;

    // One shadow-casting key light: the sun by day, the moon by night
    const sunI = sstep(-0.05, 0.25, elev) * 2.6;

    const night = sstep(0.08, -0.2, elev);
    state.night = night;
    const moonDir = MOON_DIR;
    const moonI = night * 0.9;
    if (sunI >= moonI) {
      sun.position.copy(sunDir).multiplyScalar(450);
      sun.color.copy(uniforms.sunColor.value);
      sun.intensity = sunI;
    } else {
      sun.position.copy(moonDir).multiplyScalar(450);
      sun.color.copy(MOON_COLOR);
      sun.intensity = moonI;
    }
    moonLight.intensity = 0;
    uniforms.moonDir.value.copy(moonDir);
    uniforms.night.value = night;
    // phase: the sunlit side of the moon swings from behind it (new) to facing us (full)
    moonUniforms.light.value.copy(moonDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), phase * Math.PI * 2).setY(0.1);
    moon.position.copy(camera.position).addScaledVector(moonDir, 800);
    moon.rotation.y = Math.PI * 0.5;
    halo.position.copy(camera.position).addScaledVector(moonDir, 820);
    moonUniforms.opacity.value = night;
    halo.material.opacity = night * 0.85;
    moon.visible = halo.visible = night > 0.01;

    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.material.opacity = night;
    stars.rotation.y = t * 0.004;

    water.update(t, {
      sunDir, sunColor: uniforms.sunColor.value, moonDir,
      skyTop: uniforms.top.value, skyHorizon: uniforms.bottom.value,
      day: sstep(-0.15, 0.35, elev), night,
    });
    lighthouse.beam.rotation.y = t * 0.6;
    lighthouse.beamMat.opacity = night * 0.16;
    lighthouse.lampMat.emissiveIntensity = 0.5 + night * 4;

    clouds.userData.mat.color.copy(CLOUD_DAY).lerp(CLOUD_DUSK, wDusk * 0.6).lerp(CLOUD_NIGHT, night);
    clouds.userData.mat.opacity = 0.92 - night * 0.45;
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 520) c.position.x = -520;
    }

    const fp = fireflies.geometry.attributes.position;
    fireflies.userData.base.forEach((f, i) => {
      fp.setXYZ(i,
        f.p.x + Math.sin(t * 0.7 + f.ph) * 1.5,
        f.p.y + Math.sin(t * 1.3 + f.ph * 2) * 0.8,
        f.p.z + Math.cos(t * 0.6 + f.ph) * 1.5
      );
    });
    fp.needsUpdate = true;
    fireflies.material.opacity = night * (0.75 + Math.sin(t * 3) * 0.25);
  }

  // Jump ahead to the next quarter of the day (sunrise → noon → sunset → midnight)
  function skipTime() {
    const next = (Math.floor(dayT * 4 + 0.001) + 1) / 4;
    fastForward = next - dayT;
  }

  return { update, skipTime, state, heightAt, randomLand, randomWater, terrain, sky };
}
