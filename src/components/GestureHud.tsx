import { GESTURE_BY_ID, type GestureId } from "../lib/gestures";
import { cn } from "../utils/cn";

interface Props {
  gesture: GestureId;
  /** 0..1 hold-to-confirm progress */
  hold: number;
  className?: string;
  size?: number;
}

const R = 46;
const C = 2 * Math.PI * R;

/**
 * The one moment of the interface: while a pose is held, a ring fills around it.
 * Poses that repeat (volume, next, previous) stay full and glow while they keep firing.
 */
export function GestureHud({ gesture, hold, className, size = 148 }: Props) {
  if (gesture === "none") return null;
  const meta = GESTURE_BY_ID[gesture];
  const done = hold >= 1;
  return (
    <div className={cn("hud-in flex flex-col items-center gap-3", className)} role="status" aria-live="polite">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <div
          className={cn(
            "absolute inset-3 rounded-full bg-black/55 backdrop-blur-xl transition-shadow duration-150",
            done ? "shadow-[0_0_60px_8px_rgba(190,242,100,0.28)]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
          )}
        />
        <svg viewBox="0 0 108 108" className="absolute inset-0 -rotate-90">
          <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
          <circle
            cx="54"
            cy="54"
            r={R}
            fill="none"
            stroke="#bef264"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - hold)}
            style={{ transition: "stroke-dashoffset 120ms linear" }}
          />
        </svg>
        <span className="relative text-5xl leading-none">{meta.emoji}</span>
      </div>
      <div className={cn("rounded-full px-4 py-1.5 text-sm font-semibold backdrop-blur-xl transition-colors", done ? "bg-lime-300 text-black" : "bg-black/55 text-white/85")}>
        {meta.actionLabel}
      </div>
    </div>
  );
}
