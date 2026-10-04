# AirSwipe

A Chrome extension that lets you move through YouTube Shorts and TikTok by swiping a finger in the air in front of your webcam.

All hand tracking runs on your own computer. No video leaves it. See the [privacy policy](https://joseph-rebert.github.io/airswipe/).

## How to use

1. Click the AirSwipe icon and press **Turn camera on**.
2. Open YouTube Shorts or TikTok.
3. Make a fist to choose the hand to track, then open it.
4. Flick your index finger up for the next video, down for the previous one.

**Show what the camera sees** in the popup opens a live view of the tracked hand and what the detector is deciding.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder.

## How it works

| File | Job |
|---|---|
| `manifest.json` | Tells Chrome what the extension contains and which permissions it needs |
| `offscreen.js` | Hidden page that reads the webcam and runs hand tracking |
| `lock.js` | Chooses which hand to follow (the one that made a fist) |
| `swipe.js` | Decides when the fingertip movement is a swipe |
| `background.js` | Service worker: turns the camera on/off and passes swipes to the active tab |
| `content.js` | Runs on YouTube/TikTok and moves to the next or previous video |
| `popup.*`, `debug.*`, `permission.*` | Toolbar popup, live camera view, camera permission page |

## Credits

Hand tracking by [MediaPipe](https://github.com/google-ai-edge/mediapipe) (Apache 2.0), bundled in `lib/`.
