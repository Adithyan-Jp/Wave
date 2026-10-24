// Temporal filter + cooldown buffer.
// A raw per-frame prediction is noisy. Before an action fires, the same gesture must be held for `holdMs`
// (debounce). Discrete actions then fire once per hold and are locked by a global cooldown;
// continuous actions (volume) repeat every `repeatMs` while the gesture stays.
//
// Motion gestures (swipes, double pinch) are already "events", so they bypass the hold timer but respect
// their own cooldowns inside lib/motion.ts.

import { GESTURE_BY_ID, type ActionId, type GestureId } from "./gestures";

export interface EngineConfig {
  holdMs: number;
  cooldownMs: number;
  repeatMs: number;
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
    }

    const cooldownLeft = Math.max(0, 1 - (now - this.lastDiscrete) / cfg.cooldownMs);

    if (gesture === "none") {
      return { action: null, holdProgress: 0, cooldownLeft };
    }

    const meta = GESTURE_BY_ID[gesture];
    const held = now - this.since;
    const holdProgress = Math.min(1, held / cfg.holdMs);
    let action: ActionId | null = null;

    if (held >= cfg.holdMs) {
      if (meta.continuous) {
        if (now - this.lastRepeat >= cfg.repeatMs) {
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

  /** a motion gesture (swipe / pinch) just fired: hold the static poses off for a moment so they cannot double-trigger */
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
