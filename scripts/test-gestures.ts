// Unit tests for pose classification, hold timing and the optional swipe detector, using synthetic hand landmarks
// (no camera needed).   Run: npm test
import { classifyGesture } from "../src/lib/gestures.ts";
import { ActionEngine, type EngineConfig } from "../src/lib/engine.ts";
import { MotionDetector, DEFAULT_MOTION } from "../src/lib/motion.ts";

type P = { x: number; y: number; z: number };
const p = (x: number, y: number): P => ({ x, y, z: 0 });

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

// ---------------------------------------------------------------- hand builder
interface Pose {
  thumb?: boolean;
  index?: boolean;
  middle?: boolean;
  ring?: boolean;
  pinky?: boolean;
  /** thumb tip raised well above the wrist in the image (thumbs up) */
  thumbUp?: boolean;
}
const XS = { index: 0.03, middle: 0, ring: -0.025, pinky: -0.045 };
const IDS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] } as const;

function hand(pose: Pose) {
  const world: P[] = Array.from({ length: 21 }, () => p(0, 0));
  const image: P[] = Array.from({ length: 21 }, () => p(0.5, 0.7));
  for (const k of ["index", "middle", "ring", "pinky"] as const) {
    const [mcp, pip, tip] = IDS[k];
    world[mcp] = p(XS[k], -0.09);
    world[pip] = p(XS[k], -0.125);
    world[tip] = pose[k] ? p(XS[k], -0.17) : p(XS[k], -0.08); // extended vs folded back toward the palm
  }
  world[4] = pose.thumb ? p(-0.1, -0.1) : p(-0.02, -0.07);
  image[0] = p(0.5, 0.8);
  image[4] = p(0.4, pose.thumbUp ? 0.5 : 0.75);
  return { world, image };
}
const cls = (pose: Pose, opts: Parameters<typeof classifyGesture>[2] = {}) => {
  const h = hand(pose);
  return classifyGesture(h.image, h.world, opts).gesture;
};

// ---------------------------------------------------------------- poses
check("5 fingers -> open_palm", cls({ thumb: true, index: true, middle: true, ring: true, pinky: true }), "open_palm");
check("4 fingers, thumb tucked -> four", cls({ index: true, middle: true, ring: true, pinky: true }), "four");
check("3 fingers (index, middle, ring) -> three", cls({ index: true, middle: true, ring: true }), "three");
check("3 fingers with thumb loosely out -> still three", cls({ thumb: true, index: true, middle: true, ring: true }), "three");
check("2 fingers -> peace", cls({ index: true, middle: true }), "peace");
check("1 finger -> pointer", cls({ index: true }), "pointer");
check("no fingers -> fist", cls({}), "fist");
check("thumb up -> thumbs_up", cls({ thumb: true, thumbUp: true }), "thumbs_up");
check("pinched flag wins over any finger pose", cls({ thumb: true, index: true, middle: true, ring: true }, { pinched: true }), "pinch");
check("pinched flag wins over fist", cls({}, { pinched: true }), "pinch");
// alternative three-finger variant: thumb + index + middle
const T = { threeVariant: "thumb" } as const;
check("variant thumb: thumb+index+middle -> three", cls({ thumb: true, index: true, middle: true }, T), "three");
check("variant thumb: index+middle (thumb tucked) -> peace", cls({ index: true, middle: true }, T), "peace");
check("variant thumb: index+middle+ring is no longer three", cls({ index: true, middle: true, ring: true }, T), "none");

// ---------------------------------------------------------------- engine timing
const cfg: EngineConfig = { holdMs: 350, cooldownMs: 1200, repeatMs: 250, skipMs: 1000 };
function drive(frames: { g: Parameters<ActionEngine["update"]>[0]; ms: number }[]) {
  const e = new ActionEngine();
  const out: { t: number; a: string }[] = [];
  let t = 0;
  for (const seg of frames) {
    for (const end = t + seg.ms; t < end; t += 33) {
      const r = e.update(seg.g, t, cfg);
      if (r.action) out.push({ t, a: r.action });
    }
  }
  return out;
}
const acts = (o: { a: string }[]) => o.map((x) => x.a);

check("fist held 1 s -> pause once", acts(drive([{ g: "fist", ms: 1000 }])), ["pause"]);
check("fist held only 200 ms -> nothing", acts(drive([{ g: "fist", ms: 200 }, { g: "none", ms: 500 }])), []);

