import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, populateNature, heightAt } from './world.js';
import { loadAll } from './assets.js';
import { modelList } from './catalog.js';
import { RoadGrid, CELL } from './roads.js';
import { Traffic } from './traffic.js';
import { Items } from './items.js';
import { generateTown } from './town.js';
import { buildAirport } from './airport.js';
import { mosqueModel, airlinerModel, setLandmarkNight } from './landmarks.js';
import { createSpace } from './space.js';
import { Driver } from './drive.js';
import { createRain } from './weather.js';
import { CITY } from './layout.js';
import { Builder } from './build.js';
import { buildTreeModels, buildRockModels, updateTrees } from './trees.js';
import { buildBuildingModels, setBuildingNight } from './buildings.js';
import { CreatureManager, BEHAVIORS, makeName } from './creatures.js';
import { DrawPad } from './drawpad.js';
import { SEEDS } from './seeds.js';
import { loadClassifier } from './ai.js';
import { startHands, stopHands, handsRunning } from './hands.js';
import { sfx } from './audio.js';

const STORE_KEY = 'zinda.creatures.v1';
const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 2400);
const HOME_VIEW = new THREE.Vector3(360, 210, 300);
camera.position.set(-180, 520, 720);

const controls = new OrbitControls(camera, canvas);
controls.target.set(30, 6, -50);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 8;
controls.maxDistance = 900;
controls.autoRotate = true;
controls.enabled = false; // until the intro flight lands
controls.autoRotateSpeed = 0.25;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const world = createWorld(scene, renderer);

// Reflections: re-capture the sky into an environment map as the day turns,
// so glass towers, cars and wet surfaces reflect the real sky colour
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(world.sky.geometry, world.sky.material));
let envTarget = null, envTimer = 0, envNight = -1;
function refreshEnvironment() {
  const next = pmrem.fromScene(envScene, 0, 1, 2000);
  scene.environment = next.texture;
  envTarget?.dispose();
  envTarget = next;
}
refreshEnvironment();

// ---------- models, roads, town, nature ----------
const loaderSub = document.querySelector('.loader-sub');
const models = await loadAll(modelList(), (f) => { loaderSub.textContent = `building the town… ${Math.round(f * 100)}%`; });
loaderSub.textContent = 'growing trees…';
await new Promise((r) => setTimeout(r, 30)); // let the label paint before the heavy generation
Object.assign(models, buildTreeModels(), buildRockModels(), buildBuildingModels());
models['proc/mosque'] = mosqueModel();
models['proc/airliner'] = airlinerModel();
const grid = new RoadGrid(scene, models);
const traffic = new Traffic(scene, grid);
function groundAt(x, z) {
  const { i, j } = grid.cellAt(x, z);
  const cell = grid.get(i, j);
  if (cell) return cell.y + 0.12;
  return heightAt(x, z);
}
const items = new Items(scene, models, { ground: groundAt, traffic });
const town = generateTown(scene, grid, items);
const airport = buildAirport(scene, models['proc/airliner']);
airport.gates.forEach((g, k) => { if (k !== 1) items.add({ type: 'airliner', x: g.x, z: g.z, y: g.y, gen: `plane:${k}` }); });
populateNature(items);

const creatures = new CreatureManager(scene);

// ---------- persistence ----------
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(creatures.serialize())); } catch {}
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
creatures.onChange = () => { $('count').textContent = creatures.list.length; };

const saved = load();
(saved && saved.length ? saved : SEEDS).forEach((d, i) => creatures.add(d, { delay: 0.6 + i * 0.12 }));
if (!saved) save();

