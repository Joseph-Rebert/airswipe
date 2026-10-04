// Runs in the hidden offscreen page: reads the webcam, finds your hand with
// MediaPipe, and asks swipe.js whether it just made a swipe.
import { FilesetResolver, HandLandmarker } from './lib/vision_bundle.mjs';
import { chooseHand } from './lock.js';
import { detectSwipe, debug } from './swipe.js';

const video = document.getElementById('cam');

// Camera view pages (debug.html) connect here to watch the detector live.
const viewers = new Set();
const snapshot = document.createElement('canvas');

// A small JPEG of the exact frame the model was given, for the camera view.
function takeSnapshot() {
  snapshot.width = 320;
  snapshot.height = Math.round((320 * video.videoHeight) / video.videoWidth);
  snapshot.getContext('2d').drawImage(video, 0, 0, snapshot.width, snapshot.height);
  return snapshot.toDataURL('image/jpeg', 0.6);
}
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'debug') return;
  viewers.add(port);
  port.onDisconnect.addListener(() => viewers.delete(port));
});

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
  });
  video.srcObject = stream;
  await video.play();

  const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('lib/wasm'));
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('lib/hand_landmarker.task'),
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    // Lower than the 0.5 defaults so a fast, blurry hand is not dropped mid-swipe.
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  console.log('Hand tracking started');

  // Check often, but only do the work when the camera has a new frame.
  let lastFrameTime = -1;
  setInterval(() => {
    if (video.currentTime === lastFrameTime) return;
    lastFrameTime = video.currentTime;
    const now = performance.now();
    const hands = landmarker.detectForVideo(video, now).landmarks;
    const aspect = video.videoWidth / video.videoHeight;
    const tracked = chooseHand(hands, now, aspect);
    // A closed fist only chooses the hand. Hiding it from the swipe detector
    // also stops the hand opening again from looking like a swipe.
    const hand = tracked.index >= 0 && !tracked.fist ? hands[tracked.index] : null;
    const direction = detectSwipe(hand, now, aspect);
    if (direction) {
      console.log('swipe', direction);
      chrome.runtime.sendMessage({ type: 'swipe', direction });
    }
    if (viewers.size) {
      const frame = { image: takeSnapshot(), aspect, hands, tracked: tracked.index, swipe: direction, ...debug };
      if (tracked.index < 0) {
        frame.verdict = hands.length ? 'make a fist to choose this hand' : 'no hand in view';
      } else if (tracked.fist) {
        frame.verdict = 'fist: hand chosen, open it to swipe';
      }
      for (const port of viewers) port.postMessage(frame);
    }
  }, 8);
}

start().catch((err) => {
  chrome.runtime.sendMessage({ type: 'camera-error', message: String(err) });
});
