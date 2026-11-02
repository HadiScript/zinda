// ml5 DoodleNet wrapper: loads once, classifies a canvas of black-on-white strokes.

let loading = null;

export function loadClassifier() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      if (!window.ml5) return reject(new Error('ml5 failed to load'));
      const timer = setTimeout(() => reject(new Error('DoodleNet load timed out')), 60000);
      let c;
      try {
        c = ml5.imageClassifier('DoodleNet', () => { clearTimeout(timer); resolve(c); });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }
  return loading;
}

export async function classify(canvas) {
  const c = await loadClassifier();
  return new Promise((resolve, reject) => {
    const done = (a, b) => {
      const r = Array.isArray(a) ? a : b;
      if (!Array.isArray(r)) return reject(a || b || new Error('No results'));
      resolve(r.map((x) => ({ label: String(x.label).replace(/_/g, ' ').toLowerCase(), confidence: x.confidence })));
    };
    const p = c.classify(canvas, done);
    if (p && typeof p.then === 'function') p.then((r) => done(r), reject);
  });
}
