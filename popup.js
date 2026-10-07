// The popup is a tiny web page that exists only while it is open, so it asks
// the service worker for the current state every time.
const toggle = document.getElementById('toggle');
const camera = document.getElementById('camera');
const stateText = document.getElementById('state-text');
const hint = document.getElementById('hint');
const error = document.getElementById('error');
const status = document.getElementById('status');

function render(state) {
  toggle.checked = state.on;
  camera.classList.toggle('on', state.on);
  stateText.textContent = state.on ? 'Camera on' : 'Camera off';
  hint.textContent = state.on ? 'Watching for your hand.' : 'Turn on to scroll with your hand.';
  error.textContent = state.error ?? '';
}

chrome.runtime.sendMessage({ type: 'get-state' }).then(render);

// While developing, this popup is read fresh from disk every time it opens,
// but the camera page, service worker and page scripts keep running the code
// from the last reload. If the version on disk is newer, offer to reload.
fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' })
  .then((response) => response.json())
  .then((onDisk) => {
    if (onDisk.version !== chrome.runtime.getManifest().version) {
      document.getElementById('stale').hidden = false;
    }
  });
document.getElementById('reload').addEventListener('click', () => chrome.runtime.reload());

toggle.addEventListener('change', async () => {
  render(await chrome.runtime.sendMessage({ type: 'set-camera', on: toggle.checked }));
});

// The settings save through the service worker; the camera page picks the
// change up from the same message straight away.
const sensitivity = document.getElementById('sensitivity');
const cooldown = document.getElementById('cooldown');
const cooldownValue = document.getElementById('cooldown-value');
const nextOnChoices = document.querySelectorAll('input[name="next-on"]');
const how = document.getElementById('how');
const cameraSelect = document.getElementById('camera-select');

// Fill the camera dropdown. Chrome only reveals camera names once the camera
// permission has been granted, so before that only the default is offered.
async function listCameras(savedId) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId && d.label);
  const addOption = (value, text) => cameraSelect.add(new Option(text, value));
  for (const camera of cameras) {
    addOption(camera.deviceId, camera.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, ''));
  }
  // Keep a saved camera that is unplugged right now, so it is used again
  // when it comes back.
  if (savedId && !cameras.some((camera) => camera.deviceId === savedId)) {
    addOption(savedId, 'Saved camera (not connected)');
  }
  cameraSelect.value = savedId;
}

function nextOn() {
  return document.querySelector('input[name="next-on"]:checked').value;
}

function showSettings() {
  cooldownValue.textContent = `${(cooldown.value / 1000).toFixed(2)} s`;
  const [next, previous] = nextOn() === 'up' ? ['up', 'down'] : ['down', 'up'];
  how.textContent = `Open it and flick ${next} for the next video, ${previous} for the previous.`;
}

chrome.runtime.sendMessage({ type: 'get-settings' }).then((settings) => {
  if (!settings) return; // older code still running; the Update box says so
  sensitivity.value = settings.sensitivity;
  cooldown.value = settings.cooldownMs;
  for (const choice of nextOnChoices) choice.checked = choice.value === settings.nextOn;
  listCameras(settings.cameraId);
  showSettings();
});

function saveSettings() {
  showSettings();
  chrome.runtime.sendMessage({
    type: 'settings',
    sensitivity: Number(sensitivity.value),
    cooldownMs: Number(cooldown.value),
    nextOn: nextOn(),
    cameraId: cameraSelect.value,
  });
}
sensitivity.addEventListener('input', saveSettings);
cooldown.addEventListener('input', saveSettings);
for (const choice of nextOnChoices) choice.addEventListener('change', saveSettings);
cameraSelect.addEventListener('change', saveSettings);

for (const action of ['next', 'previous']) {
  document.getElementById(`test-${action}`).addEventListener('click', () => {
    // Show what the page did with the swipe, so a failure explains itself.
    chrome.runtime.sendMessage({ type: 'swipe', action }).then((result) => {
      status.textContent = result ?? '';
    });
  });
}

document.getElementById('view').addEventListener('click', () => {
  chrome.tabs.create({ url: 'debug.html' });
});
