// Decides when the hand has made a swipe.
//
// Called once per camera frame with:
//   hand - MediaPipe's 21 hand points ({ x, y } each, 0 to 1, y = 0 is the
//          TOP of the camera image), or null if no hand is visible.
//   now  - a timestamp in milliseconds.
//   aspect - camera image width / height; makes x distances comparable to y.
//
// Returns 'up' or 'down' at the moment a swipe happens, otherwise null.
//
// Distances are measured in "palm lengths" (wrist to middle knuckle) so the
// same flick counts the same whether your hand is near the camera or far.

const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
const INDEX_FINGERTIP = 8;

// Tuning knobs.
const WINDOW_MS = 220; // a swipe must happen within this long
const MIN_TRAVEL = 0.7; // ...and cover this many palm lengths. Lower = more sensitive
const STRAIGHTNESS = 1.5; // must move this much more vertically than sideways
const COOLDOWN_MS = 350; // shortest gap between two swipes
const WARMUP_MS = 300; // ignore a hand that has only just come into view
const LOST_MS = 200; // tolerate the hand vanishing this long (fast moves blur)
const RETURN_BLOCK_MS = 1200; // longest time the return movement stays ignored
const STILL_TRAVEL = 0.3; // moving less than this over the window counts as holding still

let samples = [];
let palm = 0;
let visibleSince = null;
let lastSeenAt = -Infinity;
let lastSwipeAt = -Infinity;
let lastDirection = null;
// After a swipe your hand has to travel back the other way. That return
// movement is ignored until the hand pauses or RETURN_BLOCK_MS passes.
let returnBlocked = false;

// What the detector decided on the latest frame, for the camera view page.
export const debug = { verdict: 'no hand in view', direction: null, travel: 0, needed: MIN_TRAVEL };

export function detectSwipe(hand, now, aspect = 4 / 3) {
  if (!hand) {
    if (now - lastSeenAt > LOST_MS) {
      samples = [];
      palm = 0;
      visibleSince = null;
    }
    Object.assign(debug, { verdict: 'no hand in view', direction: null, travel: 0 });
    return null;
  }
  lastSeenAt = now;
  visibleSince ??= now;

  const size = Math.hypot(
    (hand[MIDDLE_KNUCKLE].x - hand[WRIST].x) * aspect,
    hand[MIDDLE_KNUCKLE].y - hand[WRIST].y
  );
  palm = palm ? palm * 0.8 + size * 0.2 : size; // smoothed, single frames are jittery

  const tip = { x: hand[INDEX_FINGERTIP].x, y: hand[INDEX_FINGERTIP].y, t: now };
  samples.push(tip);
  while (samples[0].t < now - WINDOW_MS) samples.shift();

  // The lowest and highest points the fingertip reached within the window.
  let lowest = tip;
  let highest = tip;
  for (const s of samples) {
    if (s.y > lowest.y) lowest = s;
    if (s.y < highest.y) highest = s;
  }

  const sinceSwipe = now - lastSwipeAt;
  const heldStill =
    (lowest.y - highest.y) / palm < STILL_TRAVEL && now - samples[0].t > WINDOW_MS * 0.7;
  if (sinceSwipe > RETURN_BLOCK_MS || (heldStill && sinceSwipe > WINDOW_MS)) {
    returnBlocked = false;
  }

  const up = (lowest.y - tip.y) / palm;
  const down = (tip.y - highest.y) / palm;
  const direction = up >= down ? 'up' : 'down';
  const from = direction === 'up' ? lowest : highest;
  const travel = Math.max(up, down);
  const sideways = (Math.abs(tip.x - from.x) * aspect) / palm;

  Object.assign(debug, { direction, travel });
  if (travel < MIN_TRAVEL) {
    debug.verdict = 'watching: movement too small or too slow';
    return null;
  }
  if (travel < sideways * STRAIGHTNESS) {
    debug.verdict = 'ignored: too sideways';
    return null;
  }
  if (now - visibleSince < WARMUP_MS) {
    debug.verdict = 'ignored: hand only just appeared';
    return null;
  }
  if (sinceSwipe < COOLDOWN_MS) {
    debug.verdict = 'ignored: too soon after the last swipe';
    return null;
  }
  if (returnBlocked && direction !== lastDirection) {
    debug.verdict = 'ignored: hand moving back after a swipe';
    return null;
  }

  lastSwipeAt = now;
  lastDirection = direction;
  returnBlocked = true;
  samples = [tip];
  debug.verdict = `swipe ${direction}`;
  return direction;
}
