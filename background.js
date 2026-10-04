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
async function setCamera(on) {
  const running = await chrome.offscreen.hasDocument();
  if (on && !running) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Watch the webcam for finger swipes.',
    });
  } else if (!on && running) {
    await chrome.offscreen.closeDocument();
  }
}

// Pass a swipe on to the content script in the tab you are looking at.
// Resolves to a sentence saying what happened, shown in the popup.
async function forwardSwipe(direction) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return 'No active tab found.';
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'swipe', direction });
  } catch {
    return 'This tab is not listening. Open YouTube Shorts or TikTok, or refresh the page if it is already open.';
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-state') {
    chrome.offscreen.hasDocument().then((on) => sendResponse({ on }));
    return true; // keeps sendResponse usable after this function returns
  }
  if (msg.type === 'set-camera') {
    setCamera(msg.on).then(
      () => sendResponse({ on: msg.on }),
      (err) => sendResponse({ on: false, error: String(err) })
    );
    return true;
  }
  if (msg.type === 'swipe') {
    forwardSwipe(msg.direction).then(sendResponse);
    return true;
  }
  if (msg.type === 'camera-error') {
    console.warn('Camera failed:', msg.message);
    setCamera(false);
    // Show the reason on the setup page instead of failing silently.
    chrome.tabs.create({ url: `permission.html?error=${encodeURIComponent(msg.message)}` });
  }
});
