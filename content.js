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
    if (msg.type !== 'swipe' || globalThis.airSwipeInstance !== instance) return;
    const result = goToVideo(msg.direction);
    console.log('[AirSwipe] swipe', msg.direction, '→', result);
    sendResponse(result);
  });

  const SITE = location.hostname.endsWith('tiktok.com') ? 'tiktok' : 'youtube';

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

  // Like on a phone: swiping UP shows the NEXT video, DOWN the previous one.
  // Returns a short description of what it did, shown in the popup.
  function goToVideo(direction) {
    if (SITE === 'youtube' && !location.pathname.startsWith('/shorts')) {
      return 'This is not a Shorts page.';
    }

    const where = direction === 'up' ? 'next' : 'previous';
    for (const selector of BUTTONS[SITE][where]) {
      const match = document.querySelector(selector);
      // The selector may land on a wrapper around the real button.
      const button = match?.matches('button') ? match : match?.querySelector('button') ?? match;
      if (button && isVisible(button) && !button.disabled) {
        button.click();
        return `Clicked the ${where} button.`;
      }
    }

    // TikTok's feed is a scrolling list with one video per screen.
    const feed = SITE === 'tiktok' && findFeed();
    if (feed) {
      const screens = where === 'next' ? 1 : -1;
      feed.scrollBy({ top: screens * feed.clientHeight, behavior: 'smooth' });
      return `Scrolled the feed to the ${where} video.`;
    }

    // Last resort: the arrow-key shortcut both sites support.
    const key = where === 'next' ? 'ArrowDown' : 'ArrowUp';
    const keyCode = where === 'next' ? 40 : 38;
    for (const type of ['keydown', 'keyup']) {
      document.body.dispatchEvent(
        new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true })
      );
    }
    return `No button or feed found; pressed ${key}.`;
  }
}
