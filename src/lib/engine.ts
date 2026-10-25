// Temporal filter + cooldown buffer.
// A raw per-frame prediction is noisy. Before an action fires, the same gesture must be held for `holdMs`
// (debounce; some poses scale this). Discrete actions then fire once per hold and are locked by a global cooldown;
// continuous actions (volume, next / previous) repeat while the gesture stays.
//
// Swipes (optional) are already "events", so they bypass the hold timer but respect their own cooldown in lib/motion.ts.

import { GESTURE_BY_ID, type ActionId, type GestureId } from "./gestures.ts";

export interface EngineConfig {
  holdMs: number;
  cooldownMs: number;
  /** repeat interval of the volume poses */
  repeatMs: number;
  /** repeat interval of the next / previous poses */
  skipMs: number;
}

export interface EngineResult {
  action: ActionId | null;
  /** 0..1 progress of the hold-to-confirm ring */
  holdProgress: number;
  /** 0..1 – how much of the discrete cooldown is still remaining */
  cooldownLeft: number;
}

export class ActionEngine {
  private candidate: GestureId = "none";
  private since = 0;
  private fired = false;
  private lastDiscrete = -Infinity;
  private lastRepeat = -Infinity;
  private suppressUntil = -Infinity;

  update(gesture: GestureId, now: number, cfg: EngineConfig): EngineResult {
    if (now < this.suppressUntil) {
      this.candidate = "none";
      return { action: null, holdProgress: 0, cooldownLeft: Math.max(0, 1 - (now - this.lastDiscrete) / cfg.cooldownMs) };
    }
    if (gesture !== this.candidate) {
      this.candidate = gesture;
      this.since = now;
      this.fired = false;
      this.lastRepeat = -Infinity; // a newly shown pose always gets its first repeat right after the hold
    }

    const cooldownLeft = Math.max(0, 1 - (now - this.lastDiscrete) / cfg.cooldownMs);

    if (gesture === "none") {
      return { action: null, holdProgress: 0, cooldownLeft };
    }

    const meta = GESTURE_BY_ID[gesture];
    const need = cfg.holdMs * (meta.holdScale ?? 1);
    const held = now - this.since;
    const holdProgress = Math.min(1, held / need);
    let action: ActionId | null = null;

    if (held >= need) {
      if (meta.continuous) {
        const interval = meta.repeat === "skip" ? cfg.skipMs : cfg.repeatMs;
        if (now - this.lastRepeat >= interval) {
          action = meta.action;
          this.lastRepeat = now;
        }
      } else if (!this.fired && now - this.lastDiscrete >= cfg.cooldownMs) {
        action = meta.action;
        this.fired = true;
        this.lastDiscrete = now;
      }
    }

    return { action, holdProgress, cooldownLeft };
  }

  /** a swipe just fired: hold the static poses off for a moment so they cannot double-trigger */
  suppress(now: number, ms = 700) {
    this.candidate = "none";
    this.fired = false;
    this.suppressUntil = now + ms;
  }

  reset() {
    this.candidate = "none";
    this.fired = false;
  }
}
