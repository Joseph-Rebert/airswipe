// Camera view: shows the frames the offscreen page gave the model, with the
// tracked hand drawn on top and what the swipe detector decided on each one.
const stage = document.getElementById('stage');
const picture = document.getElementById('frame');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const verdict = document.getElementById('verdict');
const directionLabel = document.getElementById('direction');
const fill = document.getElementById('fill');
const log = document.getElementById('log');

// Which hand points to join with lines (thumb, four fingers, palm).
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const INDEX_FINGERTIP = 8;
const TRAIL_MS = 400;
const SWIPE_SHOWN_MS = 700; // keep "swipe" on screen long enough to read

let trail = [];
let swipeShownUntil = 0;

function drawSkeleton(hand, lineColor, dotColor) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = lineColor;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(...px(hand[a]));
    ctx.lineTo(...px(hand[b]));
    ctx.stroke();
  }
  ctx.fillStyle = dotColor;
  for (const point of hand) {
    ctx.beginPath();
    ctx.arc(...px(point), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function px(point) {
  return [point.x * canvas.width, point.y * canvas.height];
}

// hands: every hand found; tracked: index of the chosen one, or -1.
function draw(hands, tracked) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = performance.now();
  trail = tracked >= 0 ? trail.filter((p) => now - p.t < TRAIL_MS) : [];

  hands.forEach((hand, i) => {
    if (i !== tracked) drawSkeleton(hand, 'rgba(160, 160, 160, 0.6)', 'rgba(160, 160, 160, 0.8)');
  });
  if (tracked < 0) return;

  const hand = hands[tracked];
  drawSkeleton(hand, 'rgba(255, 255, 255, 0.8)', '#60a5fa');
  trail.push({ ...hand[INDEX_FINGERTIP], t: now });
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#4ade80';
  ctx.beginPath();
  trail.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p))));
  ctx.stroke();
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(...px(hand[INDEX_FINGERTIP]), 8, 0, Math.PI * 2);
  ctx.fill();
}

function showVerdict(text) {
  verdict.textContent = text;
  verdict.className = text.startsWith('swipe') ? 'swipe' : text.startsWith('ignored') ? 'ignored' : '';
}

function onFrame(frame) {
  if (frame.image) picture.src = frame.image;
  if (frame.aspect) {
    stage.style.aspectRatio = frame.aspect;
    const height = Math.round(canvas.width / frame.aspect);
    if (canvas.height !== height) canvas.height = height;
  }
  draw(frame.hands, frame.tracked);

  const now = performance.now();
  if (frame.swipe) {
    swipeShownUntil = now + SWIPE_SHOWN_MS;
    const meaning = frame.swipe === 'up' ? 'next video' : 'previous video';
    showVerdict(`swipe ${frame.swipe} → ${meaning}`);
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()}  swipe ${frame.swipe} (${meaning})`;
    log.prepend(item);
    while (log.children.length > 8) log.lastChild.remove();
  } else if (now > swipeShownUntil) {
    showVerdict(frame.verdict);
  }

  const amount = Math.min(frame.travel / frame.needed, 1);
  fill.style.width = `${amount * 100}%`;
  fill.classList.toggle('enough', amount >= 1);
  directionLabel.textContent = frame.travel > 0.1 ? `(${frame.direction})` : '';
}

// The detector runs in the offscreen page. Keep trying until it is there.
function connect() {
  const port = chrome.runtime.connect({ name: 'debug' });
  port.onMessage.addListener(onFrame);
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // expected while the offscreen page is not running
    draw([], -1);
    showVerdict('camera is off – turn it on from the extension icon');
    setTimeout(connect, 500);
  });
}

chrome.runtime.sendMessage({ type: 'set-camera', on: true }).then(connect);