// ---------- toasts ----------
function toast(html) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  $('toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------- build mode ----------
const builder = new Builder({
  scene, camera, canvas, controls, items, grid, heightAt, toast, sfx,
  pickTargets: () => [world.terrain],
});
builder.restore();
$('btn-build').onclick = () => {
  builder.toggle();
  if (builder.active) { controls.autoRotate = false; $('btn-tour').classList.remove('on'); }
};

// ---------- drawing → life ----------
const pad = new DrawPad({
  onStroke: () => sfx.stroke(),
  onSubmit(data) {
    sfx.spawn();
    data.name = makeName(data.behavior);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const from = camera.position.clone().addScaledVector(forward, 12);
    const c = creatures.add(data, { from });
    save();
    const b = BEHAVIORS[data.behavior];
    const what = data.label === 'doodle' ? 'creature' : data.label;
    toast(`${b.emoji} <b>${data.name}</b> the ${what} is alive!`);
    setTimeout(() => follow(c), 1900);
  },
});

function openPad() {
  pad.open();
  sfx.open();
  dismissHint();
}
$('btn-draw').onclick = openPad;

creatures.onArrive = () => sfx.pop();
creatures.onSplash = (c) => {
  if (c === followed || c.root.position.distanceTo(camera.position) < 70) sfx.splash();
};

// ---------- sound ----------
addEventListener('pointerdown', () => sfx.unlock(), { once: true });
addEventListener('keydown', () => sfx.unlock(), { once: true });
const muteBtn = $('btn-mute');
const syncMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; muteBtn.title = sfx.muted ? 'Unmute' : 'Mute'; };
muteBtn.onclick = () => { sfx.toggleMute(); syncMute(); };
syncMute();

// ---------- first-visit hint ----------
const hint = $('hint');
let seenHint = false;
try { seenHint = localStorage.getItem('zinda.hinted') === '1'; } catch {}
function dismissHint() {
  hint.classList.remove('show');
  try { localStorage.setItem('zinda.hinted', '1'); } catch {}
}
loadClassifier().then(() => document.body.classList.add('ai-ready')).catch((e) => console.warn(e));

// ---------- air drawing ----------
const handBtn = $('btn-hand');
handBtn.onclick = async () => {
  if (handsRunning()) {
    stopHands();
    $('cam').hidden = true;
    handBtn.classList.remove('on');
    pad.handInput({ visible: false });
    return;
  }
  $('cam').hidden = false;
  handBtn.classList.add('on');
  openPad();
  try {
    await startHands({
      previewCanvas: $('cam-canvas'),
      onStatus: (s) => { $('cam-status').textContent = s; },
      onInput: (i) => pad.handInput(i),
    });
  } catch (e) {
    console.warn(e);
    $('cam-status').textContent = 'Camera blocked';
    handBtn.classList.remove('on');
    toast('🙈 Couldn\'t open the camera — allow access and try again');
    setTimeout(() => { $('cam').hidden = true; }, 2500);
  }
};

// ---------- space mode ----------
const space = createSpace(renderer, canvas);
let inSpace = false;
function fade(then) {
  $('fade').classList.add('on');
  setTimeout(() => { then(); setTimeout(() => $('fade').classList.remove('on'), 80); }, 620);
}
// Lift-off: the camera climbs away from the island and up through the sky
// before the scene hands over to the solar system
let launch = null;
function enterSpace() {
  if (inSpace || launch) return;
  if (builder.active) builder.toggle(false);
  if (driver.active) stopDriving();
  unfollow();
  controls.enabled = false;
  controls.autoRotate = false;
  launch = { t0: performance.now(), from: camera.position.clone(), look: controls.target.clone() };
  sfx.release();
}
function finishLaunch() {
  launch = null;
  $('fade').classList.add('on', 'launch');
  setTimeout(() => {
    inSpace = true;
    controls.enabled = false;
    document.body.classList.add('space');
    $('space-hud').hidden = false;
    space.enter();
    setTimeout(() => $('fade').classList.remove('on', 'launch'), 80);
  }, 620);
}
let landing = false;
function leaveSpace() {
  if (!inSpace || landing) return;
  // dive towards Earth first, then drop through the clouds onto Zinda
  landing = true;
  space.flyTo(space.earth, space.earth.geometry.parameters.radius * 1.4);
  setTimeout(() => fade(() => {
    landing = false;
    inSpace = false;
    space.controls.enabled = false;
    controls.enabled = true;
    document.body.classList.remove('space');
    $('space-hud').hidden = true;
    $('planet-card').hidden = true;
    // descend from the sky back onto the island
    introFrom.set(-180, 900, 1100);
    camera.position.copy(introFrom);
    intro = 0; introStart = 0;
    controls.enabled = false;
  }), 1100);
}

