// Runs in the hidden offscreen page: reads the webcam, finds your hand with
// MediaPipe, and asks swipe.js whether it just made a swipe.
import { FilesetResolver, HandLandmarker } from './lib/vision_bundle.mjs';
import { chooseHand } from './lock.js';
import { detectSwipe, resetSwipe, setSensitivity, setCooldown, debug } from './swipe.js';

const video = document.getElementById('cam');

const IDLE_AFTER_MS = 3000; // with no hand in view this long, slow down
const IDLE_INTERVAL_MS = 100; // ...to about 10 checks a second, to save battery
const STALLED_MS = 5000; // camera delivering no new frames for this long has stopped
const MAX_FAILURES = 30; // hand tracking failing this many frames in a row is broken

// Messages nobody answers reject their promise; that is expected here.
function send(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

let failed = false;
function fail(message) {
  if (failed) return;
  failed = true;
  send({ type: 'camera-error', message });
}

const CAMERA_SIZE = { width: 640, height: 480 };

let track = null; // the video track of the camera in use
let cameraId = null; // which camera that is; '' means Chrome's default
let cameraQueue = Promise.resolve();

async function openCamera(id) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: id ? { ...CAMERA_SIZE, deviceId: { exact: id } } : CAMERA_SIZE,
    });
  } catch (err) {
    // The chosen camera is unplugged or gone: use the default instead.
    if (!id || !['OverconstrainedError', 'NotFoundError'].includes(err.name)) throw err;
    stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_SIZE });
  }
  const previous = track;
  track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  await video.play();
  previous?.stop();
  resetSwipe(); // the hand is somewhere else in the new picture
}

// Switch to a camera. Requests are queued so a second choice made while the
// first camera is still opening cannot leave two cameras running.
function useCamera(id) {
  cameraQueue = cameraQueue
    .then(() => {
      if (id === cameraId) return;
      cameraId = id;
      return openCamera(id);
    })
    .catch((err) => fail(String(err)));
  return cameraQueue;
}

// This page cannot read chrome.storage, so the service worker hands over the
// saved settings, and the popup sends changes as they happen.
function applySettings(settings) {
  setSensitivity(settings.sensitivity);
  setCooldown(settings.cooldownMs);
  return useCamera(settings.cameraId ?? '');
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'settings') applySettings(msg);
});

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
  await applySettings(await chrome.runtime.sendMessage({ type: 'get-settings' }));
  if (!track) return; // the camera could not be opened; fail() has reported why

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
  let lastFrameCount = -1;
  let lastTickAt = performance.now();
  let stalledMs = 0;
  let lastProcessedAt = 0;
  let lastHandAt = performance.now();
  let failures = 0;
  let lastState = null;
  let lastStateSentAt = 0;
  setInterval(() => {
    const now = performance.now();
    // Timers do not run while the computer sleeps, so count only short gaps
    // towards "stalled"; otherwise waking up would look like a dead camera.
    const sinceTick = Math.min(now - lastTickAt, 100);
    lastTickAt = now;
    // Unplugged, lid closed, or taken away by the system.
    if (track.readyState === 'ended') return fail('CameraStopped: the camera was disconnected');
    // The frame counter is the only reliable "new frame" signal in a hidden
    // page: currentTime follows the clock, not the camera.
    const frameCount = video.getVideoPlaybackQuality().totalVideoFrames;
    if (frameCount === lastFrameCount) {
      stalledMs += sinceTick;
      if (stalledMs > STALLED_MS) fail('CameraStopped: the camera stopped sending video');
      return;
    }
    stalledMs = 0;
    lastFrameCount = frameCount;

    const idle = now - lastHandAt > IDLE_AFTER_MS;
    if (idle && now - lastProcessedAt < IDLE_INTERVAL_MS) return;
    lastProcessedAt = now;

    let hands;
    try {
      hands = landmarker.detectForVideo(video, now).landmarks;
      failures = 0;
    } catch (err) {
      if (++failures > MAX_FAILURES) fail(`TrackingFailed: ${err}`);
      return;
    }
    if (hands.length) lastHandAt = now;
    const aspect = video.videoWidth / video.videoHeight;
    const tracked = chooseHand(hands, now, aspect);
    if (tracked.changed) resetSwipe();
    // A closed fist only chooses the hand. Hiding it from the swipe detector
    // also stops the hand opening again from looking like a swipe.
    const hand = tracked.index >= 0 && !tracked.fist ? hands[tracked.index] : null;
    const direction = detectSwipe(hand, now, aspect);
    if (direction) {
      console.log('swipe', direction);
      send({ type: 'swipe', direction });
    }
    // Tell the video page what to show in its on-page cue. Repeated every
    // second because the page hides the cue when the updates stop.
    const state = tracked.index < 0 ? 'searching' : tracked.fist ? 'fist' : 'locked';
    if (state !== lastState || now - lastStateSentAt > 1000) {
      lastState = state;
      lastStateSentAt = now;
      send({ type: 'status', state });
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

start().catch((err) => fail(String(err)));
