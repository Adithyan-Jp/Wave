import type { EngineConfig } from "./engine";
import type { ThreeVariant } from "./gestures";
import { DEFAULT_MOTION, type MotionConfig } from "./motion";

export interface Settings {
  /** "app" = Wave's own player, "system" = real key presses in whichever window has focus (desktop app only) */
  target: "app" | "system";
  /** swap Next and Previous */
  invertSkip: boolean;
  /** what Next / Previous press in other apps: arrow keys (Reels, Shorts, TikTok) or media keys (music) */
  skipKeys: "arrows" | "media";
  threeVariant: ThreeVariant;
  /** optional flick gestures */
  swipeEnabled: boolean;
  engine: EngineConfig;
  motion: MotionConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  target: "app",
  invertSkip: false,
  skipKeys: "arrows",
  threeVariant: "ring",
  swipeEnabled: false,
  engine: { holdMs: 350, cooldownMs: 1200, repeatMs: 250, skipMs: 1000 },
  motion: DEFAULT_MOTION,
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings simply will not persist */
  }
}

export const STORE_SETTINGS = "wave.settings.v3";

export function loadSettings(hasDesktop: boolean): Settings {
  const s = readJson<Partial<Settings>>(STORE_SETTINGS, {});
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    engine: { ...DEFAULT_SETTINGS.engine, ...s.engine },
    motion: { ...DEFAULT_SETTINGS.motion, ...s.motion },
  };
  if (!hasDesktop) merged.target = "app"; // controlling other apps only exists in the desktop app
  return merged;
}
