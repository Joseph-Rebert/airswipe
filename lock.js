// Chooses which hand to follow. Nothing is tracked until a hand makes a fist;
// that hand then stays "locked" until it has been out of view for a while,
// or until another hand makes a fist and takes over.

const WRIST = 0;
// [fingertip, middle joint] for the index, middle, ring and little fingers.
const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];

const FIST_HOLD_MS = 250; // a fist must be held this long to count
const LOST_MS = 1000; // drop the lock when the hand is gone this long
const MAX_JUMP = 0.3; // furthest a hand can move between frames and still be "the same hand"

let locked = null; // { x, y, lastSeenAt } of the locked hand's wrist
let candidate = null; // { x, y, since } of a fist that is not yet locked

function distance(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

// A finger is curled when its tip is nearer the wrist than its middle joint.
export function isFist(hand, aspect) {
  return FINGERS.every(
    ([tip, joint]) => distance(hand[tip], hand[WRIST], aspect) < distance(hand[joint], hand[WRIST], aspect)
  );
}

function nearest(hands, point, aspect) {
  let best = -1;
  let bestDistance = MAX_JUMP;
  hands.forEach((hand, i) => {
    const d = distance(hand[WRIST], point, aspect);
    if (d < bestDistance) [best, bestDistance] = [i, d];
  });
  return best;
}

// hands: every hand MediaPipe found this frame (each 21 points).
// Returns { index, fist, changed }: which entry of `hands` is the locked hand
// (-1 if none), whether it is currently a fist, and whether the lock has just
// moved to this hand.
export function chooseHand(hands, now, aspect) {
  let index = locked ? nearest(hands, locked, aspect) : -1;
  if (index >= 0) {
    locked = { ...hands[index][WRIST], lastSeenAt: now };
  } else if (locked && now - locked.lastSeenAt > LOST_MS) {
    locked = null;
  }

  let changed = false;

  // Look for a fist on any hand that is not the locked one.
  const fistIndex = hands.findIndex((hand, i) => i !== index && isFist(hand, aspect));
  if (fistIndex < 0) {
    candidate = null;
  } else {
    const wrist = hands[fistIndex][WRIST];
    const sameFist = candidate && distance(wrist, candidate, aspect) < MAX_JUMP;
    candidate = { ...wrist, since: sameFist ? candidate.since : now };
    if (now - candidate.since >= FIST_HOLD_MS) {
      locked = { ...wrist, lastSeenAt: now };
      candidate = null;
      index = fistIndex;
      changed = true;
    }
  }

  return { index, fist: index >= 0 && isFist(hands[index], aspect), changed };
}
