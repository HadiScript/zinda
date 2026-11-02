import { classify } from './ai.js';
import { behaviorFor, BEHAVIORS } from './creatures.js';

const COLORS = ['#3ff0ff', '#ff5fa2', '#ffd23f', '#7dff6a', '#c38bff', '#ff8a3d', '#ffffff'];

// Points live in pad space [0, 1] so the canvas can resize freely.
export class DrawPad {
  constructor({ onSubmit, onStroke }) {
    this.el = document.getElementById('pad');
    this.canvas = document.getElementById('pad-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cursor = document.getElementById('hand-cursor');
    this.guessEl = document.getElementById('guess-text');
    this.goBtn = document.getElementById('pad-go');
    this.hint = this.el.querySelector('.pad-hint');
    this.onSubmit = onSubmit;
    this.onStroke = onStroke;

    this.strokes = [];
    this.current = null;
    this.color = COLORS[0];
    this.guess = null;
    this.autoBehavior = 'walk';
    this.manualBehavior = null;
    this.classifyTimer = 0;
    this.classifyToken = 0;

    this.buildSwatches();
    this.buildChips();
    this.bindPointer();
    document.getElementById('pad-undo').onclick = () => this.undo();
    document.getElementById('pad-clear').onclick = () => this.clear();
    document.getElementById('pad-close').onclick = () => this.close();
    this.goBtn.onclick = () => this.submit();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
  }

  get isOpen() { return !this.el.hidden; }

  open() {
    this.el.hidden = false;
    requestAnimationFrame(() => { this.el.classList.add('show'); this.resize(); });
  }

  close() {
    this.el.classList.remove('show');
    this.endStroke();
    setTimeout(() => { if (!this.el.classList.contains('show')) this.el.hidden = true; }, 220);
  }

  buildSwatches() {
    const wrap = this.el.querySelector('.swatches');
    COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 0 ? ' active' : '');
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', `Color ${c}`);
      b.onclick = () => {
        this.color = c;
        wrap.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === b));
        this.render();
      };
      wrap.appendChild(b);
    });
  }

  buildChips() {
    const wrap = this.el.querySelector('.chips');
    for (const [key, b] of Object.entries(BEHAVIORS)) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.b = key;
      chip.innerHTML = `<span>${b.emoji}</span>${b.label}`;
      chip.onclick = () => {
        this.manualBehavior = this.manualBehavior === key ? null : key;
        this.syncChips();
      };
      wrap.appendChild(chip);
    }
    this.syncChips();
  }

  get behavior() { return this.manualBehavior || this.autoBehavior; }

  syncChips() {
    this.el.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.b === this.behavior);
      c.classList.toggle('manual', c.dataset.b === this.manualBehavior);
    });
  }

  bindPointer() {
    const toPad = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.beginStroke(toPad(e));
    });
    this.canvas.addEventListener('pointermove', (e) => { if (this.current) this.addPoint(toPad(e)); });
    const end = () => this.endStroke();
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  // Hand tracking input: {x, y} in [0, 1], pinching = pen down
  handInput({ x, y, pinching, visible }) {
    if (!this.isOpen) return;
    this.cursor.hidden = !visible;
    if (!visible) { this.endStroke(); return; }
    this.cursor.style.left = `${x * 100}%`;
    this.cursor.style.top = `${y * 100}%`;
    this.cursor.classList.toggle('down', pinching);
    if (pinching && !this.current) this.beginStroke({ x, y });
    else if (pinching) this.addPoint({ x, y });
    else this.endStroke();
  }

  beginStroke(p) {
    this.current = [p];
    this.strokes.push(this.current);
    this.hint.hidden = true;
    this.render();
  }

  addPoint(p) {
    const last = this.current[this.current.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
    this.current.push(p);
    this.render();
  }

  endStroke() {
    if (!this.current) return;
    this.current = null;
    this.onStroke?.();
    this.goBtn.disabled = this.strokes.length === 0;
    clearTimeout(this.classifyTimer);
    this.classifyTimer = setTimeout(() => this.runClassifier(), 180);
  }

  undo() {
    this.strokes.pop();
    this.afterEdit();
  }

  clear() {
    this.strokes = [];
    this.manualBehavior = null;
    this.afterEdit();
  }

  afterEdit() {
    this.current = null;
    this.goBtn.disabled = this.strokes.length === 0;
    this.hint.hidden = this.strokes.length > 0;
    this.render();
    if (this.strokes.length) this.runClassifier();
    else { this.guess = null; this.guessEl.textContent = 'draw something'; this.autoBehavior = 'walk'; this.syncChips(); }
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    for (const pass of [{ blur: W * 0.035, w: 0.022 }, { blur: 0, w: 0.012 }]) {
      ctx.shadowBlur = pass.blur;
      ctx.lineWidth = W * pass.w;
      if (pass.blur === 0) ctx.strokeStyle = ctx.fillStyle = '#ffffff';
      for (const s of this.strokes) {
        if (s.length === 1) {
          ctx.beginPath(); ctx.arc(s[0].x * W, s[0].y * H, ctx.lineWidth * 0.8, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(s[0].x * W, s[0].y * H);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * W, s[i].y * H);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  // DoodleNet wants dark strokes on white, roughly centered
  toClassifierCanvas() {
    const S = 280, pad = 30;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    const b = this.bounds();
    const scale = (S - pad * 2) / Math.max(b.w, b.h, 0.05);
    const ox = (S - b.w * scale) / 2 - b.minX * scale, oy = (S - b.h * scale) / 2 - b.minY * scale;
    g.strokeStyle = g.fillStyle = '#000'; g.lineWidth = 12; g.lineCap = g.lineJoin = 'round';
    for (const s of this.strokes) {
      g.beginPath();
      g.moveTo(s[0].x * scale + ox, s[0].y * scale + oy);
      if (s.length === 1) g.lineTo(s[0].x * scale + ox + 0.1, s[0].y * scale + oy);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i].x * scale + ox, s[i].y * scale + oy);
      g.stroke();
    }
    return c;
  }

  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.strokes) for (const p of s) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }

  async runClassifier() {
    if (!this.strokes.length) return;
    const token = ++this.classifyToken;
    if (!this.guess) this.guessEl.textContent = 'thinking…';
    try {
      const results = await classify(this.toClassifierCanvas());
      if (token !== this.classifyToken || !this.strokes.length) return;
      const [top, second] = results;
      this.guess = top;
      this.autoBehavior = behaviorFor(top.label);
      this.guessEl.innerHTML = `a <b>${top.label}</b> <em>${Math.round(top.confidence * 100)}%</em>` +
        (second ? ` <small>or ${second.label}?</small>` : '');
      this.syncChips();
    } catch (err) {
      console.warn('DoodleNet unavailable', err);
      if (token === this.classifyToken) this.guessEl.textContent = 'AI is offline — pick how it lives ↓';
    }
  }

  submit() {
    if (!this.strokes.length) return;
    const b = this.bounds();
    const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2, half = Math.max(b.w, b.h, 0.05) / 2;
    const r = (v) => Math.round(v * 1000) / 1000;
    const strokes = this.strokes.map((s) => {
      const out = [];
      for (const p of s) {
        const q = { x: r((p.x - cx) / half), y: r((p.y - cy) / half) };
        const last = out[out.length - 1];
        if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.015) out.push(q);
      }
      return out;
    });
    this.onSubmit({
      strokes,
      color: this.color,
      label: this.guess?.label || 'doodle',
      behavior: this.behavior,
    });
    this.guess = null;
    this.clear();
    this.close();
  }
}