// Seamless zoom: keep scrolling out past the sky and you're in space;
// zoom right into Earth and you come back down to Zinda.
let wheelOut = 0;
canvas.addEventListener('wheel', (e) => {
  if (!inSpace) {
    const atMax = camera.position.distanceTo(controls.target) >= controls.maxDistance - 10;
    if (e.deltaY > 0 && atMax && intro >= 1 && !builder.active && !driver.active) {
      wheelOut += e.deltaY;
      if (wheelOut > 400) { wheelOut = 0; enterSpace(); }
    } else wheelOut = 0;
  } else if (e.deltaY < 0) {
    const earth = space.earth;
    const p = earth.getWorldPosition(new THREE.Vector3());
    if (space.camera.position.distanceTo(p) < earth.geometry.parameters.radius * 2.6) leaveSpace();
  }
}, { passive: true });
$('btn-space').onclick = enterSpace;
$('space-back').onclick = leaveSpace;
$('space-today').onclick = () => space.today();
document.querySelectorAll('.spd[data-speed]').forEach((b) => {
  b.onclick = () => {
    space.setSpeed(+b.dataset.speed);
    document.querySelectorAll('.spd[data-speed]').forEach((o) => o.classList.toggle('active', o === b));
  };
});
$('planet-close').onclick = () => { $('planet-card').hidden = true; space.overview(); };
let spaceDown = null;
canvas.addEventListener('pointerdown', (e) => { if (inSpace) spaceDown = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!inSpace || !spaceDown || Math.hypot(e.clientX - spaceDown.x, e.clientY - spaceDown.y) > 6) return;
  const obj = space.pick(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
  if (!obj) return;
  const b = obj.userData.body;
  space.flyTo(obj, obj.geometry.parameters.radius * 5);
  $('pc-name').textContent = b.name;
  $('pc-km').textContent = `${(b.km * 2).toLocaleString()} km`;
  $('pc-day').textContent = b.day;
  $('pc-year').textContent = b.year;
  $('pc-moons').textContent = b.moons;
  $('pc-fact').textContent = b.fact;
  $('planet-card').hidden = false;
  sfx.boop();
});

// ---------- drive mode ----------
const carModel = models['car/sedan-sports'] || models['car/sedan'];
const driver = new Driver({
  scene, camera, model: carModel, scale: 1.7, sfx,
  ground: groundAt,
  isRoad: (x, z) => { const c = grid.cellAt(x, z); return grid.has(c.i, c.j); },
  isLand: (x, z) => heightAt(x, z) > 0.6,
});
let driveRotate = false;
function startDriving() {
  if (inSpace || launch || intro < 1) return;
  if (builder.active) builder.toggle(false);
  if (pad.isOpen) pad.close();
  unfollow();
  // start on the road cell closest to where the camera is looking
  let best = null, bd = Infinity;
  for (const cell of grid.cells.values()) {
    const d = Math.hypot(cell.i * CELL - controls.target.x, cell.j * CELL - controls.target.z);
    if (d < bd) { bd = d; best = cell; }
  }
  const x = best ? best.i * CELL : CITY.x, z = best ? best.j * CELL : CITY.z;
  driveRotate = controls.autoRotate;
  controls.enabled = false;
  controls.autoRotate = false;
  driver.setSolids(items.list.flatMap((it) => {
    if (it.def.cat === 'building') return [{ x: it.x, z: it.z, rot: it.rot, hx: it.size.x / 2, hz: it.size.z / 2 }];
    if (it.def.cat === 'tree') return [{ x: it.x, z: it.z, r: 0.6 }];
    return [];
  }));
  // face along the road, in the right-hand lane
  const yaw = best && grid.has(best.i + 1, best.j) ? Math.PI / 2 : 0;
  driver.start(x - Math.cos(yaw) * 1.85, z + Math.sin(yaw) * 1.85, yaw);
  document.body.classList.add('driving');
  $('drive-hud').hidden = false;
  dismissHint();
  sfx.boop();
}
function stopDriving() {
  if (!driver.active) return;
  driver.stop();
  document.body.classList.remove('driving');
  $('drive-hud').hidden = true;
  // hand the orbit camera back, centred on where the car stopped
  controls.target.copy(driver.pos);
  camera.position.copy(driver.pos).add(new THREE.Vector3(60, 45, 60));
  controls.autoRotate = driveRotate;
  controls.enabled = true;
}
$('btn-drive').onclick = startDriving;
$('drive-exit').onclick = stopDriving;
document.querySelectorAll('.drive-pad button').forEach((b) => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); driver.press(k, true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => driver.press(k, false));
});

