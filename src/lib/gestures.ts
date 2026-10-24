// Geometry-based gesture classifier.
// Input: the 21 MediaPipe hand landmarks (image space) and the 21 "world" landmarks (metric, 3D, origin at the hand centre).
// We use the WORLD landmarks for distances because they are isotropic (not stretched by the camera aspect ratio)
// and use plain distance comparisons so the result is invariant to hand rotation and scale.
//
// Two families of gestures:
//   * POSES   – static hand shapes, recognised every frame here and confirmed by the hold-to-confirm engine.
//   * MOTIONS – swipe up / swipe down / double pinch, recognised over time by lib/motion.ts.

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureId = "open_palm" | "fist" | "pointer" | "peace" | "thumbs_up" | "none";

export type MotionGestureId = "swipe_up" | "swipe_down" | "double_pinch";

export type ActionId = "play" | "pause" | "volume_up" | "volume_down" | "mute" | "prev_item" | "next_item" | "like";

export interface GestureMeta {
  id: Exclude<GestureId, "none">;
  label: string;
  emoji: string;
  action: ActionId;
  actionLabel: string;
  /** continuous gestures keep firing while held, discrete ones fire once per hold */
  continuous: boolean;
  rule: string;
}

export interface MotionGestureMeta {
  id: MotionGestureId;
  label: string;
  emoji: string;
  action: ActionId;
  actionLabel: string;
  rule: string;
}

export const GESTURES: GestureMeta[] = [
  {
    id: "open_palm",
    label: "Open Palm",
    emoji: "🖐️",
    action: "play",
    actionLabel: "Play",
    continuous: false,
    rule: "Index, middle, ring and pinky all extended",
  },
  {
    id: "fist",
    label: "Closed Fist",
    emoji: "✊",
    action: "pause",
    actionLabel: "Pause",
    continuous: false,
    rule: "All four fingers curled, thumb tucked",
  },
  {
    id: "pointer",
    label: "Index Pointer",
    emoji: "☝️",
    action: "volume_up",
    actionLabel: "Volume up",
    continuous: true,
    rule: "Only the index finger extended",
  },
  {
    id: "peace",
    label: "Peace Sign",
    emoji: "✌️",
    action: "volume_down",
    actionLabel: "Volume down",
    continuous: true,
    rule: "Index + middle extended, ring + pinky curled",
  },
  {
    id: "thumbs_up",
    label: "Thumbs Up",
    emoji: "👍",
    action: "mute",
    actionLabel: "Mute / unmute",
    continuous: false,
    rule: "Four fingers curled, thumb extended and pointing up",
  },
];

export const MOTION_GESTURES: MotionGestureMeta[] = [
  {
    id: "swipe_up",
    label: "Swipe Up",
    emoji: "⬆️",
    action: "prev_item",
    actionLabel: "Previous reel / video",
    rule: "Open hand moves up quickly (about 20% of the frame height in under 0.4 s)",
  },
  {
    id: "swipe_down",
    label: "Swipe Down",
    emoji: "⬇️",
    action: "next_item",
    actionLabel: "Next reel / video",
    rule: "Open hand moves down quickly",
  },
  {
    id: "double_pinch",
    label: "Double Pinch",
    emoji: "🤏",
    action: "like",
    actionLabel: "Like (double tap)",
    rule: "Touch thumb and index fingertips together twice within 0.7 s",
  },
];

export const GESTURE_BY_ID: Record<string, GestureMeta> = Object.fromEntries(GESTURES.map((g) => [g.id, g]));
export const MOTION_BY_ID: Record<string, MotionGestureMeta> = Object.fromEntries(MOTION_GESTURES.map((g) => [g.id, g]));

// Landmark indices (see the 21-point hand model)
const WRIST = 0;
const THUMB_TIP = 4;
const FINGERS = {
  index: { mcp: 5, pip: 6, tip: 8 },
  middle: { mcp: 9, pip: 10, tip: 12 },
  ring: { mcp: 13, pip: 14, tip: 16 },
  pinky: { mcp: 17, pip: 18, tip: 20 },
} as const;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A finger counts as "extended" when its tip is farther from the wrist than its PIP joint. */
function isExtended(w: Landmark[], f: { mcp: number; pip: number; tip: number }) {
  return dist(w[f.tip], w[WRIST]) > dist(w[f.pip], w[WRIST]) * 1.08;
}

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export function fingerStates(world: Landmark[]): FingerState {
  const handSize = dist(world[WRIST], world[FINGERS.middle.mcp]) || 0.09;
  return {
    // thumb: tip must be far away from the middle-finger knuckle (it sticks out of the palm)
    thumb: dist(world[THUMB_TIP], world[FINGERS.middle.mcp]) > handSize * 0.95,
    index: isExtended(world, FINGERS.index),
    middle: isExtended(world, FINGERS.middle),
    ring: isExtended(world, FINGERS.ring),
    pinky: isExtended(world, FINGERS.pinky),
  };
}

/** How many of the four long fingers are extended (0–4). Used to decide whether a hand is "open" enough to swipe. */
export function extendedCount(f: FingerState) {
  return Number(f.index) + Number(f.middle) + Number(f.ring) + Number(f.pinky);
}

export function classifyGesture(image: Landmark[], world: Landmark[]): { gesture: GestureId; fingers: FingerState } {
  const f = fingerStates(world);
  const { thumb, index, middle, ring, pinky } = f;

  let gesture: GestureId = "none";

  if (index && middle && ring && pinky) {
    gesture = "open_palm";
  } else if (index && middle && !ring && !pinky) {
    gesture = "peace";
  } else if (index && !middle && !ring && !pinky) {
    gesture = "pointer";
  } else if (!index && !middle && !ring && !pinky) {
    // thumbs-up: thumb extended AND thumb tip clearly above the wrist in the image (y grows downward)
    const pointingUp = image[THUMB_TIP].y < image[WRIST].y - 0.08;
    gesture = thumb && pointingUp ? "thumbs_up" : !thumb ? "fist" : "none";
  }

  return { gesture, fingers: f };
}
