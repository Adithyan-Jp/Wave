// Motion gestures: swipe up / swipe down / double pinch.
//
// Static poses are decided from a single frame. Motions need history, so this detector keeps a short window of
// palm-centre positions (swipes) and a pinch state machine with hysteresis (double pinch).
//
// Only TYPE imports from other modules, so the file can be unit-tested directly with Node.

import type { Landmark } from "./gestures";

export type MotionEvent = "swipe_up" | "swipe_down" | "double_pinch";

export interface MotionConfig {
  /** vertical travel needed for a swipe, as a fraction of the frame height */
  swipeDistance: number;
  /** the travel must happen inside this window */
  swipeWindowMs: number;
  /** lock-out after a swipe so one wave of the hand = one command */
  swipeCooldownMs: number;
  /** max time between the two pinches of a double pinch */
  pinchWindowMs: number;
  /** lock-out after a double pinch */
  pinchCooldownMs: number;
}

export const DEFAULT_MOTION: MotionConfig = {
  swipeDistance: 0.2,
  swipeWindowMs: 400,
  swipeCooldownMs: 800,
  pinchWindowMs: 700,
  pinchCooldownMs: 900,
};

export interface MotionResult {
  event: MotionEvent | null;
  /** palm speed in frame-heights per second (used to ignore static poses while the hand is moving) */
  speed: number;
  /** true while thumb and index are touching */
  pinched: boolean;
}

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const PALM_POINTS = [0, 5, 9, 13, 17];

// pinch ratio = |thumb tip - index tip| / |wrist - middle knuckle|
const PINCH_ON = 0.3;
const PINCH_OFF = 0.5;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class MotionDetector {
  private history: Sample[] = [];
  private lastSwipe = -Infinity;
  private pinchedNow = false;
  private pinchTimes: number[] = [];
  private lastPinchEvent = -Infinity;
  private lastSeen = -Infinity;

  reset() {
    this.history = [];
    this.pinchedNow = false;
    this.pinchTimes = [];
  }

  /**
   * @param image       image-space landmarks (x, y in 0..1, y grows downward) or null if no hand
   * @param world       world landmarks (metres) or null
   * @param now         timestamp in ms
   * @param allowSwipe  caller says the hand is open enough to count as a swipe (>= 3 fingers extended, not pinching)
   */
  update(
    image: Landmark[] | null,
    world: Landmark[] | null,
    now: number,
    cfg: MotionConfig = DEFAULT_MOTION,
    allowSwipe = true,
  ): MotionResult {
    if (!image || !world) {
      // hand lost: forget the path so a re-entering hand is not read as a swipe
      if (now - this.lastSeen > 150) this.reset();
      return { event: null, speed: 0, pinched: false };
    }
    this.lastSeen = now;

    let event: MotionEvent | null = null;

    // ---------- pinch state machine
    const handSize = dist(world[WRIST], world[MIDDLE_MCP]) || 0.09;
    const ratio = dist(world[THUMB_TIP], world[INDEX_TIP]) / handSize;
    if (!this.pinchedNow && ratio < PINCH_ON) {
      this.pinchedNow = true; // rising edge = one "tap"
      this.pinchTimes = this.pinchTimes.filter((t) => now - t <= cfg.pinchWindowMs);
      this.pinchTimes.push(now);
      if (this.pinchTimes.length >= 2 && now - this.lastPinchEvent >= cfg.pinchCooldownMs) {
        event = "double_pinch";
        this.lastPinchEvent = now;
        this.pinchTimes = [];
      }
    } else if (this.pinchedNow && ratio > PINCH_OFF) {
      this.pinchedNow = false;
    }

    // ---------- palm path
    let cx = 0;
    let cy = 0;
    for (const i of PALM_POINTS) {
      cx += image[i].x;
      cy += image[i].y;
    }
    cx /= PALM_POINTS.length;
    cy /= PALM_POINTS.length;
    this.history.push({ t: now, x: cx, y: cy });
    while (this.history.length && now - this.history[0].t > cfg.swipeWindowMs) this.history.shift();

    // speed over the last ~150 ms
    let speed = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const s = this.history[i];
      if (now - s.t >= 150 || i === 0) {
        const dt = (now - s.t) / 1000;
        if (dt > 0.03) speed = Math.hypot(cx - s.x, cy - s.y) / dt;
        break;
      }
    }

    // ---------- swipe
    if (!event && allowSwipe && !this.pinchedNow && now - this.lastSwipe >= cfg.swipeCooldownMs && this.history.length >= 3) {
      const first = this.history[0];
      const dy = cy - first.y;
      const dx = cx - first.x;
      const mostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.4;
      // the path must be monotone enough: current position is near the extreme of the window
      const ys = this.history.map((s) => s.y);
      const extreme = dy < 0 ? Math.min(...ys) : Math.max(...ys);
      const stillTravelling = Math.abs(cy - extreme) < cfg.swipeDistance * 0.35;
      if (Math.abs(dy) >= cfg.swipeDistance && mostlyVertical && stillTravelling) {
        event = dy < 0 ? "swipe_up" : "swipe_down";
        this.lastSwipe = now;
        this.history = [];
      }
    }

    return { event, speed, pinched: this.pinchedNow };
  }
}
