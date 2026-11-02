// A few hand-built doodles so the island isn't empty on the first visit.

const ellipse = (cx, cy, rx, ry, n = 36, from = 0, to = Math.PI * 2) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
const line = (...pts) => pts.map(([x, y]) => ({ x, y }));
const curve = (p0, p1, p2, n = 14) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return { x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] };
  });

export const SEEDS = [
  {
    label: 'fish', behavior: 'swim', color: '#3ff0ff', name: 'Bubbles',
    strokes: [ellipse(-0.15, 0, 0.55, 0.32), line([0.38, 0], [0.85, -0.32], [0.85, 0.32], [0.38, 0]), [{ x: -0.45, y: -0.08 }]],
  },
  {
    label: 'whale', behavior: 'swim', color: '#7a8bff', name: 'Tide',
    strokes: [ellipse(0, 0.1, 0.75, 0.38, 40, Math.PI, Math.PI * 2).concat(line([0.75, 0.1], [-0.75, 0.1])),
      line([0.7, 0.05], [0.95, -0.3], [0.9, 0.0]), curve([-0.2, -0.3], [-0.25, -0.65], [-0.05, -0.75]), [{ x: -0.45, y: -0.05 }]],
  },
  {
    label: 'bird', behavior: 'fly', color: '#ff5fa2', name: 'Pip',
    strokes: [curve([-0.9, -0.05], [-0.45, -0.7], [0, 0.1]).concat(curve([0, 0.1], [0.45, -0.7], [0.9, -0.05]))],
  },
  {
    label: 'butterfly', behavior: 'fly', color: '#ffd23f', name: 'Breeze',
    strokes: [ellipse(-0.42, -0.25, 0.4, 0.35), ellipse(0.42, -0.25, 0.4, 0.35), ellipse(-0.3, 0.38, 0.28, 0.25),
      ellipse(0.3, 0.38, 0.28, 0.25), line([0, -0.5], [0, 0.65])],
  },
  {
    label: 'tree', behavior: 'root', color: '#7dff6a', name: 'Willow',
    strokes: [line([-0.07, 0.95], [-0.07, 0.2]), line([0.07, 0.95], [0.07, 0.2]), ellipse(0, -0.25, 0.5, 0.48)],
  },
  {
    label: 'flower', behavior: 'root', color: '#ff8a3d', name: 'Basil',
    strokes: [line([0, 0.95], [0, 0.05]), ellipse(0, -0.35, 0.16, 0.16),
      ...[0, 1, 2, 3, 4, 5].map((i) => ellipse(Math.cos(i * 1.047) * 0.33, -0.35 + Math.sin(i * 1.047) * 0.33, 0.17, 0.17, 18)),
      curve([0, 0.55], [0.3, 0.35], [0.4, 0.55])],
  },
  {
    label: 'dog', behavior: 'walk', color: '#c38bff', name: 'Mochi',
    strokes: [ellipse(0.1, 0.05, 0.5, 0.25), ellipse(-0.55, -0.3, 0.24, 0.22), line([-0.7, -0.45], [-0.78, -0.72], [-0.6, -0.5]),
      line([-0.2, 0.25], [-0.22, 0.7]), line([0.0, 0.28], [0.0, 0.7]), line([0.25, 0.28], [0.25, 0.7]), line([0.45, 0.25], [0.47, 0.7]),
      curve([0.58, -0.05], [0.85, -0.2], [0.8, -0.5]), [{ x: -0.6, y: -0.33 }]],
  },
  {
    label: 'sun', behavior: 'sky', color: '#ffcf4a', name: 'Halo',
    strokes: [ellipse(0, 0, 0.42, 0.42),
      ...Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return line([Math.cos(a) * 0.6, Math.sin(a) * 0.6], [Math.cos(a) * 0.92, Math.sin(a) * 0.92]); })],
  },
];
