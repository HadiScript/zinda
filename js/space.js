import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The real solar system: planets at today's positions (mean longitudes from
// J2000 orbital elements), true axial tilts and spin, the Sun as a point light
// casting real shadows. Distances and sizes are compressed so it fits a screen.

const T = 'assets/space/2k_';
const loader = new THREE.TextureLoader();
const tex = (n, srgb = true) => { const t = loader.load(T + n); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

// L0 = mean longitude at J2000 (deg), n = deg/day, a = AU, rot = sidereal day (days, negative = retrograde)
const PLANETS = [
  { id: 'mercury', name: 'Mercury', L0: 252.25084, n: 4.09233445, a: 0.387, km: 2440, rot: 58.65, tilt: 0.03, moons: 0, year: '88 days', day: '59 Earth days', fact: 'Smallest planet; a year is shorter than two of its days.' },
  { id: 'venus', name: 'Venus', L0: 181.97973, n: 1.60213034, a: 0.723, km: 6052, rot: -243, tilt: 177.4, moons: 0, year: '225 days', day: '243 Earth days (backwards)', fact: 'Hottest planet — thick CO₂ clouds trap heat at ~465 °C.', tex: 'venus_atmosphere.jpg' },
  { id: 'earth', name: 'Earth', L0: 100.46435, n: 0.9856091, a: 1, km: 6371, rot: 0.997, tilt: 23.44, moons: 1, year: '365.25 days', day: '23 h 56 m', fact: 'Home — and Zinda island is down there somewhere.' },
  { id: 'mars', name: 'Mars', L0: 355.45332, n: 0.5240384, a: 1.524, km: 3390, rot: 1.026, tilt: 25.19, moons: 2, year: '687 days', day: '24 h 37 m', fact: 'Home of Olympus Mons, the tallest volcano in the solar system.' },
  { id: 'jupiter', name: 'Jupiter', L0: 34.40438, n: 0.08308529, a: 5.203, km: 69911, rot: 0.414, tilt: 3.13, moons: 95, year: '11.9 years', day: '9 h 56 m', fact: 'Its Great Red Spot is a storm larger than Earth.' },
  { id: 'saturn', name: 'Saturn', L0: 49.94432, n: 0.03346063, a: 9.537, km: 58232, rot: 0.444, tilt: 26.73, moons: 146, year: '29.5 years', day: '10 h 34 m', fact: 'Light enough to float in a (very large) bathtub.', ring: true },
  { id: 'uranus', name: 'Uranus', L0: 313.23218, n: 0.01173129, a: 19.19, km: 25362, rot: -0.718, tilt: 97.77, moons: 28, year: '84 years', day: '17 h 14 m', fact: 'Rolls around the Sun on its side.' },
  { id: 'neptune', name: 'Neptune', L0: 304.88003, n: 0.00598106, a: 30.07, km: 24622, rot: 0.671, tilt: 28.32, moons: 16, year: '165 years', day: '16 h 6 m', fact: 'Winds reach 2,100 km/h — the fastest in the solar system.' },
];
const SUN_R = 16;
const distOf = (a) => 38 + 58 * Math.sqrt(a);
const radiusOf = (km) => 1.6 * Math.sqrt(km / 6371);
const J2000 = Date.UTC(2000, 0, 1, 12);
const deg = Math.PI / 180;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createSpace(renderer, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 6000);
  camera.position.set(0, 260, 520);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enabled = false;
  controls.maxDistance = 1800;
  controls.minDistance = 3;

  // starfield / Milky Way
  const stars = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24),
    new THREE.MeshBasicMaterial({ map: tex('stars_milky_way.jpg'), side: THREE.BackSide, color: '#8a8a9a', depthWrite: false }));
  scene.add(stars);
  scene.add(new THREE.AmbientLight('#ffffff', 0.04));

  // the Sun: emissive surface, glow and the one real light in the system
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 32), new THREE.MeshBasicMaterial({ map: tex('sun.jpg'), color: '#ffffff' }));
  sun.material.color.setScalar(1.6);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,140,40,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(SUN_R * 7);
  const light = new THREE.PointLight('#fff4e0', 3.2, 0, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = SUN_R;
  light.shadow.camera.far = 2400;
  light.shadow.bias = -0.0005;
  scene.add(sun, glow, light);

  // ---------- planets ----------
  const bodies = [];
  const sunView = new THREE.Vector3();
  for (const p of PLANETS) {
    const r = radiusOf(p.km);
    const orbit = new THREE.Group();          // rotates around the Sun
    const centre = new THREE.Group();         // planet centre, counter-rotated so the axis stays fixed in space
    const holder = new THREE.Group();         // carries the axial tilt
    const spin = new THREE.Group();           // daily rotation
    let mat;
    if (p.id === 'earth') {
      mat = new THREE.MeshStandardMaterial({ map: tex('earth_daymap.jpg'), emissiveMap: tex('earth_nightmap.jpg'), emissive: '#ffd9a0', emissiveIntensity: 1.4, roughness: 0.75 });
      // city lights only on the night side
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uSunView = { value: sunView };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float ndl = dot(normalize(normal), normalize(uSunView + vViewPosition));
            totalEmissiveRadiance *= smoothstep(0.15, -0.2, ndl);`);
      };
    } else {
      mat = new THREE.MeshStandardMaterial({ map: tex(p.tex || `${p.id}.jpg`), roughness: 0.9 });
    }
    const planet = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), mat);
    planet.castShadow = planet.receiveShadow = true;
    planet.userData.body = p;
    spin.add(planet);
    holder.rotation.z = p.tilt * deg;
    holder.add(spin);
    centre.position.x = distOf(p.a);
    centre.add(holder);
    orbit.add(centre);
    scene.add(orbit);

    // faint orbit line
    const pts = Array.from({ length: 257 }, (_, i) => { const a = (i / 256) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * distOf(p.a), 0, Math.sin(a) * distOf(p.a)); });
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#4a5a8a', transparent: true, opacity: 0.35 })));

    const b = { ...p, r, orbit, centre, holder, spin, planet };
    if (p.id === 'earth') {
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(r * 1.015, 64, 32),
        new THREE.MeshStandardMaterial({ alphaMap: tex('earth_clouds.jpg', false), transparent: true, depthWrite: false, color: '#ffffff' }));
      clouds.castShadow = false; clouds.receiveShadow = true;
      spin.add(clouds);
      b.clouds = clouds;
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 48, 24), new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 3.); gl_FragColor = vec4(0.35, 0.65, 1.0, 1.) * f * 1.4; }',
      }));
      holder.add(atmo);
      // the Moon, tidally locked, orbiting every 27.3 days
      const moonOrbit = new THREE.Group();
      const moon = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 48, 24), new THREE.MeshStandardMaterial({ map: tex('moon.jpg'), roughness: 1 }));
      moon.position.x = r * 4.2;
      moon.castShadow = moon.receiveShadow = true;
      moon.userData.body = { id: 'moon', name: 'The Moon', km: 1737, year: '27.3 days around Earth', day: 'Always shows Earth the same face', moons: 0, fact: 'Its gravity drives the tides on Zinda’s shores.' };
      moonOrbit.add(moon);
      moonOrbit.rotation.z = 5.1 * deg; // tilted to the ecliptic, not to Earth's equator
      centre.add(moonOrbit);
      b.moonOrbit = moonOrbit;
      b.moon = moon;
    }
    if (p.ring) {
      const inner = r * 1.25, outer = r * 2.3;
      const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
      const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
      const ringTex = tex('saturn_ring_alpha.png');
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ map: ringTex, alphaMap: ringTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = ring.receiveShadow = true;
      holder.add(ring);
    }
    bodies.push(b);
  }

  // asteroid belt between Mars and Jupiter
  const belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: '#8a8278', roughness: 1, flatShading: true }), 900);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, rr = distOf(2.2 + Math.random() * 1.1) + (Math.random() - 0.5) * 4;
    e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const s = 0.4 + Math.random() * 1.6;
    m4.compose(new THREE.Vector3(Math.cos(a) * rr, (Math.random() - 0.5) * 3, Math.sin(a) * rr), q.setFromEuler(e), new THREE.Vector3(s, s * 0.7, s));
    belt.setMatrixAt(i, m4);
  }
  const beltGroup = new THREE.Group(); beltGroup.add(belt); scene.add(beltGroup);

  // ---------- post ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.85));
  composer.addPass(new OutputPass());

  // ---------- time ----------
  let simDays = (Date.now() - J2000) / 86400000; // today
  let daysPerSecond = 1;
  let focus = null, flight = null;

  function place() {
    for (const b of bodies) {
      b.orbit.rotation.y = -(b.L0 + b.n * simDays) * deg; // counter-clockwise seen from celestial north (+y)
      b.centre.rotation.y = -b.orbit.rotation.y;
      b.spin.rotation.y = ((simDays / b.rot) % 1) * Math.PI * 2;
      if (b.clouds) b.clouds.rotation.y = simDays * 0.15;
      if (b.moonOrbit) b.moonOrbit.rotation.y = (simDays / 27.32) * Math.PI * 2;
    }
    beltGroup.rotation.y = -simDays * 0.003;
  }
  place();

  const tmp = new THREE.Vector3(), prevFocus = new THREE.Vector3();
  function update(dt) {
    simDays += daysPerSecond * dt;
    place();
    sun.rotation.y += dt * 0.02;
    sunView.setFromMatrixPosition(sun.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      if (flight.target) flight.target.getWorldPosition(flight.to.target);
      camera.position.lerpVectors(flight.from.pos, flight.to.pos(), k);
      controls.target.lerpVectors(flight.from.target, flight.to.target, k);
      if (flight.t >= 1) { flight = null; }
    } else if (focus) {
      // ride along with the focused planet
      focus.getWorldPosition(tmp);
      camera.position.add(tmp.clone().sub(prevFocus));
      controls.target.copy(tmp);
    }
    if (focus) focus.getWorldPosition(prevFocus);
    controls.update();
  }

  function flyTo(obj, distance) {
    const target = obj ? obj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const dir = camera.position.clone().sub(controls.target).normalize();
    flight = {
      t: 0, dur: 2.2, target: obj,
      from: { pos: camera.position.clone(), target: controls.target.clone() },
      to: { target, pos: () => target.clone().add(dir.clone().multiplyScalar(distance)).add(new THREE.Vector3(0, distance * 0.25, 0)) },
    };
    focus = obj;
    if (obj) obj.getWorldPosition(prevFocus);
  }

  const ray = new THREE.Raycaster();
  function pick(ndc) {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(bodies.flatMap((b) => [b.planet, b.moon].filter(Boolean)), false)[0];
    return hit ? hit.object : null;
  }

  function enter() {
    controls.enabled = true;
    // start close to Earth, then pull back to the whole system
    const earth = bodies.find((b) => b.id === 'earth').planet;
    const ep = earth.getWorldPosition(new THREE.Vector3());
    camera.position.copy(ep).add(new THREE.Vector3(3, 1.5, 5));
    controls.target.copy(ep);
    focus = null;
    flight = { t: 0, dur: 4, target: null, from: { pos: camera.position.clone(), target: ep.clone() }, to: { target: new THREE.Vector3(), pos: () => new THREE.Vector3(0, 330, 560) } };
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    composer.setSize(innerWidth, innerHeight);
  }

  return {
    scene, camera, controls, composer, bodies, update, enter, pick, flyTo, resize,
    get earth() { return bodies.find((b) => b.id === 'earth').planet; },
    setSpeed: (d) => { daysPerSecond = d; },
    get date() { return new Date(J2000 + simDays * 86400000); },
    today: () => { simDays = (Date.now() - J2000) / 86400000; },
    overview: () => { focus = null; flight = { t: 0, dur: 2.2, target: null, from: { pos: camera.position.clone(), target: controls.target.clone() }, to: { target: new THREE.Vector3(), pos: () => new THREE.Vector3(0, 330, 560) } }; },
  };
}
