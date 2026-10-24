import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Camera, CameraOff, Loader2, ScanLine } from "lucide-react";
import { ActionEngine, type EngineConfig } from "../lib/engine";
import {
  GESTURE_BY_ID,
  MOTION_BY_ID,
  classifyGesture,
  extendedCount,
  fingerStates,
  type ActionId,
  type GestureId,
  type MotionGestureId,
} from "../lib/gestures";
import { MotionDetector, type MotionConfig } from "../lib/motion";
import { cn } from "../utils/cn";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarkerPromise: Promise<HandLandmarker> | null = null;
let delegateUsed: "GPU" | "CPU" = "GPU";

function getLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });
      try {
        delegateUsed = "GPU";
        return await make("GPU");
      } catch {
        delegateUsed = "CPU";
        return await make("CPU");
      }
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

export type CameraStatus = "idle" | "loading" | "running" | "error";

interface Props {
  config: EngineConfig;
  motion: MotionConfig;
  onAction: (action: ActionId, gesture: GestureId | MotionGestureId) => void;
  onGesture: (g: GestureId) => void;
  onMotion?: (m: MotionGestureId) => void;
  onStatus?: (s: CameraStatus) => void;
  /** compact layout for the always-on-top mini window */
  compact?: boolean;
}

interface Telemetry {
  fps: number;
  latency: number;
  hand: boolean;
  gesture: GestureId;
  hold: number;
  cooldown: number;
  pinched: boolean;
  motion: MotionGestureId | null;
}

const EMPTY: Telemetry = { fps: 0, latency: 0, hand: false, gesture: "none", hold: 0, cooldown: 0, pinched: false, motion: null };