const four = drive([{ g: "four", ms: 2700 }]);
// first skip after the 525 ms hold (frame ~528), then one per second (~1550, ~2570)
check("four fingers held 2.7 s -> next, next, next", acts(four), ["next_item", "next_item", "next_item"]);
check("four fingers: first skip not before ~525 ms", four[0].t >= 525, true);
check("four fingers: repeats about every 1 s", Math.round((four[1].t - four[0].t) / 100) * 100 >= 1000 && four[1].t - four[0].t <= 1066, true);

check("three fingers held 700 ms -> previous once", acts(drive([{ g: "three", ms: 700 }])), ["prev_item"]);
check(
  "pass-through: three for 450 ms then five fingers -> no skip (needs a longer hold)",
  acts(drive([{ g: "three", ms: 450 }, { g: "four", ms: 400 }, { g: "open_palm", ms: 1 }])),
  [],
);
const pinch = drive([{ g: "pinch", ms: 1500 }]);
check("pinch held 1.5 s -> like exactly once", acts(pinch), ["like"]);
check("pinch: needs about half a second (not before 490 ms)", pinch[0].t >= 490, true);
check("quick pinch of 300 ms -> nothing", acts(drive([{ g: "pinch", ms: 300 }, { g: "none", ms: 600 }])), []);
// hold 350 ms, then every 250 ms: ~363, ~627, ~891 within one second
check("one finger held 1 s -> volume up 3 times", acts(drive([{ g: "pointer", ms: 1000 }])).length, 3);
check(
  "volume pose then next pose: next fires right after its own hold",
  acts(drive([{ g: "pointer", ms: 600 }, { g: "four", ms: 700 }])).filter((a) => a === "next_item").length,
  1,
);

// ---------------------------------------------------------------- optional swipe + pinch detector
function mhand(cx: number, cy: number, pinch: boolean) {
  const image: P[] = Array.from({ length: 21 }, () => p(cx, cy));
  const world: P[] = Array.from({ length: 21 }, () => p(0, 0));
  world[9] = p(0, -0.09);
  world[4] = p(-0.05, -0.1);
  world[8] = pinch ? p(-0.05, -0.11) : p(0.05, -0.17);
  return { image, world };
}
function run(path: { t: number; x: number; y: number; pinch?: boolean }[], allowSwipe = true) {
  const d = new MotionDetector();
  const events: string[] = [];
  let everPinched = false;
  for (const f of path) {
    const h = mhand(f.x, f.y, !!f.pinch);
    const r = d.update(h.image, h.world, f.t, DEFAULT_MOTION, allowSwipe);
    if (r.event) events.push(r.event);
    if (r.pinched) everPinched = true;
  }
  return { events, everPinched };
}
const frames = (ms: number, fn: (t: number) => { x: number; y: number; pinch?: boolean }, t0 = 0) => {
  const out = [];
  for (let t = 0; t <= ms; t += 33) out.push({ t: t0 + t, ...fn(t) });
  return out;
};

check("static hand -> no swipe", run(frames(1000, () => ({ x: 0.5, y: 0.5 }))).events, []);
const up = [
  ...frames(200, () => ({ x: 0.5, y: 0.6 })),
  ...frames(250, (t) => ({ x: 0.5, y: 0.6 - 0.3 * (t / 250) }), 233),
  ...frames(300, () => ({ x: 0.5, y: 0.3 }), 500),
];
check("fast swipe up -> one swipe_up", run(up).events, ["swipe_up"]);
check("swipes disabled -> nothing", run(up, false).events, []);
check("slow drift -> nothing", run(frames(3000, (t) => ({ x: 0.5, y: 0.7 - 0.3 * (t / 3000) }))).events, []);
check("horizontal flick -> nothing", run(frames(250, (t) => ({ x: 0.3 + 0.3 * (t / 250), y: 0.5 }))).events, []);

check("thumb touching index tip -> pinched", run(frames(300, () => ({ x: 0.5, y: 0.5, pinch: true }))).everPinched, true);
check("open hand -> not pinched", run(frames(300, () => ({ x: 0.5, y: 0.5 }))).everPinched, false);

// a fist pulls the index tip back to the palm while the thumb rests next to it: must NOT count as a pinch
{
  const d = new MotionDetector();
  let pinched = false;
  for (let t = 0; t < 600; t += 33) {
    const h = mhand(0.5, 0.5, false);
    h.world[8] = p(-0.02, -0.08); // curled index tip, near the thumb tip (-0.05, -0.1) and close to the wrist
    h.world[4] = p(-0.03, -0.075);
    pinched = d.update(h.image, h.world, t, DEFAULT_MOTION, false).pinched || pinched;
  }
  check("fist (thumb beside curled index) -> not pinched", pinched, false);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
