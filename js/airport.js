import * as THREE from 'three';
import { GROUND_H } from './layout.js';
import { materials } from './buildings.js';

// Coastal airport: runway 09/27 along x, a parallel taxiway, apron, terminal,
// control tower, hangar and lights. One airliner flies a full circuit.

const RWY = { x0: -215, x1: 105, z: -240, w: 45 };
const TWY = { z: -205, w: 18 };
const Y = GROUND_H + 0.06;
const GEAR = 3.6; // fuselage centre above the tarmac

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function asphalt(g, w, h, base = '#3b3e44') {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 40; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

function flat(w, d, mat, x, z, y = Y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function signTexture(text) {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#0d2b45'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold 64px "Space Grotesk", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildAirport(scene, airlinerModel) {
  const group = new THREE.Group();
  scene.add(group);
  const M = materials();
  const len = RWY.x1 - RWY.x0, cx = (RWY.x0 + RWY.x1) / 2;

  // ---------- runway ----------
  // texture runs along U = runway length: edge lines + centreline dashes
  const rwTex = canvasTex(512, 256, (g, w, h) => {
    asphalt(g, w, h);
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 10, w, 6); g.fillRect(0, h - 16, w, 6);
    g.fillRect(0, h / 2 - 3, w * 0.55, 6);
  }, [len / 60, 1]);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(len, RWY.w).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: rwTex, roughness: 0.9 }));
  runway.position.set(cx, Y, RWY.z);
  runway.receiveShadow = true;
  group.add(runway);
  // thresholds: piano keys + runway numbers
  for (const [end, num] of [[RWY.x0, '09'], [RWY.x1, '27']]) {
    const t = canvasTex(256, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#f2f2ee';
      for (let k = 0; k < 8; k++) if (k !== 3 && k !== 4) g.fillRect(16, 20 + k * 60, 90, 40);
      g.save(); g.translate(185, h / 2); g.rotate(Math.PI / 2 * (num === '09' ? 1 : -1));
      g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 0, 0);
      g.restore();
    });
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const p = flat(22, RWY.w - 4, mat, end + (num === '09' ? 12 : -12), RWY.z, Y + 0.02);
    if (num === '27') p.rotation.y = Math.PI;
    group.add(p);
  }

  // ---------- taxiway, connectors, apron ----------
  const twTex = canvasTex(256, 128, (g, w, h) => {
    asphalt(g, w, h, '#45484e');
    g.fillStyle = '#f2c23a'; g.fillRect(0, h / 2 - 3, w, 6);
  }, [1, 1]);
  const twMat = new THREE.MeshStandardMaterial({ map: twTex, roughness: 0.9 });
  const twLen = 300;
  const taxi = flat(twLen, TWY.w, twMat, cx, TWY.z);
  rwTex.repeat.set(len / 60, 1); twTex.repeat.set(twLen / 25, 1);
  group.add(taxi);
  for (const x of [-150, 40]) {
    const c = flat(TWY.w, RWY.z - TWY.z, new THREE.MeshStandardMaterial({ color: '#45484e', roughness: 0.9 }), x, (RWY.z + TWY.z) / 2, Y - 0.01);
    group.add(c);
  }
  const apron = flat(170, 52, new THREE.MeshStandardMaterial({ color: '#8f9296', roughness: 0.85 }), -55, -170, Y - 0.005);
  group.add(apron);

  // ---------- terminal ----------
  const term = new THREE.Group();
  const body = new THREE.BoxGeometry(120, 15, 24);
  body.clearGroups();
  body.addGroup(0, 12, 0); body.addGroup(12, 12, 1); body.addGroup(24, 12, 0);
  const terminal = new THREE.Mesh(body, [M.glass, M.roofTop]);
  terminal.position.set(-55, Y + 7.5, -130);
  terminal.castShadow = terminal.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 124, 32, 1, false, -0.6, 1.2).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }));
  roof.position.set(-55, Y - 1.5, -130);
  roof.castShadow = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(60, 5.5),
    new THREE.MeshStandardMaterial({ map: signTexture('ZINDA INTERNATIONAL AIRPORT'), emissive: '#ffffff', emissiveIntensity: 0.1 }));
  sign.material.emissiveMap = sign.material.map;
  sign.position.set(-55, Y + 12.5, -117.9);
  term.add(terminal, roof, sign);
  // jet bridges to the gates
  const bridgeMat = new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.5, metalness: 0.4 });
  const GATES = [-110, -75, -40, -5];
  for (const x of GATES) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 14), bridgeMat);
    b.position.set(x + 4, Y + 5.5, -149);
    b.castShadow = true;
    term.add(b);
  }
  group.add(term);

  // ---------- control tower ----------
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 34, 20), M.grey);
  shaft.position.y = 17;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 5, 5, 16), new THREE.MeshStandardMaterial({ color: '#1e2a36', roughness: 0.05, metalness: 0.8, emissive: '#8fe3ff', emissiveIntensity: 0 }));
  cab.position.y = 36.5;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.8, 1, 16), M.roofTop);
  cap.position.y = 39.5;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), M.metal);
  mast.position.y = 43;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
  beacon.position.y = 46.2;
  for (const o of [shaft, cab, cap]) o.castShadow = true;
  tower.add(shaft, cab, cap, mast, beacon);
  tower.position.set(45, Y, -140);
  group.add(tower);

  // ---------- hangar ----------
  const hangar = new THREE.Group();
  const hangarMat = new THREE.MeshStandardMaterial({ color: '#b8bec5', roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide });
  const arc = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 44, 32, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), hangarMat);
  arc.position.y = 0;
  arc.scale.set(1, 0.75, 1);
  arc.castShadow = true;
  const back = new THREE.Mesh(new THREE.CircleGeometry(18, 32, 0, Math.PI), hangarMat);
  back.scale.set(1, 0.75, 1); back.position.z = -22;
  const door = new THREE.Mesh(new THREE.CircleGeometry(18, 32, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#5d6670', roughness: 0.6 }));
  door.scale.set(1, 0.75, 1); door.position.z = 22;
  hangar.add(arc, back, door);
  hangar.position.set(90, Y, -165);
  hangar.rotation.y = Math.PI;
  group.add(hangar);

  // ---------- lights (edge, threshold, taxiway) ----------
  const lights = [];
  for (let x = RWY.x0; x <= RWY.x1; x += 16) for (const s of [-1, 1]) lights.push([x, RWY.z + s * (RWY.w / 2 + 0.6), '#fff6d8']);
  for (let z = -RWY.w / 2; z <= RWY.w / 2; z += 3) { lights.push([RWY.x0 - 1, RWY.z + z, '#4dff7a']); lights.push([RWY.x1 + 1, RWY.z + z, '#ff4d4d']); }
  for (let x = cx - twLen / 2; x <= cx + twLen / 2; x += 14) for (const s of [-1, 1]) lights.push([x, TWY.z + s * (TWY.w / 2 + 0.5), '#4d8dff']);
  // approach lights stretching out east over the shore
  for (let k = 1; k <= 12; k++) lights.push([RWY.x1 + k * 9, RWY.z, '#fff6d8']);
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 6), lightMat, lights.length);
  bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lights.length * 3), 3);
  const col = new THREE.Color(), mm = new THREE.Matrix4();
  lights.forEach(([x, z, c], i) => {
    bulbs.setMatrixAt(i, mm.makeTranslation(x, Y + 0.35, z));
    bulbs.setColorAt(i, col.set(c));
  });
  group.add(bulbs);

  // ---------- the flying airliner ----------
  const plane = new THREE.Group();
  for (const p of airlinerModel.parts) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.castShadow = p.castShadow ?? true;
    plane.add(mesh);
  }
  const navMats = { red: new THREE.MeshBasicMaterial({ color: '#ff2020' }), green: new THREE.MeshBasicMaterial({ color: '#20ff60' }), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }) };
  const nav = (mat, x, y, z) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat); s.position.set(x, y, z); plane.add(s); return s; };
  nav(navMats.red, -18.4, -0.4, -4.5); nav(navMats.green, 18.4, -0.4, -4.5);
  const strobe = nav(navMats.white, 0, 2.2, -2);
  scene.add(plane);

  // Closed circuit: land westbound, taxi back east, take off westbound,
  // climb out over the sea and swing round the island to the approach again.
  const g = Y + GEAR;
  const WP = [
    [760, 95, -330, 70], [560, 52, -246, 70], [300, 18, -240, 66], [RWY.x1 - 10, g + 2, RWY.z, 60], // approach + flare
    [0, g, RWY.z, 40], [-120, g, RWY.z, 14], [-150, g, RWY.z - 6, 8],                          // rollout
    [-150, g, TWY.z - 10, 8], [-120, g, TWY.z, 9], [10, g, TWY.z, 10], [40, g, TWY.z - 10, 7],   // taxi east
    [40, g, RWY.z + 6, 6], [70, g, RWY.z, 6], [95, g, RWY.z, 8],                                // line up
    [0, g, RWY.z, 30], [-110, g + 1, RWY.z, 55], [-215, 22, RWY.z, 62], [-380, 70, -255, 66],   // take-off + climb
    [-560, 120, -430, 70], [-360, 140, -650, 70], [150, 140, -690, 70], [620, 125, -560, 70],     // circuit
  ];
  const curve = new THREE.CatmullRomCurve3(WP.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal', 0.5);
  const lengths = curve.getLengths(2000);
  const total = lengths[lengths.length - 1];
  const wpU = WP.map((_, i) => lengths[Math.round((i / WP.length) * 2000)] / total);
  const speedAt = (u) => {
    for (let i = 0; i < WP.length; i++) {
      const a = wpU[i], b = i + 1 < WP.length ? wpU[i + 1] : 1;
      if (u >= a && u <= b) return THREE.MathUtils.lerp(WP[i][3], WP[(i + 1) % WP.length][3], (u - a) / Math.max(1e-6, b - a));
    }
    return 60;
  };
  let u = 0.02, lastYaw = 0, bank = 0;
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function update(dt, t, night) {
    u = (u + (speedAt(u) * dt) / total) % 1;
    curve.getPointAt(u, pos);
    curve.getTangentAt(u, tan);
    const yaw = Math.atan2(tan.x, tan.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1));
    let dYaw = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw));
    lastYaw = yaw;
    const onGround = pos.y < g + 3;
    bank += ((onGround ? 0 : THREE.MathUtils.clamp(-dYaw / Math.max(dt, 1e-3) * 0.9, -0.5, 0.5)) - bank) * Math.min(1, dt * 2);
    euler.set(pitch, yaw, bank);
    plane.position.copy(pos);
    plane.quaternion.setFromEuler(euler);
    strobe.visible = Math.sin(t * 6) > 0.85;

    lightMat.color.setScalar(0.25 + night * 2.2);
    beacon.material.color.setRGB(1 + night * 2, 0.15, 0.15).multiplyScalar(Math.sin(t * 2.5) > 0 ? 1 : 0.25);
    cab.material.emissiveIntensity = night * 0.6;
    sign.material.emissiveIntensity = 0.1 + night * 1.2;
  }

  // gates where parked planes go (nose toward the terminal)
  const gates = GATES.map((x) => ({ x, z: -170, y: Y + GEAR - 0.1 }));
  return { update, gates, plane };
}
