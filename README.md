# Wave – touchless media control (desktop app)

Control videos, reels, shorts and music with your hand. Everything runs on your computer; camera video never leaves it.

## Gestures

Every gesture is a pose you hold still for about a third of a second. A ring fills on screen while you hold it.

| Pose | Action |
|---|---|
| 🖐️ All five fingers open | Play |
| ✊ Fist | Pause |
| ☝️ One finger (hold) | Volume up, repeats |
| ✌️ Two fingers (hold) | Volume down, repeats |
| 👍 Thumbs up | Mute / unmute |
| 4️⃣ Four fingers, thumb folded in (hold) | **Next** reel / video, repeats about once a second |
| 3️⃣ Index, middle and ring up, little finger down (hold) | **Previous**, repeats |
| 🤏 Thumb and index fingertip touching, held about half a second | **Like** |

Four fingers, three fingers and pinch need a slightly longer hold than the rest. This stops them firing while your hand is opening or closing on the way to another pose.

Settings let you switch "three fingers" to thumb + index + middle, swap next and previous, and turn on the older swipe up / down gestures (off by default because a fast flick is much harder to read than a held pose).

## Two control targets

* **This player** – plays local files, links and YouTube inside Wave.
* **Other apps** (desktop app only) – Wave presses real keys / clicks, so it works with whatever window has focus:
  * Shorts / Reels / TikTok in a browser: next / previous = ↓ / ↑ arrow keys
  * Spotify, VLC, any music player: Settings → *In other apps, press* → *Media next / previous*
  * Play / pause / volume / mute = the keyboard media keys
  * Like = a double click at the current mouse position, which likes on Instagram and TikTok on the web. YouTube has no double-click like on desktop.

**How to use it:** open Wave → *Start camera* → choose **Other apps** → **Mini mode** (a small window that stays on top) → click your Reels / Shorts / music window once so it has focus → use your hand. Rest the mouse pointer over the video if you want pinch-to-like.

## Get the installers (no coding needed)

1. Create a GitHub repository and upload this folder.
2. Open **Actions** → *Build Wave installers* → **Run workflow**.
3. When it finishes (about 10 to 15 minutes), download from **Artifacts**:
   * `wave-windows-latest` → installer `.exe` and a portable `.exe`
   * `wave-macos-latest` → `.dmg`
   * `wave-ubuntu-latest` → `.AppImage` and `.deb`

## Build on your own machine

Needs Node.js 22+.

```bash
npm install
npm run app          # build the UI and start the desktop app
npm run dist:win     # Windows installer  -> release/
npm run dist:mac     # macOS .dmg (build on a Mac)
npm run dist:linux   # AppImage + .deb (build on Linux)
npm test             # unit tests: poses, hold timing, pinch, swipes
npm run dev          # browser-only development server
```

While `npm run dev` is running you can preview the gesture ring without a camera: `http://localhost:5173/?hud=four&hold=0.6` (pose ids: `open_palm`, `fist`, `pointer`, `peace`, `thumbs_up`, `four`, `three`, `pinch`).

## First-run notes

* **Windows:** the installer is unsigned, so SmartScreen shows "Windows protected your PC" → *More info* → *Run anyway*.
* **macOS:** unsigned too: right-click the app → *Open*. Allow **Camera** when asked, and add Wave under *System Settings → Privacy & Security → Accessibility*, otherwise macOS blocks the key presses.
* **Linux:** needs an X11 session (Wayland blocks synthetic key presses). `chmod +x Wave-*.AppImage` to run it.
* The hand model (~7 MB) and WASM runtime download from the internet the first time you start the camera.

## Project layout

```
electron/main.cjs        window, local server, camera permission, mini mode, IPC
electron/preload.cjs     the small bridge the UI can call (window.wave)
electron/input.cjs       action -> OS key press / double click (nut-js)
src/App.tsx              screen layout and action handling
src/lib/gestures.ts      pose classifier + gesture tables
src/lib/motion.ts        pinch state + optional swipe detector
src/lib/engine.ts        hold-to-confirm, cooldown and repeat filter
src/lib/settings.ts      saved settings
src/components/          player, library, camera, gesture ring, drawers, welcome guide
scripts/test-gestures.ts
build/icon.png           app icon
```
