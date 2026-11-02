import * as THREE from 'three';

// Rain: thousands of streaks animated entirely on the GPU in a box that follows
// the camera, plus a soft synthesized rain hiss. amount eases in and out.

const COUNT = 9000, BOX = 160, HEIGHT = 120;

export function createRain(scene) {
  const pos = new Float32Array(COUNT * 2 * 3);
  const seed = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    const x = Math.random() * BOX, z = Math.random() * BOX, s = Math.random();
    pos.set([x, 0, z, x, 1, z], i * 6); // y = 0 head, 1 tail
    seed[i * 2] = seed[i * 2 + 1] = s;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { time: { value: 0 }, origin: { value: new THREE.Vector3() }, amount: { value: 0 }, night: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float time; uniform vec3 origin; attribute float seed; varying float vA;
      const float BOX = ${BOX.toFixed(1)}; const float H = ${HEIGHT.toFixed(1)};
      void main() {
        vec3 p = position;
        // wrap the box around the camera so rain never runs out
        p.xz = mod(p.xz - origin.xz + BOX * 0.5, BOX) + origin.xz - BOX * 0.5;
        float fall = mod(seed * H - time * (55.0 + seed * 25.0), H);
        p.y = origin.y - H * 0.4 + fall + position.y * 2.2;
        p.x += position.y * 0.35; // slight wind slant
        vA = 1.0 - position.y * 0.8;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float amount; uniform float night; varying float vA;
      void main() { gl_FragColor = vec4(mix(vec3(0.75, 0.8, 0.9), vec3(0.75, 0.55, 0.85), night), vA * 0.32 * amount); }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);

  let target = 0, amount = 0, audio = null;
  function startAudio() {
    if (audio) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(hp).connect(lp).connect(gain).connect(ctx.destination);
    src.start();
    audio = { ctx, gain };
  }

  return {
    get on() { return target > 0; },
    get amount() { return amount; },
    toggle(muted) {
      target = target ? 0 : 1;
      if (target) startAudio();
      return target > 0;
    },
    update(dt, t, camera, night, muted) {
      amount += (target - amount) * Math.min(1, dt * 0.8);
      lines.visible = amount > 0.01;
      uniforms.time.value = t;
      uniforms.amount.value = amount;
      uniforms.night.value = night;
      uniforms.origin.value.copy(camera.position);
      if (audio) audio.gain.gain.value = muted ? 0 : amount * 0.12;
    },
  };
}
