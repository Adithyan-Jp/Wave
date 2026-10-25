// Geometry-based gesture classifier.
// Input: the 21 MediaPipe hand landmarks (image space) and the 21 "world" landmarks (metric, 3D, origin at the hand centre).
// We use the WORLD landmarks for distances because they are isotropic (not stretched by the camera aspect ratio)
// and use plain distance comparisons so the result is invariant to hand rotation and scale.
//
// Everything the user does is a held POSE (reliable), recognised here every frame and confirmed by the hold timer in
// engine.ts. Swipes (lib/motion.ts) are an optional extra that is off by default.

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureId =
  | "open_palm"
  | "four"
  | "three"
  | "fist"
  | "pointer"
  | "peace"
  | "thumbs_up"
  | "pinch"
  | "none";

export type MotionGestureId = "swipe_up" | "swipe_down";

export type ActionId = "play" | "pause" | "volume_up" | "volume_down" | "mute" | "prev_item" | "next_item" | "like";

/** which pose is used for "3 fingers" */
export type ThreeVariant = "ring" | "thumb";

export interface GestureMeta {
  id: Exclude<GestureId, "none">;
  label: string;
  emoji: string;
  action: ActionId;
  actionLabel: string;
  /** continuous gestures keep firing while held, discrete ones fire once per hold */
  continuous: boolean;
  /** which repeat interval a continuous gesture uses */
  repeat?: "volume" | "skip";
  /** multiplies the hold-to-confirm time (slower poses need a longer, more deliberate hold) */
  holdScale?: number;
  rule: string;
  /** short instruction shown to the user */
  how: string;
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
    label: "Open palm",
    emoji: "🖐️",
    action: "play",
    actionLabel: "Play",
    continuous: false,
    rule: "All five fingers extended, thumb included",
    how: "Open your hand wide",
  },
  {
    id: "fist",
    label: "Fist",
    emoji: "✊",
    action: "pause",
    actionLabel: "Pause",
    continuous: false,
    rule: "All four fingers curled, thumb tucked",
    how: "Close your hand",
  },
  {
    id: "pointer",
    label: "One finger",
    emoji: "☝️",
    action: "volume_up",
    actionLabel: "Volume up",
    continuous: true,
    repeat: "volume",
    rule: "Only the index finger extended",
    how: "Hold to keep raising",
  },
  {
    id: "peace",
    label: "Two fingers",
    emoji: "✌️",
    action: "volume_down",
    actionLabel: "Volume down",
    continuous: true,
    repeat: "volume",
    rule: "Index + middle extended, ring + pinky curled",
    how: "Hold to keep lowering",
  },
  {
    id: "thumbs_up",
    label: "Thumbs up",
    emoji: "👍",
    action: "mute",
    actionLabel: "Mute",
    continuous: false,
    rule: "Four fingers curled, thumb extended and pointing up",
    how: "Thumb up, fingers closed",
  },
  {
    id: "four",
    label: "Four fingers",
    emoji: "4️⃣",
    action: "next_item",
    actionLabel: "Next",
    continuous: true,
    repeat: "skip",
    holdScale: 1.5,
    rule: "Index, middle, ring and pinky extended, thumb tucked",
    how: "Thumb folded in, hold to keep skipping",
  },
  {
    id: "three",
    label: "Three fingers",
    emoji: "3️⃣",
    action: "prev_item",
    actionLabel: "Previous",
    continuous: true,
    repeat: "skip",
    holdScale: 1.5,
    rule: "Index, middle and ring extended, pinky curled",
    how: "Little finger down, hold to keep going back",
  },
  {
    id: "pinch",
    label: "Pinch",
    emoji: "🤏",
    action: "like",
    actionLabel: "Like",
    continuous: false,
    holdScale: 1.4,
    rule: "Thumb tip and index tip touching, held about half a second",
    how: "Touch thumb to index and hold",
  },
];

export const MOTION_GESTURES: MotionGestureMeta[] = [
  {
    id: "swipe_up",
    label: "Swipe up",
    emoji: "⬆️",
    action: "prev_item",
    actionLabel: "Previous",
    rule: "Open hand moves up quickly (about 20% of the frame height in under 0.4 s)",
  },
  {
    id: "swipe_down",
    label: "Swipe down",
    emoji: "⬇️",
    action: "next_item",
    actionLabel: "Next",
    rule: "Open hand moves down quickly",
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

/** How many of the four long fingers are extended (0–4). */
export function extendedCount(f: FingerState) {
  return Number(f.index) + Number(f.middle) + Number(f.ring) + Number(f.pinky);
}

/** All extended digits including the thumb (0–5): the number shown live on the camera. */
export function fingerCount(f: FingerState) {
  return extendedCount(f) + Number(f.thumb);
}

export interface ClassifyOptions {
  /** thumb and index are touching (decided with hysteresis by MotionDetector); a pinch wins over every finger-count pose */
  pinched?: boolean;
  threeVariant?: ThreeVariant;
}

export function classifyGesture(
  image: Landmark[],
  world: Landmark[],
  opts: ClassifyOptions = {},
): { gesture: GestureId; fingers: FingerState; count: number } {
  const f = fingerStates(world);
  const { thumb, index, middle, ring, pinky } = f;
  const variant = opts.threeVariant ?? "ring";

  let gesture: GestureId = "none";

  if (opts.pinched) {
    gesture = "pinch";
  } else if (index && middle && ring && pinky) {
    // the thumb is what separates "play" (hand wide open) from "next" (four fingers, thumb folded in)
    gesture = thumb ? "open_palm" : "four";
  } else if (variant === "ring" && index && middle && ring && !pinky) {
    gesture = "three";
  } else if (variant === "thumb" && thumb && index && middle && !ring && !pinky) {
    gesture = "three";
  } else if (index && middle && !ring && !pinky) {
    gesture = "peace";
  } else if (index && !middle && !ring && !pinky) {
    gesture = "pointer";
  } else if (!index && !middle && !ring && !pinky) {
    // thumbs-up: thumb extended AND thumb tip clearly above the wrist in the image (y grows downward)
    const pointingUp = image[THUMB_TIP].y < image[WRIST].y - 0.08;
    gesture = thumb && pointingUp ? "thumbs_up" : !thumb ? "fist" : "none";
  }

  return { gesture, fingers: f, count: fingerCount(f) };
}
