# Wave – touchless media control (desktop app)

Control videos, reels, shorts and music with your hand. Everything runs on your computer; video from the camera never leaves it.

## Gestures

| Gesture | Action |
|---|---|
| 🖐️ Open palm (hold) | Play |
| ✊ Closed fist (hold) | Pause |
| ☝️ Index finger (hold) | Volume up |
| ✌️ Peace sign (hold) | Volume down |
| 👍 Thumbs up (hold) | Mute / unmute |
| ⬆️ Swipe up (quick flick with an open hand) | Previous reel / video |
| ⬇️ Swipe down | Next reel / video |
| 🤏 Pinch twice (thumb + index) | Like (double click at the mouse pointer) |

"Invert swipe direction" in the Tuning panel flips up/down.

## Two control targets

* **This app's player** – plays local files, links and YouTube inside Wave.
* **Other apps** (desktop app only) – Wave presses real keys / clicks, so it works with whatever window has focus:
  * Shorts / Reels / TikTok in a browser: swipe = ↑ / ↓ arrow keys
  * Spotify, VLC, any music player: choose *Media prev / next* under "Swipe presses"
  * Play / pause / volume / mute = the keyboard media keys
  * Like = double click at the current mouse position → works on Instagram Reels and TikTok on the web. YouTube has no double-click-to-like on desktop, so use the on-screen Like button there.

**How to use it:** open Wave → *Enable gesture control* → pick *Other apps* → press **Mini mode** (small window that stays on top) → click your Reels / Shorts / Spotify window once so it has focus → control it with your hand. Park the mouse pointer over the video if you want double-pinch likes.

## Get the installers (no coding needed)

1. Create a GitHub repository and upload this folder (or `git push` it).
2. Open the **Actions** tab → *Build Wave installers* → **Run workflow**.
3. When it finishes (about 10 minutes), download from **Artifacts**:
   * `wave-windows-latest` → `Wave Setup 1.0.0.exe` (installer) and a portable `.exe`
   * `wave-macos-latest` → `Wave-1.0.0.dmg`
   * `wave-ubuntu-latest` → `Wave-1.0.0.AppImage` and `.deb`

## Build on your own machine

Needs Node.js 22+.

```bash
npm install
npm run app          # build the UI and start the desktop app
npm run dist:win     # Windows installer  -> release/
npm run dist:mac     # macOS .dmg (build on a Mac)
npm run dist:linux   # AppImage + .deb (build on Linux)
npm run test:motion  # unit tests for swipe / double-pinch detection
```

## First-run notes

* **Windows:** the installer is unsigned, so SmartScreen shows "Windows protected your PC" → *More info* → *Run anyway*.
* **macOS:** unsigned too: right-click the app → *Open*. Allow **Camera** when asked, and add Wave under *System Settings → Privacy & Security → Accessibility* – without it macOS blocks the key presses.
* **Linux:** needs an X11 session (Wayland blocks synthetic key presses). `chmod +x Wave-*.AppImage` to run it.
* The hand model (~7 MB) and WASM runtime are downloaded from the internet the first time you enable the camera, so that step needs a connection.

## Project layout

```
electron/main.cjs     window, local server, camera permission, mini mode, IPC
electron/preload.cjs  the small bridge the UI can call (window.wave)
electron/input.cjs    action -> OS key press / double click (nut-js)
src/lib/gestures.ts   pose classifier + gesture tables
src/lib/motion.ts     swipe + double-pinch detector
src/lib/engine.ts     hold-to-confirm + cooldown filter
src/components/       player, library, camera, guide, python build
scripts/test-motion.ts
```
