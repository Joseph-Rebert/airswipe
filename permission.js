// Asking once here grants the camera to the whole extension, including the
// hidden offscreen page, which cannot show a permission prompt itself.
const status = document.getElementById('status');

// What to do about each way the camera can fail.
const ADVICE = {
  NotAllowedError:
    'Chrome is blocking the camera for this extension. Click "Allow camera" and choose "Allow while visiting the site" (not "Allow this time"). If no prompt appears, click the icon at the left of the address bar and set Camera to Allow.',
  NotReadableError:
    'The camera could not be started. Close other apps that use it (Zoom, FaceTime, Photo Booth), and check System Settings → Privacy & Security → Camera has Google Chrome switched on.',
  NotFoundError: 'No camera was found on this computer.',
  CameraStopped:
    'This happens when the camera is unplugged, the laptop lid is closed, or the computer sleeps. Turn the camera back on from the AirSwipe icon.',
  TrackingFailed:
    'Hand tracking stopped working. Turn the camera back on from the AirSwipe icon; if it keeps happening, restart Chrome.',
};

function explain(message) {
  const name = Object.keys(ADVICE).find((n) => message.includes(n));
  return `The camera turned off: ${message}\n\n${name ? ADVICE[name] : ''}`;
}

// The service worker sends us here with ?error=... when the camera fails.
const error = new URLSearchParams(location.search).get('error');
if (error) status.textContent = explain(error);

document.getElementById('allow').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    await chrome.runtime.sendMessage({ type: 'set-camera', on: true });
    status.textContent = 'Camera allowed and switched on. You can close this tab.';
  } catch (err) {
    status.textContent = explain(String(err));
  }
});