// ---------- weather ----------
const rain = createRain(scene);
const FOG_RAIN = new THREE.Color('#6d7682');
$('btn-rain').onclick = () => {
  const on = rain.toggle();
  $('btn-rain').classList.toggle('on', on);
  toast(on ? '🌧️ Rain is rolling in…' : '🌤️ The rain is clearing up');
};

// ---------- time + tour ----------
$('btn-time').onclick = () => world.skipTime();
const tourBtn = $('btn-tour');
tourBtn.onclick = () => {
  controls.autoRotate = !controls.autoRotate;
  tourBtn.classList.toggle('on', controls.autoRotate);
};
tourBtn.classList.toggle('on', controls.autoRotate);

// ---------- click a creature to follow it ----------
let followed = null;
const followEl = $('follow');
function follow(c) {
  if (!creatures.list.includes(c)) return;
  followed = c;
  const b = BEHAVIORS[c.behavior];
  followEl.querySelector('b').textContent = `${b.emoji} ${c.data.name || 'Someone'} the ${c.data.label === 'doodle' ? 'creature' : c.data.label}`;
  followEl.hidden = false;
}
function unfollow() { followed = null; followEl.hidden = true; }
$('follow-close').onclick = unfollow;
$('follow-love').onclick = () => {
  if (!followed) return;
  followed.react();
  creatures.burst(followed.root.position, null, 'hearts');
  sfx.boop();
};
$('follow-release').onclick = () => {
  if (!followed) return;
  const c = followed;
  unfollow();
  creatures.release(c);
  sfx.release();
  toast(`🕊️ <b>${c.data.name || 'It'}</b> said goodbye`);
  setTimeout(save, 1400);
};

const raycaster = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (builder.active || inSpace) return;
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const c = creatures.pick(raycaster);
  if (c && c.leaving == null) {
    follow(c);
    c.react();
    creatures.burst(c.root.position, null, 'hearts');
    sfx.boop();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || builder.active) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  canvas.style.cursor = creatures.pick(raycaster) ? 'pointer' : '';
});

// ---------- keyboard ----------
addEventListener('keydown', (e) => {
  if (driver.active) { if (e.key === 'Escape' || e.key.toLowerCase() === 'c') stopDriving(); return; }
  const free = !pad.isOpen && !inSpace && !builder.active;
  if (free && e.key.toLowerCase() === 'c') { startDriving(); return; }
  if (free && e.key.toLowerCase() === 'r') { $('btn-rain').click(); return; }
  if (e.key === 'Escape') { if (inSpace) leaveSpace(); else if (pad.isOpen) pad.close(); else unfollow(); }
  else if (!pad.isOpen && !inSpace && !builder.active && e.key.toLowerCase() === 's') enterSpace();
  else if (pad.isOpen && e.key === 'Enter') pad.submit();
  else if (pad.isOpen && (e.ctrlKey || e.metaKey) && e.key === 'z') pad.undo();
  else if (!pad.isOpen && !builder.active && e.key.toLowerCase() === 'd') openPad();
  else if (!pad.isOpen && e.key.toLowerCase() === 'b') $('btn-build').click();
});

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  space.resize();
}
addEventListener('resize', onResize);

// ---------- adaptive quality ----------
// Integrated GPUs struggle with bloom at high DPR: after the intro, sample the
// frame rate and step down resolution once or twice if it's low.
let perfFrames = 0, perfStart = 0, perfLevel = 0, shadowTick = 0;
function watchPerf() {
  if (intro < 1 || perfLevel >= 2) return;
  const now = performance.now();
  if (!perfStart) { perfStart = now; perfFrames = 0; return; }
  perfFrames++;
  if (now - perfStart < 3000) return;
  const fps = (perfFrames * 1000) / (now - perfStart);
  perfStart = 0;
  if (fps >= 40) { perfLevel = 2; return; }
  perfLevel++;
  const pr = perfLevel === 1 ? 1 : 0.75;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  // shadows are the next biggest cost: refresh them every few frames instead
  if (perfLevel === 2) renderer.shadowMap.autoUpdate = false;
  console.info(`[zinda] ${fps.toFixed(0)} fps → pixel ratio ${pr}`);
}

