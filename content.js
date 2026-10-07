// Content script: Chrome injects this into every YouTube and TikTok page.
// It is the only part of the extension that can touch the page itself.
//
// Everything sits inside { } because the service worker injects this file
// again into already-open tabs when the extension is reloaded, and top-level
// const names cannot be declared twice.
{
  // Only the most recently injected copy should act on a swipe.
  const instance = Symbol();
  globalThis.airSwipeInstance = instance;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (globalThis.airSwipeInstance !== instance) return;
    if (msg.type === 'status') showStatus(msg.state);
    if (msg.type !== 'swipe') return;
    if (onVideoPage()) flashArrow(msg.direction);
    goToVideo(msg.action).then((result) => {
      console.log('[AirSwipe] swipe', msg.direction, '→', result);
      sendResponse(result);
    });
    return true; // the answer comes later, once we know whether the video changed
  });

  // A copy of this script from before an update may have left its cue behind.
  for (const old of document.querySelectorAll('airswipe-cue')) old.remove();

  const SITE = location.hostname.endsWith('tiktok.com') ? 'tiktok' : 'youtube';

  function onVideoPage() {
    return SITE === 'tiktok' || location.pathname.startsWith('/shorts');
  }

  // ---- On-page cue: a small status pill and an arrow that flashes on a swipe.

  const STATUS = {
    searching: { text: 'Make a fist to start', color: '#9aa3b2' },
    fist: { text: 'Hand chosen, now open it', color: '#4d8dff' },
    locked: { text: 'Ready: flick up or down', color: '#4ade80' },
  };
  const STATUS_STALE_MS = 3000; // hide the pill when updates stop (camera off, other tab)

  const CUE_STYLE = `
    :host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
      font: 13px/1 system-ui, -apple-system, sans-serif; }
    .pill { position: absolute; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px;
      padding: 9px 13px; border-radius: 999px; background: rgba(17, 19, 23, 0.85); color: #fff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); opacity: 0; transform: translateY(6px);
      transition: opacity 0.2s, transform 0.2s; }
    .pill.show { opacity: 1; transform: none; }
    .dot { width: 9px; height: 9px; border-radius: 50%; transition: background 0.2s; }
    .arrow { position: absolute; left: 50%; top: 50%; width: 92px; height: 92px; margin: -46px 0 0 -46px;
      display: grid; place-items: center; border-radius: 50%; background: rgba(31, 107, 255, 0.9);
      color: #fff; font-size: 52px; font-weight: 700; opacity: 0; }
    .arrow.flash { animation: flash 0.55s ease-out; }
    @keyframes flash {
      0% { opacity: 0; transform: translateY(calc(var(--dy) * -0.4)) scale(0.8); }
      25% { opacity: 1; transform: none; }
      100% { opacity: 0; transform: translateY(var(--dy)) scale(1.05); }
    }
  `;

  let cue = null;
  let hideTimer = 0;

  // Built with createElement because YouTube forbids setting innerHTML. The
  // shadow root keeps the page's styles and ours from affecting each other.
  function getCue() {
    // In fullscreen only the fullscreen element's children are drawn.
    const parent = document.fullscreenElement ?? document.documentElement;
    if (cue?.host.isConnected) {
      if (cue.host.parentNode !== parent) parent.append(cue.host);
      return cue;
    }
    const host = document.createElement('airswipe-cue');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CUE_STYLE;
    const pill = document.createElement('div');
    pill.className = 'pill';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const text = document.createElement('span');
    pill.append(dot, text);
    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    root.append(style, pill, arrow);
    parent.append(host);
    cue = { host, pill, dot, text, arrow };
    return cue;
  }

  function showStatus(state) {
    clearTimeout(hideTimer);
    const status = STATUS[state];
    if (!status || !onVideoPage()) {
      cue?.pill.classList.remove('show');
      return;
    }
    const { pill, dot, text } = getCue();
    text.textContent = status.text;
    dot.style.background = status.color;
    pill.classList.add('show');
    hideTimer = setTimeout(() => pill.classList.remove('show'), STATUS_STALE_MS);
  }

  // Flash an arrow in the middle of the page, drifting the way the hand moved.
  function flashArrow(direction) {
    const { arrow } = getCue();
    arrow.textContent = direction === 'up' ? '↑' : '↓';
    arrow.style.setProperty('--dy', direction === 'up' ? '-40px' : '40px');
    arrow.classList.remove('flash');
    void arrow.offsetWidth; // restart the animation if one is still playing
    arrow.classList.add('flash');
  }

  // The sites' own next/previous arrow buttons, tried in order.
  const BUTTONS = {
    youtube: {
      next: ['#navigation-button-down button'],
      previous: ['#navigation-button-up button'],
    },
    tiktok: {
      next: ['[data-e2e="feed-navigation-next"]', '[data-e2e="arrow-right"]'],
      previous: ['[data-e2e="feed-navigation-prev"]', '[data-e2e="arrow-left"]'],
    },
  };

  function isVisible(element) {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  // The scrolling list that holds the video in the middle of the screen.
  function findFeed() {
    const middle = innerHeight / 2;
    const current = [...document.querySelectorAll('video')].find((video) => {
      const box = video.getBoundingClientRect();
      return box.width > 0 && box.top < middle && box.bottom > middle;
    });
    for (let el = current?.parentElement; el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
        return el;
      }
    }
    return document.querySelector('#column-list-container');
  }

  const MOVE_TIMEOUT_MS = 800; // how long a video change may take to show up

  // Something that changes whenever a different video is showing: the address
  // on YouTube and on TikTok's single-video pages, the scroll position on
  // TikTok's feeds.
  function position() {
    return `${location.pathname}|${Math.round(findFeed()?.scrollTop ?? 0)}`;
  }

  function moved(before) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const timer = setInterval(() => {
        const changed = position() !== before;
        if (changed || performance.now() - startedAt > MOVE_TIMEOUT_MS) {
          clearInterval(timer);
          resolve(changed);
        }
      }, 50);
    });
  }

  // Three ways to change video, most reliable first. Each returns a sentence
  // if it found something to try, or null if it had nothing to work with.
  const METHODS = [
    function clickButton(where) {
      for (const selector of BUTTONS[SITE][where]) {
        const match = document.querySelector(selector);
        // The selector may land on a wrapper around the real button.
        const button = match?.matches('button') ? match : match?.querySelector('button') ?? match;
        if (button && isVisible(button) && !button.disabled) {
          button.click();
          return `Clicked the ${where} button.`;
        }
      }
      return null;
    },
    // TikTok's feed is a scrolling list with one video per screen.
    function scrollFeed(where) {
      const feed = SITE === 'tiktok' && findFeed();
      if (!feed) return null;
      const screens = where === 'next' ? 1 : -1;
      feed.scrollBy({ top: screens * feed.clientHeight, behavior: 'smooth' });
      return `Scrolled the feed to the ${where} video.`;
    },
    // The arrow-key shortcut both sites support.
    function pressKey(where) {
      const key = where === 'next' ? 'ArrowDown' : 'ArrowUp';
      const keyCode = where === 'next' ? 40 : 38;
      for (const type of ['keydown', 'keyup']) {
        document.body.dispatchEvent(
          new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true })
        );
      }
      return `Pressed ${key}.`;
    },
  ];

  // where is 'next' or 'previous'; the service worker has already turned the
  // swipe direction into one of those using the user's setting.
  //
  // Tries each method in turn and checks that the video really changed, so a
  // site redesign that breaks one method falls through to the next.
  // Resolves to a short description of what happened, shown in the popup.
  async function goToVideo(where) {
    if (!onVideoPage()) return 'This is not a Shorts page.';

    for (const method of METHODS) {
      const before = position();
      const did = method(where);
      if (did && (await moved(before))) return did;
    }
    return where === 'next'
      ? 'Could not move to the next video. This may be the end of the list.'
      : 'Could not move to the previous video. This may be the first one.';
  }
}