export function GestureCamera({ config, motion, onAction, onGesture, onMotion, onStatus, compact }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const runningRef = useRef(false);
  const engineRef = useRef(new ActionEngine());
  const motionRef = useRef(new MotionDetector());
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const motionCfgRef = useRef(motion);
  motionCfgRef.current = motion;
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const gestureCbRef = useRef(onGesture);
  gestureCbRef.current = onGesture;
  const motionCbRef = useRef(onMotion);
  motionCbRef.current = onMotion;

  const live = useRef<Telemetry>({ ...EMPTY });
  const motionShownAt = useRef(0);
  const [status, setStatusState] = useState<CameraStatus>("idle");
  const [error, setError] = useState("");
  const [t, setT] = useState<Telemetry>(live.current);

  const statusCbRef = useRef(onStatus);
  statusCbRef.current = onStatus;
  const setStatus = useCallback((s: CameraStatus) => {
    setStatusState(s);
    statusCbRef.current?.(s);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    engineRef.current.reset();
    motionRef.current.reset();
    live.current = { ...EMPTY };
    setT(live.current);
    gestureCbRef.current("none");
    setStatus("idle");
  }, [setStatus]);

  const start = useCallback(async () => {
    setError("");
    setStatus("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API is not available in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const landmarker = await getLandmarker();
      // the user may have pressed "Stop" while the model was still loading
      if (streamRef.current !== stream) return;

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const drawing = new DrawingUtils(ctx);

      let lastVideoTime = -1;
      let frames = 0;
      let windowStart = performance.now();
      let lastGesture: GestureId = "none";

      const tick = () => {
        if (!runningRef.current) return;
        // setTimeout (not requestAnimationFrame) so detection keeps running when the window is minimised or in the background
        timerRef.current = window.setTimeout(tick, 12);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const t0 = performance.now();
        const res = landmarker.detectForVideo(video, t0);
        const t1 = performance.now();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let gesture: GestureId = "none";
        const hand = res.landmarks.length > 0 && res.worldLandmarks.length > 0;
        const lms = hand ? res.landmarks[0] : null;
        const world = hand ? res.worldLandmarks[0] : null;

        let allowSwipe = false;
        if (lms && world) {
          drawing.drawConnectors(lms, HandLandmarker.HAND_CONNECTIONS, {
            color: "rgba(255,255,255,0.55)",
            lineWidth: 2,
          });
          drawing.drawLandmarks(lms, { color: "#bef264", fillColor: "#0a0a0b", lineWidth: 1.5, radius: 3 });
          gesture = classifyGesture(lms, world).gesture;
          allowSwipe = extendedCount(fingerStates(world)) >= 3;
        }

        // ---- motion gestures (swipe up / down, double pinch)
        const m = motionRef.current.update(lms, world, t1, motionCfgRef.current, allowSwipe);
        if (m.event) {
          const meta = MOTION_BY_ID[m.event];
          actionRef.current(meta.action, m.event);
          motionCbRef.current?.(m.event);
          engineRef.current.suppress(t1);
          live.current.motion = m.event;
          motionShownAt.current = t1;
        } else if (live.current.motion && t1 - motionShownAt.current > 1100) {
          live.current.motion = null;
        }

        // a pinching or fast-moving hand must not also trigger a static pose
        const poseForEngine: GestureId = m.pinched || m.speed > 0.9 ? "none" : gesture;
        const r = engineRef.current.update(poseForEngine, t1, cfgRef.current);
        if (r.action && poseForEngine !== "none") actionRef.current(r.action, poseForEngine);

        frames++;
        const now = performance.now();
        if (now - windowStart >= 1000) {
          live.current.fps = Math.round((frames * 1000) / (now - windowStart));
          frames = 0;
          windowStart = now;
        }
        const lat = t1 - t0;
        live.current.latency = live.current.latency ? live.current.latency * 0.85 + lat * 0.15 : lat;
        live.current.hand = hand;
        live.current.gesture = poseForEngine;
        live.current.pinched = m.pinched;
        live.current.hold = r.holdProgress;
        live.current.cooldown = r.cooldownLeft;

        if (poseForEngine !== lastGesture) {
          lastGesture = poseForEngine;
          gestureCbRef.current(poseForEngine);
        }
      };

      runningRef.current = true;
      setStatus("running");
      timerRef.current = window.setTimeout(tick, 0);
    } catch (e: any) {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      window.clearTimeout(timerRef.current);
      const name = e?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access and try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : (e?.message ?? "Something went wrong while starting the camera."),
      );
      setStatus("error");
    }
  }, [setStatus]);

  // push live telemetry into React state ~6x per second
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setT({ ...live.current }), 160);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => () => stop(), [stop]);

  const meta = t.gesture !== "none" ? GESTURE_BY_ID[t.gesture] : null;
  const motionMeta = t.motion ? MOTION_BY_ID[t.motion] : null;
  const running = status === "running";
  const latencyOk = t.latency > 0 && t.latency < 50;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02]">
      <div className="relative aspect-[4/3] w-full bg-[#0b0b0d]">
        <video
          ref={videoRef}
          muted
          playsInline
          className={cn("absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity", running ? "opacity-60" : "opacity-0")}
        />
        <canvas
          ref={canvasRef}
          className={cn("absolute inset-0 h-full w-full -scale-x-100 object-cover", running ? "opacity-100" : "opacity-0")}
        />

        {/* corner brackets */}
        <div className="pointer-events-none absolute inset-4">
          {["left-0 top-0 border-l border-t rounded-tl-xl", "right-0 top-0 border-r border-t rounded-tr-xl", "left-0 bottom-0 border-l border-b rounded-bl-xl", "right-0 bottom-0 border-r border-b rounded-br-xl"].map((c) => (
            <span key={c} className={cn("absolute h-5 w-5 border-white/25", c, running && t.hand && "border-lime-300/80")} />
          ))}
        </div>

        {!running && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                {status === "loading" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-lime-300" />
                ) : (
                  <ScanLine className="h-6 w-6 text-lime-300" />
                )}
              </div>
              <p className="text-sm font-medium text-white/85">
                {status === "loading" ? "Loading hand model…" : "Gesture control is off"}
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-xs leading-relaxed text-white/40">
                {status === "loading"
                  ? "Downloading the MediaPipe model (~7 MB) and opening your camera."
                  : "Video never leaves your device. Everything runs locally."}
              </p>
              {status === "error" && <p className="mx-auto mt-3 max-w-[260px] text-xs text-amber-300">{error}</p>}
            </div>
          </div>
        )}

        {running && (
          <>
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs backdrop-blur-md">
              <span className={cn("h-1.5 w-1.5 rounded-full", t.hand ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : "bg-white/30")} />
              <span className="text-white/80">
                {t.pinched ? (
                  <>
                    <span className="mr-1.5">🤏</span>Pinch
                  </>
                ) : meta ? (
                  <>
                    <span className="mr-1.5">{meta.emoji}</span>
                    {meta.label}
                  </>
                ) : t.hand ? (
                  "Unrecognised pose"
                ) : (
                  "Show your hand"
                )}
              </span>
            </div>

            {motionMeta && (
              <div className="toast-pop absolute left-1/2 top-4 -translate-x-1/2">
                <div className="flex items-center gap-2 rounded-full bg-lime-300 px-3 py-1.5 text-xs font-semibold text-black">
                  <span>{motionMeta.emoji}</span>
                  {motionMeta.label}
                </div>
              </div>
            )}

            <div className="absolute inset-x-4 bottom-4 space-y-2">
              <Bar label="Hold to confirm" value={t.hold} tone="lime" />
              <Bar label="Cooldown" value={t.cooldown} tone="white" />
            </div>
          </>
        )}
      </div>

      {!compact && (
        <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-t border-white/[0.06]">
          <Stat label="FPS" value={running ? String(t.fps) : "–"} />
          <Stat label="Inference" value={running && t.latency ? `${t.latency.toFixed(0)} ms` : "–"} accent={running && latencyOk} />
          <Stat label="Hand" value={running ? (t.hand ? "Tracked" : "None") : "–"} />
          <Stat label="Backend" value={running ? delegateUsed : "–"} />
        </div>
      )}

      <div className="p-4">
        {running ? (
          <button
            onClick={stop}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-sm font-medium text-white/85 transition hover:bg-white/[0.08]"
          >
            <CameraOff className="h-4 w-4" /> Stop camera
          </button>
        ) : (
          <button
            onClick={start}
            disabled={status === "loading"}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3 text-sm font-semibold text-black transition hover:bg-lime-200 disabled:opacity-60"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {status === "loading" ? "Starting…" : "Enable gesture control"}
          </button>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "lime" | "white" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-[10px] uppercase tracking-widest text-white/50">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-[width] duration-150", tone === "lime" ? "bg-lime-300" : "bg-white/60")}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
      <p className={cn("mt-0.5 font-mono text-sm tabular-nums", accent ? "text-lime-300" : "text-white/80")}>{value}</p>
    </div>
  );
}
