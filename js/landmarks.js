import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { materials } from './buildings.js';

// Grand mosque, precinct gates, the dancing fountain and an airliner.

const strip = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
const merge = (list) => mergeGeometries(list.map(strip));

const marble = new THREE.MeshStandardMaterial({ color: '#cfc8ba', roughness: 0.55 });
const domeMat = new THREE.MeshStandardMaterial({ color: '#d8d3c8', roughness: 0.4, emissive: '#ffe2b0', emissiveIntensity: 0 });
const gold = new THREE.MeshStandardMaterial({ color: '#d9a93a', roughness: 0.25, metalness: 1 });
const crownLight = new THREE.MeshStandardMaterial({ color: '#cfe9d6', emissive: '#4dff9a', emissiveIntensity: 0 });
const arch = new THREE.MeshStandardMaterial({ color: '#3c2d22', roughness: 0.6 });

// ---------- Grand mosque (front faces +z) ----------
function dome(r, y, x = 0, z = 0) {
  const g = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 1.18, 1);
  return g.translate(x, y, z);
}

function minaret(x, z, h) {
  const shaft = [], gilt = [], light = [];
  shaft.push(new THREE.CylinderGeometry(2.2, 2.6, 4, 12).translate(x, 2, z));
  shaft.push(new THREE.CylinderGeometry(1.5, 1.9, h, 12).translate(x, h / 2, z));
  for (const f of [0.55, 0.82]) {
    shaft.push(new THREE.CylinderGeometry(2.6, 2.1, 1.1, 16).translate(x, h * f, z));
    light.push(new THREE.CylinderGeometry(2.62, 2.62, 0.25, 16).translate(x, h * f + 0.45, z));
  }
  shaft.push(new THREE.CylinderGeometry(1.7, 1.5, 4, 12).translate(x, h + 2, z));
  gilt.push(new THREE.ConeGeometry(1.9, 6, 12).translate(x, h + 7, z));
  gilt.push(new THREE.SphereGeometry(0.45, 10, 8).translate(x, h + 10.4, z));
  return { shaft, gilt, light };
}

export function mosqueModel() {
  const walls = [], domes = [], gilt = [], light = [], dark = [];
  // prayer hall and front portal (iwan)
  walls.push(new THREE.BoxGeometry(56, 14, 40).translate(0, 7, -6));
  walls.push(new THREE.BoxGeometry(20, 22, 4).translate(0, 11, 15));
  dark.push(new THREE.BoxGeometry(11, 15, 0.6).translate(0, 7.5, 17.2));
  // arcade along the sides of the courtyard
  for (const side of [-1, 1]) {
    walls.push(new THREE.BoxGeometry(6, 8, 50).translate(side * 37, 4, 32));
    for (let k = 0; k < 8; k++) dark.push(new THREE.BoxGeometry(0.4, 5, 4).translate(side * 33.9, 2.5, 12 + k * 6));
  }
  // courtyard floor
  walls.push(new THREE.BoxGeometry(80, 0.4, 56).translate(0, 0.2, 32));
  // domes: one great dome on a drum, four smaller ones
  walls.push(new THREE.CylinderGeometry(13, 13, 5, 32).translate(0, 16.5, -6));
  domes.push(dome(14, 19, 0, -6));
  gilt.push(new THREE.CylinderGeometry(0.3, 0.6, 6, 8).translate(0, 38.5, -6), new THREE.SphereGeometry(0.9, 10, 8).translate(0, 36, -6));
  for (const [x, z] of [[-19, -18], [19, -18], [-19, 6], [19, 6]]) {
    walls.push(new THREE.CylinderGeometry(5, 5, 2, 20).translate(x, 15, z));
    domes.push(dome(5.6, 16, x, z));
    gilt.push(new THREE.ConeGeometry(0.4, 2.4, 8).translate(x, 23.8, z));
  }
  for (const [x, z] of [[-42, -24], [42, -24], [-42, 58], [42, 58]]) {
    const mn = minaret(x, z, 58);
    walls.push(...mn.shaft); gilt.push(...mn.gilt); light.push(...mn.light);
  }
  const size = new THREE.Vector3(92, 70, 86);
  return {
    key: 'proc/mosque',
    parts: [
      { geometry: merge(walls), material: marble },
      { geometry: merge(domes), material: domeMat },
      { geometry: merge(gilt), material: gold },
      { geometry: merge(light), material: crownLight, castShadow: false },
      { geometry: merge(dark), material: arch, castShadow: false },
    ],
    size,
  };
}

