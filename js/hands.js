// Webcam + ml5 handPose → a smoothed fingertip cursor with pinch-to-draw.

let video, stream, handPose, rafId;
let running = false;

export async function startHands({ onInput, previewCanvas, onStatus }) {
  if (running) return;
  onStatus?.('Starting camera…');
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  video = document.createElement('video');
  video.playsInline = true; video.muted = true;
  video.srcObject = stream;
  await video.play();

  onStatus?.('Loading hand model…');
  handPose = await new Promise((resolve) => {
    let h;
    h = ml5.handPose({ maxHands: 1, flipped: true }, () => resolve(h));
  });
  running = true;
  onStatus?.('Pinch to draw ✌');

  let hand = null, lastSeen = 0, pinching = false;
  const smooth = { x: 0.5, y: 0.5 };
  handPose.detectStart(video, (results) => {
    hand = results[0] || null;
    if (hand) lastSeen = performance.now();
  });

  const ctx = previewCanvas.getContext('2d');
  const tick = () => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    const W = video.videoWidth || 640, H = video.videoHeight || 480;
    const pw = previewCanvas.width, ph = previewCanvas.height;

    ctx.save();
    ctx.translate(pw, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, pw, ph);
    ctx.restore();

    const visible = hand && performance.now() - lastSeen < 300;
    if (!visible) { onInput({ visible: false }); return; }

    const kp = Object.fromEntries(hand.keypoints.map((k) => [k.name, k]));
    const tip = kp.index_finger_tip, thumb = kp.thumb_tip;
    const palm = Math.hypot(kp.wrist.x - kp.middle_finger_mcp.x, kp.wrist.y - kp.middle_finger_mcp.y) || 1;
    const pinch = Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / palm;
    // Hysteresis so the pen doesn't flicker on/off
    if (!pinching && pinch < 0.3) pinching = true;
    else if (pinching && pinch > 0.45) pinching = false;

    // Draw between thumb and index so the stroke follows the pinch point
    const px = (tip.x + thumb.x) / 2, py = (tip.y + thumb.y) / 2;
    const nx = Math.min(1, Math.max(0, (px / W - 0.2) / 0.6));
    const ny = Math.min(1, Math.max(0, (py / H - 0.15) / 0.6));
    smooth.x += (nx - smooth.x) * 0.45;
    smooth.y += (ny - smooth.y) * 0.45;
    onInput({ x: smooth.x, y: smooth.y, pinching, visible: true });

    ctx.fillStyle = pinching ? '#ff5fa2' : '#3ff0ff';
    for (const k of hand.keypoints) {
      ctx.beginPath(); ctx.arc((k.x / W) * pw, (k.y / H) * ph, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  };
  tick();
}

export function stopHands() {
  running = false;
  cancelAnimationFrame(rafId);
  try { handPose?.detectStop(); } catch {}
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export const handsRunning = () => running;
