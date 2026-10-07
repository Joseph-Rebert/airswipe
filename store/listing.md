# Chrome Web Store listing for AirSwipe

Copy these into the developer dashboard.

## Name
AirSwipe: Hands-Free Scrolling for Shorts & TikTok

## Summary (132 characters max)
Swipe a finger in the air to scroll YouTube Shorts and TikTok. Hands-free, private: your webcam video never leaves your computer.

## Category
Accessibility (alternative: Fun)

## Language
English

## Description
Scroll short videos without touching your keyboard, mouse or trackpad. AirSwipe watches your hand through your webcam and moves to the next or previous video when you flick a finger in the air.

Great for when your hands are busy or messy: eating, cooking, working out, or leaning back from your desk.

HOW IT WORKS
• Click the AirSwipe icon and turn the camera on.
• Open YouTube Shorts or TikTok.
• Make a fist to choose the hand to track, then open it.
• Flick your index finger up for the next video, down for the previous one.

FEATURES
• Works on YouTube Shorts and TikTok.
• Fist-to-choose: only the hand you pick is tracked, so other movement is ignored.
• Live camera view shows exactly what the extension sees and why it did or didn't count a swipe.
• Adjustable sensitivity and time between swipes, and your choice of swiping up or down for the next video.
• An on-page cue shows when your hand is ready and flashes when a swipe counts.
• Choose which camera to use if you have more than one.
• One click to turn the camera off.

PRIVATE BY DESIGN
• All hand tracking happens on your own computer, inside your browser.
• No video, images or hand positions are ever recorded, stored or sent anywhere.
• No accounts, no analytics, no ads.
• Open source: https://github.com/Joseph-Rebert/airswipe

AirSwipe is an independent project and is not affiliated with or endorsed by YouTube, Google or TikTok.

## Privacy policy URL
https://joseph-rebert.github.io/airswipe/

## Privacy tab

Single purpose:
AirSwipe lets users move to the next or previous video on YouTube Shorts and TikTok using hand swipes detected by their webcam.

Permission justifications:
- offscreen: Runs the webcam and on-device hand tracking in a hidden extension page so it keeps working while the user browses YouTube or TikTok.
- storage: Remembers the user's settings (sensitivity, swipe timing, swipe direction, chosen camera) on their own device.
- scripting: Adds the extension's own content script to YouTube and TikTok tabs that were already open when the extension was installed or updated, so they work without a refresh.
- Host permissions (youtube.com, tiktok.com): Needed to move to the next or previous video on these two sites when the user swipes. No page content is read or collected.
- Remote code: No. All code, including the hand tracking library and model, is bundled in the package.

Data usage: tick none of the data categories. Certify all three statements (no selling data, no unrelated use, no creditworthiness use).

## Images you still need to make
- At least one screenshot, 1280×800 or 640×400. Suggested: the live camera view with your hand tracked, and a Short playing with the popup open.
- Store icon: store/icon512.png is a large copy; the 128×128 one is taken from the package.
- Optional but worth it: a 15–30 second demo video on YouTube showing a swipe changing the video.
