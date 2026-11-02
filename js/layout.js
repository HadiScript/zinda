// Where the developed land sits on the island. Terrain is flattened inside
// these zones (and can reclaim a little sea, like a coastal airport).

export const GROUND_H = 2.5;

// Bahria-style city around the boulevard
export const CITY = { x: 60, z: 0, r: 178 };

// Airport strip on the south-west shore (axis-aligned rectangle)
export const AIRPORT = { x: -55, z: -185, hw: 175, hd: 92 };

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 1 inside a developed zone, easing to 0 over `blend` metres outside it
export function zoneWeight(x, z, blend = 30) {
  const dc = Math.hypot(x - CITY.x, z - CITY.z) - CITY.r;
  const dx = Math.abs(x - AIRPORT.x) - AIRPORT.hw, dz = Math.abs(z - AIRPORT.z) - AIRPORT.hd;
  const da = Math.max(dx, dz);
  return 1 - sstep(0, blend, Math.min(dc, da));
}

export function inDeveloped(x, z, pad = 0) {
  return Math.hypot(x - CITY.x, z - CITY.z) < CITY.r + pad ||
    (Math.abs(x - AIRPORT.x) < AIRPORT.hw + pad && Math.abs(z - AIRPORT.z) < AIRPORT.hd + pad);
}
