// Tiny WebAudio synth: ambient surf + a few UI chimes. No audio files needed.

let ctx = null, master = null, surfGain = null;
let muted = false;
try { muted = localStorage.getItem('zinda.muted') === '1'; } catch {}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const freq = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  startSurf();
  return ctx;
}

// Filtered noise with a slow swell — reads as distant waves
function startSurf() {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 700;
  surfGain = ctx.createGain();
  surfGain.gain.value = 0.12;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 0.11; lfoGain.gain.value = 0.07;
  lfo.connect(lfoGain).connect(surfGain.gain);
  src.connect(lp).connect(surfGain).connect(master);
  src.start(); lfo.start();
}

function tone(f, { at = 0, dur = 0.5, type = 'sine', vol = 0.18, glide = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() { ensure(); if (ctx.state === 'suspended') ctx.resume(); },
  get muted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem('zinda.muted', muted ? '1' : '0'); } catch {}
    ensure();
    master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
    return muted;
  },
  stroke() { tone(freq(PENTA[Math.floor(Math.random() * 5)], 880), { dur: 0.12, vol: 0.04, type: 'triangle' }); },
  open() { tone(freq(0), { dur: 0.25, vol: 0.08, glide: 1.5 }); },
  // Rising sparkle while the creature flies in
  spawn() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone(freq(s), { at: i * 0.09, dur: 0.6, vol: 0.12, type: 'triangle' }));
    tone(freq(24), { at: 0.5, dur: 1.2, vol: 0.05 });
  },
  pop() { tone(180, { dur: 0.25, vol: 0.25, glide: 0.4 }); tone(freq(19), { dur: 0.8, vol: 0.06 }); },
  boop() { tone(freq(PENTA[Math.floor(Math.random() * PENTA.length)], 392), { dur: 0.3, vol: 0.15, glide: 1.25 }); },
  splash() { tone(300 + Math.random() * 120, { dur: 0.18, vol: 0.05, type: 'sawtooth', glide: 0.3 }); },
  release() { [12, 7, 4, 0].forEach((s, i) => tone(freq(s), { at: i * 0.08, dur: 0.5, vol: 0.1, type: 'triangle' })); },
};