// ---------- loop ----------
const clock = new THREE.Clock();
const prevTarget = new THREE.Vector3();
let first = true;
let intro = 0, introStart = 0;
const introFrom = camera.position.clone();
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // the window can open at 0×0 (e.g. a collapsed pane) and grow without a resize event
  if (innerWidth && renderer.domElement.clientWidth !== innerWidth) onResize();
  if (!inSpace) islandUpdate(dt, t);
  if (launch) {
    const k = Math.min(1, (performance.now() - launch.t0) / 1700);
    const e = k * k * k;
    camera.position.copy(launch.from).add(new THREE.Vector3(launch.from.x * 0.6 * e, 1700 * e, launch.from.z * 0.6 * e));
    camera.lookAt(launch.look.clone().lerp(camera.position.clone().add(new THREE.Vector3(0, 400, 0)), e * 0.8));
    if (k >= 1) finishLaunch();
  }
  bloom.strength = 0.6 + world.state.night * 0.5;

  const night = world.state.night > 0.5;
  $('btn-time').textContent = night ? '☀️' : '🌙';
  $('btn-time').title = night ? 'Skip to morning' : 'Skip ahead in time';

  if (!renderer.shadowMap.autoUpdate && (shadowTick = (shadowTick + 1) % 3) === 0) renderer.shadowMap.needsUpdate = true;
  if (inSpace) {
    space.update(dt);
    $('space-date').textContent = space.date.toUTCString().slice(5, 16);
    if (innerWidth > 0 && innerHeight > 0) space.composer.render();
  } else if (innerWidth > 0 && innerHeight > 0) composer.render(); // pane can collapse to 0×0
  watchPerf();
  if (first) { first = false; document.body.classList.add('ready'); }
}

// Everything on the island; skipped while we're out in space
function islandUpdate(dt, t) {
  world.update(dt, t, camera);
  // rain greys out the light and pulls the fog in
  rain.update(dt, t, camera, world.state.night, sfx.muted);
  const wet = rain.amount;
  scene.fog.color.lerp(FOG_RAIN.clone().multiplyScalar(1 - world.state.night * 0.75), wet * 0.6);
  scene.fog.near = 450 - wet * 330;
  scene.fog.far = 1350 - wet * 700;
  renderer.toneMappingExposure = 1.05 - wet * 0.22;
  // PMREM capture causes a hitch, so only redo it once the sky has visibly changed
  envTimer += dt;
  if (envTimer > 1.5 && (Math.abs(world.state.night - envNight) > 0.04 || envTimer > 12)) {
    envTimer = 0; envNight = world.state.night; refreshEnvironment();
  }
  scene.environmentIntensity = 0.12 + (1 - world.state.night) * 0.3;
  traffic.update(dt, world.state.night);
  items.setNight(world.state.night);
  setBuildingNight(world.state.night);
  updateTrees(t);
  town.update(t, world.state.night);
  airport.update(dt, t, world.state.night);
  setLandmarkNight(world.state.night, t);
  creatures.update(dt, t, camera);
  driver.update(dt, world.state.night);
  if (driver.active) $('kmh').textContent = driver.kmh;

  if (followed) {
    if (!creatures.list.includes(followed)) unfollow();
    else {
      prevTarget.copy(controls.target);
      controls.target.lerp(followed.root.position, 0.08);
      camera.position.add(prevTarget.sub(controls.target).negate());
      const dist = camera.position.distanceTo(controls.target);
      const want = followed.size * 6;
      if (Math.abs(dist - want) > 0.5) {
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, dist + (want - dist) * 0.04);
      }
    }
  }
  if (intro < 1) {
    // Wall-clock based so a slow first few frames can't stall the flight
    if (!introStart) introStart = performance.now();
    intro = Math.min(1, (performance.now() - introStart) / 4500);
    const e = easeInOut(intro);
    camera.position.lerpVectors(introFrom, HOME_VIEW, e);
    camera.position.y += Math.sin(e * Math.PI) * 25;
    camera.lookAt(controls.target);
    if (intro >= 1) {
      controls.enabled = true;
      if (!seenHint) hint.classList.add('show');
    }
  } else if (!driver.active && !launch) controls.update();
}
frame();
