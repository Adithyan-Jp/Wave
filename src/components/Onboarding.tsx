import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Hand, Monitor } from "lucide-react";
import { GESTURES } from "../lib/gestures";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  desktop: boolean;
  onClose: () => void;
}

const STEPS = ["Set up", "Gestures", "Other apps"] as const;

export function Onboarding({ open, desktop, onClose }: Props) {
  const [step, setStep] = useState(0);
  if (!open) return null;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welcome to Wave">
      <div className="glass rise w-full max-w-[560px] overflow-hidden rounded-3xl bg-[#0b0b0d]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-6 py-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold", i <= step ? "bg-lime-300 text-black" : "bg-white/10 text-white/40")}>
                {i < step ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("text-[13px]", i === step ? "text-white" : "text-white/40")}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-white/15" />}
            </div>
          ))}
        </div>

        <div className="min-h-[300px] px-6 py-6">
          {step === 0 && (
            <div>
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-lime-300 text-black">
                <Hand className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Control videos with your hand</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/55">
                Wave watches your hand through the camera and turns poses into play, pause, volume, next, previous and like. Everything is processed on this computer.
              </p>
              <ul className="mt-5 space-y-2.5 text-[14px] text-white/70">
                <li className="flex gap-3"><span className="text-lime-300">•</span>Sit 40 to 80 cm from the camera, with light on your face and hand.</li>
                <li className="flex gap-3"><span className="text-lime-300">•</span>Keep your hand inside the camera picture and facing it.</li>
                <li className="flex gap-3"><span className="text-lime-300">•</span>Hold each pose for about a third of a second. The ring shows the progress.</li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Eight poses, all held still</h2>
              <p className="mt-2 text-[14px] text-white/50">Held poses are far more reliable than quick swipes.</p>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {GESTURES.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-white">{g.actionLabel}</span>
                      <span className="block truncate text-[11px] text-white/45">{g.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-lime-300">
                <Monitor className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Use it in Reels, Shorts and music apps</h2>
              {desktop ? (
                <ol className="mt-4 space-y-3 text-[14px] leading-relaxed text-white/70">
                  <li className="flex gap-3"><span className="font-semibold text-lime-300">1</span>Switch the top bar to <b className="text-white">Other apps</b>.</li>
                  <li className="flex gap-3"><span className="font-semibold text-lime-300">2</span>Press <b className="text-white">Mini mode</b>. Wave shrinks to a small window that stays on top.</li>
                  <li className="flex gap-3"><span className="font-semibold text-lime-300">3</span>Click your Reels, Shorts or music window once, then use your hand.</li>
                  <li className="flex gap-3"><span className="font-semibold text-lime-300">4</span>For a like, rest the mouse pointer over the video first.</li>
                </ol>
              ) : (
                <p className="mt-4 text-[14px] leading-relaxed text-white/60">
                  A web page can only control itself. Install the desktop app to send play, pause, volume, next, previous and like to other apps. In this window you can still try everything with the built-in player.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-4">
          <button onClick={onClose} className="text-[13px] text-white/45 transition hover:text-white/80">
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button
              onClick={() => {
                if (last) {
                  setStep(0);
                  onClose();
                } else setStep(step + 1);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-lime-300 px-5 py-2 text-sm font-semibold text-black transition hover:bg-lime-200"
            >
              {last ? "Start using Wave" : "Next"} {!last && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
