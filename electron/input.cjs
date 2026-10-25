// Turns a Wave action into real operating-system input (key presses / a double click).
// nut-js is loaded lazily so the app still starts – and shows a readable error – if the native module is unavailable
// (for example on a Wayland-only Linux desktop).

let nut = null;
let loadError = null;

function getNut() {
  if (nut || loadError) return nut;
  try {
    nut = require("@nut-tree-fork/nut-js");
    nut.keyboard.config.autoDelayMs = 0;
    nut.mouse.config.autoDelayMs = 0;
  } catch (e) {
    loadError = e;
  }
  return nut;
}

const ACTIONS = new Set(["play", "pause", "volume_up", "volume_down", "mute", "prev_item", "next_item", "like"]);

async function tap(key) {
  await nut.keyboard.pressKey(key);
  await nut.keyboard.releaseKey(key);
}

/**
 * @param {string} action  one of ACTIONS
 * @param {{ swipeKeys?: "arrows" | "media" }} [opts]
 *   swipeKeys "arrows" (default): prev/next = Up / Down arrow  -> YouTube Shorts, Instagram Reels, TikTok in a browser
 *   swipeKeys "media":            prev/next = media Previous / Next key -> Spotify, VLC, any music player
 */
async function perform(action, opts = {}) {
  if (!ACTIONS.has(action)) return { ok: false, error: `Unknown action: ${action}` };
  const n = getNut();
  if (!n) {
    const hint =
      process.platform === "linux"
        ? " On Linux, Wave needs an X11 session (Wayland blocks synthetic input)."
        : "";
    return { ok: false, error: `Input module failed to load: ${loadError && loadError.message}.${hint}` };
  }
  const { Key, Button, mouse } = n;
  try {
    switch (action) {
      case "play":
      case "pause":
        await tap(Key.AudioPlay); // the OS only has a play/pause TOGGLE key; the app tracks state to keep it idempotent
        break;
      case "volume_up":
        await tap(Key.AudioVolUp);
        break;
      case "volume_down":
        await tap(Key.AudioVolDown);
        break;
      case "mute":
        await tap(Key.AudioMute);
        break;
      case "prev_item":
        await tap(opts.swipeKeys === "media" ? Key.AudioPrev : Key.Up);
        break;
      case "next_item":
        await tap(opts.swipeKeys === "media" ? Key.AudioNext : Key.Down);
        break;
      case "like":
        // double tap = double click at the current mouse position (park the pointer over the video)
        await mouse.doubleClick(Button.LEFT);
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { perform, ACTIONS };
