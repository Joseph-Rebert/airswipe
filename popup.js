// The popup is a tiny web page that exists only while it is open, so it asks
// the service worker for the current state every time.
const toggle = document.getElementById('toggle');
const error = document.getElementById('error');
const status = document.getElementById('status');
let cameraOn = false;

function render(state) {
  cameraOn = state.on;
  toggle.textContent = cameraOn ? 'Turn camera off' : 'Turn camera on';
  error.textContent = state.error ?? '';
}

chrome.runtime.sendMessage({ type: 'get-state' }).then(render);

toggle.addEventListener('click', async () => {
  render(await chrome.runtime.sendMessage({ type: 'set-camera', on: !cameraOn }));
});

for (const direction of ['up', 'down']) {
  document.getElementById(`test-${direction}`).addEventListener('click', () => {
    // Show what the page did with the swipe, so a failure explains itself.
    chrome.runtime.sendMessage({ type: 'swipe', direction }).then((result) => {
      status.textContent = result ?? '';
    });
  });
}

document.getElementById('view').addEventListener('click', () => {
  chrome.tabs.create({ url: 'debug.html' });
});
