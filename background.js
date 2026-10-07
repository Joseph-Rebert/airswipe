// The service worker: the extension's switchboard. It has no page of its own,
// Chrome starts it when a message or event arrives and stops it when idle,
// so it must not rely on variables surviving between events.

// Chrome can only show the camera permission prompt on a visible page, so
// open one right after install.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'permission.html' });
  injectIntoOpenTabs();
});

// Chrome only adds content.js to pages loaded after the extension was
// installed or reloaded. Add it to tabs that were already open, so they work
// without a refresh.
async function injectIntoOpenTabs() {
  const matches = chrome.runtime.getManifest().content_scripts[0].matches;
  for (const tab of await chrome.tabs.query({ url: matches })) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      .catch(() => {}); // tab is still loading, discarded, or showing an error page
  }
}

// The camera lives in an "offscreen document": a hidden extension page that
// keeps running while you browse. Camera on = that page exists.
//
// Requests are queued so two quick clicks cannot both try to create the page.
let cameraQueue = Promise.resolve();
function setCamera(on) {
  const request = cameraQueue.then(() => applyCamera(on));
  cameraQueue = request.catch(() => {});
  return request;
}

async function applyCamera(on) {
  const running = await chrome.offscreen.hasDocument();
  if (on && !running) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Watch the webcam for finger swipes.',
    });
  } else if (!on && running) {
    await chrome.offscreen.closeDocument();
    sendToActiveTab({ type: 'status', state: 'off' });
  }
}

// Send a message to the content script in the tab you are looking at.
// For a swipe, resolves to a sentence saying what happened, shown in the popup.
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return 'No active tab found.';
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return 'This tab is not listening. Open YouTube Shorts or TikTok, or refresh the page if it is already open.';
  }
}

// Show why the camera stopped on the setup page instead of failing silently.
// Reuses a setup tab that is already open rather than piling up new ones.
async function showCameraError(message) {
  const url = chrome.runtime.getURL(`permission.html?error=${encodeURIComponent(message)}`);
  const pages = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
  const open = pages.find((page) => page.documentUrl.includes('/permission.html'));
  if (open) chrome.tabs.update(open.tabId, { url, active: true });
  else chrome.tabs.create({ url });
}

const DEFAULT_SETTINGS = { sensitivity: 5, cooldownMs: 350, nextOn: 'up', cameraId: '' };

// Work out what a swipe means. The camera reports a direction ('up'/'down');
// the popup's test buttons ask for an action ('next'/'previous'). The page
// gets both: the action to perform and the direction to show in its arrow.
async function resolveSwipe(msg) {
  const { nextOn } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const previousOn = nextOn === 'up' ? 'down' : 'up';
  if (msg.action) {
    return { type: 'swipe', action: msg.action, direction: msg.action === 'next' ? nextOn : previousOn };
  }
  return { type: 'swipe', direction: msg.direction, action: msg.direction === nextOn ? 'next' : 'previous' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-state') {
    chrome.offscreen.hasDocument().then((on) => sendResponse({ on }));
    return true; // keeps sendResponse usable after this function returns
  }
  if (msg.type === 'set-camera') {
    setCamera(msg.on)
      .then(() => null, (err) => String(err))
      .then(async (error) => sendResponse({ on: await chrome.offscreen.hasDocument(), error }));
    return true;
  }
  if (msg.type === 'swipe') {
    resolveSwipe(msg).then(sendToActiveTab).then(sendResponse);
    return true;
  }
  if (msg.type === 'status') {
    sendToActiveTab(msg);
  }
  if (msg.type === 'get-settings') {
    chrome.storage.local.get(DEFAULT_SETTINGS).then(sendResponse);
    return true;
  }
  if (msg.type === 'settings') {
    const { sensitivity, cooldownMs, nextOn, cameraId } = msg;
    chrome.storage.local.set({ sensitivity, cooldownMs, nextOn, cameraId });
  }
  if (msg.type === 'camera-error') {
    console.warn('Camera failed:', msg.message);
    setCamera(false);
    showCameraError(msg.message);
  }
});
