// Unit test for the swipe / double-pinch detector, using synthetic hand landmarks (no camera needed).
// Run: npm run test:motion
import { MotionDetector, DEFAULT_MOTION } from "../src/lib/motion.ts";

type P = { x: number; y: number; z: number };

function hand(cx: number, cy: number, pinch: boolean): { image: P[]; world: P[] } {
  const image: P[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const world: P[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[9] = { x: 0, y: -0.09, z: 0 }; // hand size 0.09 m
  world[4] = { x: -0.05, y: -0.1, z: 0 };
  world[8] = pinch ? { x: -0.05, y: -0.11, z: 0 } : { x: 0.05, y: -0.17, z: 0 };
  return { image, world };
}

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

/** feed a path of (t, x, y, pinch) frames at ~30 fps and collect events */
function run(path: { t: number; x: number; y: number; pinch?: boolean }[], allowSwipe = true) {
  const d = new MotionDetector();
  const events: string[] = [];
  for (const f of path) {
    const h = hand(f.x, f.y, !!f.pinch);
    const r = d.update(h.image, h.world, f.t, DEFAULT_MOTION, allowSwipe);
    if (r.event) events.push(r.event);
  }
  return events;
}

const frames = (ms: number, fn: (t: number) => { x: number; y: number; pinch?: boolean }, t0 = 0) => {
  const out = [];
  for (let t = 0; t <= ms; t += 33) out.push({ t: t0 + t, ...fn(t) });
  return out;
};

// 1 static hand
check("static hand -> nothing", run(frames(1000, () => ({ x: 0.5, y: 0.5 }))), []);

// 2 fast move up 0.3 in 250 ms, then keep going (must fire once only)
const up = [
  ...frames(200, () => ({ x: 0.5, y: 0.6 })),
  ...frames(250, (t) => ({ x: 0.5, y: 0.6 - 0.3 * (t / 250) }), 233),
  ...frames(300, () => ({ x: 0.5, y: 0.3 }), 500),
];
check("fast swipe up -> one swipe_up", run(up), ["swipe_up"]);

// 3 fast move down
const down = [
  ...frames(200, () => ({ x: 0.5, y: 0.3 })),
  ...frames(250, (t) => ({ x: 0.5, y: 0.3 + 0.3 * (t / 250) }), 233),
  ...frames(300, () => ({ x: 0.5, y: 0.6 }), 500),
];
check("fast swipe down -> one swipe_down", run(down), ["swipe_down"]);

// 4 slow drift 0.3 over 3 s
check("slow drift -> nothing", run(frames(3000, (t) => ({ x: 0.5, y: 0.7 - 0.3 * (t / 3000) }))), []);

// 5 horizontal flick
check("horizontal flick -> nothing", run(frames(250, (t) => ({ x: 0.3 + 0.3 * (t / 250), y: 0.5 }))), []);

// 6 swipe not allowed (closed hand)
check("swipe with closed hand -> nothing", run(up, false), []);

// 7 small jitter
check("jitter -> nothing", run(frames(1500, (t) => ({ x: 0.5, y: 0.5 + 0.02 * Math.sin(t / 40) }))), []);

// 8 up then back down within cooldown: only first counts
const updown = [
  ...frames(200, () => ({ x: 0.5, y: 0.6 })),
  ...frames(250, (t) => ({ x: 0.5, y: 0.6 - 0.3 * (t / 250) }), 233),
  ...frames(250, (t) => ({ x: 0.5, y: 0.3 + 0.3 * (t / 250) }), 500),
];
check("up then immediately down (inside cooldown) -> one swipe_up", run(updown), ["swipe_up"]);

// 9 double pinch
const dp = [
  ...frames(150, () => ({ x: 0.5, y: 0.5 })),
  ...frames(100, () => ({ x: 0.5, y: 0.5, pinch: true }), 165),
  ...frames(150, () => ({ x: 0.5, y: 0.5 }), 300),
  ...frames(100, () => ({ x: 0.5, y: 0.5, pinch: true }), 465),
  ...frames(200, () => ({ x: 0.5, y: 0.5 }), 600),
];
check("two quick pinches -> double_pinch", run(dp), ["double_pinch"]);

// 10 single pinch
const sp = [
  ...frames(150, () => ({ x: 0.5, y: 0.5 })),
  ...frames(100, () => ({ x: 0.5, y: 0.5, pinch: true }), 165),
  ...frames(1500, () => ({ x: 0.5, y: 0.5 }), 300),
];
check("single pinch -> nothing", run(sp), []);

// 11 two pinches too far apart (1.2 s)
const slow = [
  ...frames(100, () => ({ x: 0.5, y: 0.5, pinch: true })),
  ...frames(1100, () => ({ x: 0.5, y: 0.5 }), 133),
  ...frames(100, () => ({ x: 0.5, y: 0.5, pinch: true }), 1266),
  ...frames(300, () => ({ x: 0.5, y: 0.5 }), 1400),
];
check("pinches 1.2 s apart -> nothing", run(slow), []);

// 12 held pinch must not count as two
const held = [...frames(150, () => ({ x: 0.5, y: 0.5 })), ...frames(1500, () => ({ x: 0.5, y: 0.5, pinch: true }), 165)];
check("long held pinch -> nothing", run(held), []);

// 13 hand lost mid-swipe then re-enters: no swipe
{
  const d = new MotionDetector();
  const events: string[] = [];
  let t = 0;
  for (; t < 200; t += 33) {
    const h = hand(0.5, 0.7, false);
    events.push(d.update(h.image, h.world, t, DEFAULT_MOTION, true).event ?? "");
  }
  for (; t < 600; t += 33) events.push(d.update(null, null, t, DEFAULT_MOTION, true).event ?? "");
  for (let k = 0; k < 4; k++, t += 33) {
    const h = hand(0.5, 0.3, false);
    events.push(d.update(h.image, h.world, t, DEFAULT_MOTION, true).event ?? "");
  }
  check("hand lost then re-appears elsewhere -> nothing", events.filter(Boolean), []);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