// ---------- precinct gate with a lit number sign ----------
export function makeGate(label, span = 9) {
  const m = materials();
  const g = new THREE.Group();
  const pillar = new THREE.BoxGeometry(1.6, 8, 1.6);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillar, m.stone);
    p.position.set(s * (span / 2 + 0.8), 4, 0);
    p.castShadow = true;
    g.add(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 4).rotateY(Math.PI / 4), gold);
    cap.position.set(s * (span / 2 + 0.8), 8.8, 0);
    g.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 3.6, 1.8, 1.2), m.cream);
  beam.position.y = 8.6;
  beam.castShadow = true;
  g.add(beam);

  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#0f3d2e'; x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#d9a93a'; x.lineWidth = 6; x.strokeRect(6, 6, 500, 84);
  x.fillStyle = '#f6e7b8'; x.font = 'bold 50px "Space Grotesk", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.15 });
  for (const s of [1, -1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(span + 2.6, 1.5), signMat);
    sign.position.set(0, 8.6, s * 0.61);
    if (s < 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }
  g.userData.signMat = signMat;
  return g;
}

// ---------- dancing fountain ----------
export function makeFountain(radius = 22) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.9, 10, 64).rotateX(Math.PI / 2), marble);
  rim.position.y = 0.6;
  const basin = new THREE.Mesh(new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1b6f8f', roughness: 0.05, metalness: 0.3 }));
  basin.position.y = 0.45;
  g.add(rim, basin);

  // jets: rings of tall thin cones that rise and fall to a beat
  const jets = [];
  const rings = [[0, 1], [5, 8], [10, 14], [15, 20], [19.2, 28]];
  for (const [r, n] of rings) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    jets.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ring: rings.findIndex((q) => q[0] === r), a });
  }
  const jetMat = new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const jetGeo = new THREE.ConeGeometry(0.35, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI);
  jetGeo.translate(0, 1, 0);
  const mesh = new THREE.InstancedMesh(jetGeo, jetMat, jets.length);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(jets.length * 3), 3);
  mesh.frustumCulled = false;
  const spray = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), jetMat, jets.length);
  spray.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(jets.length * 3), 3);
  spray.frustumCulled = false;
  g.add(mesh, spray);

  const m = new THREE.Matrix4(), col = new THREE.Color();
  function update(t, night) {
    const mode = Math.floor(t / 9) % 4;
    jets.forEach((j, i) => {
      let h;
      if (mode === 0) h = 6 + 5 * Math.sin(t * 2.2 - j.ring * 0.9);                  // ripple out
      else if (mode === 1) h = 4 + 7 * Math.max(0, Math.sin(t * 3 + j.a * 3));        // spinning wave
      else if (mode === 2) h = j.ring === 0 ? 24 + 4 * Math.sin(t * 4) : 3 + 3 * Math.sin(t * 6 + i);  // big centre shot
      else h = 5 + 5 * Math.abs(Math.sin(t * 1.6 + (j.ring % 2) * Math.PI / 2));     // alternating rings
      h = Math.max(0.5, h);
      m.makeScale(1 + h * 0.03, h, 1 + h * 0.03).setPosition(j.x, 0.4, j.z);
      mesh.setMatrixAt(i, m);
      m.makeScale(1 + h * 0.05, 0.6, 1 + h * 0.05).setPosition(j.x, h + 1.4, j.z);
      spray.setMatrixAt(i, m);
      // white by day; at night the show lights cycle through colours
      col.setHSL((t * 0.05 + j.ring * 0.12 + (mode === 1 ? j.a / 6.28 : 0)) % 1, 0.9, 0.55);
      col.lerp(new THREE.Color(1, 1, 1), 1 - night);
      col.multiplyScalar(1 + night * 1.6);
      mesh.setColorAt(i, col); spray.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = spray.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = spray.instanceColor.needsUpdate = true;
    jetMat.opacity = 0.45 + night * 0.35;
  }
  return { group: g, update };
}

// ---------- airliner (nose toward +z) ----------
export function airlinerModel() {
  const white = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.35, metalness: 0.2 });
  const belly = new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.4, metalness: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#0d7a4f', roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: '#141b24', roughness: 0.1, metalness: 0.6 });
  const engine = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.3, metalness: 0.6 });

  const body = [], under = [], fin = [], win = [], eng = [];
  body.push(new THREE.CylinderGeometry(2, 2, 30, 20).rotateX(Math.PI / 2));
  body.push(new THREE.SphereGeometry(2, 20, 12).scale(1, 1, 2).translate(0, 0, 15));
  body.push(new THREE.ConeGeometry(2, 9, 20).rotateX(-Math.PI / 2).translate(0, 0.6, -19.5));
  under.push(new THREE.CylinderGeometry(2.02, 2.02, 30, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76).rotateX(Math.PI / 2));
  // wings: swept trapezoids
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 2.5); wingShape.lineTo(17, -4); wingShape.lineTo(17, -6.2); wingShape.lineTo(0, -4.5);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.4, bevelEnabled: false }).rotateX(Math.PI / 2);
  for (const s of [1, -1]) body.push(wingGeo.clone().scale(s, 1, 1).translate(s * 1.5, -0.6, 0));
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 1.5); tailShape.lineTo(7, -1.5); tailShape.lineTo(7, -2.8); tailShape.lineTo(0, -1.8);
  const stab = new THREE.ExtrudeGeometry(tailShape, { depth: 0.3, bevelEnabled: false }).rotateX(Math.PI / 2);
  for (const s of [1, -1]) body.push(stab.clone().scale(s, 1, 1).translate(s * 0.8, 0.8, -19));
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(-6, 9); finShape.lineTo(-8.5, 9); finShape.lineTo(-7, 0);
  fin.push(new THREE.ExtrudeGeometry(finShape, { depth: 0.35, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.17, 1.4, -14));
  // engines under the wings
  for (const s of [1, -1]) {
    eng.push(new THREE.CylinderGeometry(1.1, 0.95, 4.2, 16).rotateX(Math.PI / 2).translate(s * 6, -1.9, 1.5));
    body.push(new THREE.BoxGeometry(0.3, 1.2, 2.5).translate(s * 6, -1, 1));
  }
  // landing gear: nose leg and two main legs, wheels touch y = -3.6
  for (const [x, z] of [[0, 11], [-3, -1.5], [3, -1.5]]) {
    eng.push(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6).translate(x, -2.4, z));
    eng.push(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 12).rotateZ(Math.PI / 2).translate(x, -3.15, z));
  }
  // cabin window band + cockpit
  for (const s of [1, -1]) win.push(new THREE.BoxGeometry(0.1, 0.35, 22).translate(s * 1.98, 0.55, 1));
  win.push(new THREE.BoxGeometry(2.4, 0.5, 1).translate(0, 0.9, 16.4));
  return {
    key: 'proc/airliner',
    parts: [
      { geometry: merge(body), material: white },
      { geometry: merge(under), material: belly },
      { geometry: merge(fin), material: tail },
      { geometry: merge(win), material: glass, castShadow: false },
      { geometry: merge(eng), material: engine },
    ],
    size: new THREE.Vector3(37, 12, 40),
  };
}

export function setLandmarkNight(n, t) {
  domeMat.emissiveIntensity = n * 0.35;
  crownLight.emissiveIntensity = n * 3;
}
