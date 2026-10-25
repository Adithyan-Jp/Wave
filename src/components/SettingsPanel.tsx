import type { Dispatch, ReactNode, SetStateAction } from "react";
import { BookOpen, Code2, Sparkles } from "lucide-react";
import { Slider } from "./Slider";
import type { Settings } from "../lib/settings";
import { GESTURES, MOTION_GESTURES, type ActionId, type GestureId } from "../lib/gestures";
import { cn } from "../utils/cn";

export interface LogEntry {
  id: number;
  time: string;
  action: ActionId;
  label: string;
  source: "gesture" | "manual";
  target: "app" | "system";
  count: number;
}

interface Props {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  desktop: boolean;
  activeGesture: GestureId;
  log: LogEntry[];
  actionIcon: (a: ActionId) => ReactNode;
  onClearLog: () => void;
  onTest: (a: ActionId) => void;
  onTour: () => void;
  onGuide: () => void;
  onPython: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] pb-6 pt-1 first:pt-0 last:border-0">
      <h3 className="mb-4 text-[13px] font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

function Select({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center justify-between gap-4 text-[13px] text-white/90">
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-white/35">{hint}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[210px] rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white focus:border-lime-300/50 focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-[13px] text-white/90">
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-white/35">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-lime-300" : "bg-white/15")}
      >
        <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-black transition-all", checked ? "left-5" : "left-1 !bg-white")} />
      </button>
    </label>
  );
}

export function SettingsPanel({ settings, setSettings, desktop, activeGesture, log, actionIcon, onClearLog, onTest, onTour, onGuide, onPython }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const eng = settings.engine;

  return (
    <div className="space-y-6">
      <Section title="Gestures">
        <ul className="-mx-1.5 space-y-0.5">
          {GESTURES.map((g) => {
            const on = activeGesture === g.id;
            return (
              <li key={g.id}>
                <button
                  onClick={() => onTest(g.action)}
                  title="Click to test"
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", on ? "bg-lime-300/10" : "hover:bg-white/[0.04]")}
                >
                  <span className="w-7 text-center text-xl">{g.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-white/90">{g.label}</span>
                    <span className="block truncate text-[11px] text-white/35">{g.how}</span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", on ? "bg-lime-300 text-black" : "bg-white/[0.06] text-white/65")}>{g.actionLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-white/35">Click a row to test what it does without your hand.</p>
      </Section>

      <Section title="Next and previous">
        <div className="space-y-4">
          <Select
            label="Three fingers means"
            hint="Pick the pose that feels comfortable"
            value={settings.threeVariant}
            onChange={(v) => set("threeVariant", v as Settings["threeVariant"])}
            options={[
              ["ring", "Index, middle, ring"],
              ["thumb", "Thumb, index, middle"],
            ]}
          />
          <Toggle label="Swap next and previous" hint={settings.invertSkip ? "Four fingers goes back, three goes forward" : "Four fingers goes forward, three goes back"} checked={settings.invertSkip} onChange={(v) => set("invertSkip", v)} />
          {desktop && (
            <Select
              label="In other apps, press"
              hint="Reels, Shorts and TikTok use arrow keys. Music players use media keys."
              value={settings.skipKeys}
              onChange={(v) => set("skipKeys", v as Settings["skipKeys"])}
              options={[
                ["arrows", "Down / Up arrow"],
                ["media", "Media next / previous"],
              ]}
            />
          )}
        </div>
      </Section>

      <Section title="Timing">
        <div className="space-y-5">
          <Slider label="Hold to confirm" hint="How long to hold a pose" value={eng.holdMs} min={150} max={900} step={50} unit=" ms" onChange={(v) => set("engine", { ...eng, holdMs: v })} />
          <Slider label="Cooldown" hint="Pause between play, pause, mute, like" value={eng.cooldownMs} min={400} max={3000} step={100} unit=" ms" onChange={(v) => set("engine", { ...eng, cooldownMs: v })} />
          <Slider label="Volume speed" hint="Time between steps" value={eng.repeatMs} min={100} max={800} step={50} unit=" ms" onChange={(v) => set("engine", { ...eng, repeatMs: v })} />
          <Slider label="Skip speed" hint="Time between next or previous" value={eng.skipMs} min={600} max={2500} step={100} unit=" ms" onChange={(v) => set("engine", { ...eng, skipMs: v })} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/35">Four fingers, three fingers and pinch are held a little longer than the others to avoid accidental triggers while your hand opens or closes.</p>
      </Section>

      <Section title="Swipes (experimental)">
        <Toggle
          label="Swipe up and down"
          hint="Up goes to previous, down to next. These need a quick, clean flick and are less reliable than poses."
          checked={settings.swipeEnabled}
          onChange={(v) => set("swipeEnabled", v)}
        />
        {settings.swipeEnabled && (
          <div className="mt-5 space-y-5">
            <Slider label="Swipe distance" hint="Smaller is more sensitive" value={Math.round(settings.motion.swipeDistance * 100)} min={10} max={40} step={1} unit="%" onChange={(v) => set("motion", { ...settings.motion, swipeDistance: v / 100 })} />
            <Slider label="Swipe cooldown" value={settings.motion.swipeCooldownMs} min={400} max={2000} step={100} unit=" ms" onChange={(v) => set("motion", { ...settings.motion, swipeCooldownMs: v })} />
            <ul className="space-y-1 text-[12px] text-white/45">
              {MOTION_GESTURES.map((g) => (
                <li key={g.id}>
                  {g.emoji} {g.label}: {g.rule}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Recent activity">
        {log.length === 0 ? (
          <p className="text-[13px] text-white/40">Nothing yet. Start the camera and show a pose.</p>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.05]">
              {log.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05] text-white/70">{actionIcon(l.action)}</span>
                  <span className="flex-1 text-white/85">
                    {l.label}
                    {l.count > 1 && <span className="ml-1.5 text-xs text-white/35">×{l.count}</span>}
                  </span>
                  {l.target === "system" && <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-white/55">other app</span>}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", l.source === "gesture" ? "bg-lime-300/15 text-lime-300" : "bg-white/[0.06] text-white/45")}>{l.source === "gesture" ? "hand" : "click"}</span>
                  <span className="text-[11px] tabular-nums text-white/30">{l.time}</span>
                </li>
              ))}
            </ul>
            <button onClick={onClearLog} className="mt-2 text-xs text-white/40 transition hover:text-white/75">
              Clear activity
            </button>
          </>
        )}
      </Section>

      <Section title="About">
        <div className="grid gap-2">
          <button onClick={onTour} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-left text-[13px] text-white/85 transition hover:bg-white/[0.05]">
            <Sparkles className="h-4 w-4 text-lime-300" /> Replay the welcome guide
          </button>
          <button onClick={onGuide} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-left text-[13px] text-white/85 transition hover:bg-white/[0.05]">
            <BookOpen className="h-4 w-4 text-lime-300" /> How hand tracking works
          </button>
          <button onClick={onPython} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-left text-[13px] text-white/85 transition hover:bg-white/[0.05]">
            <Code2 className="h-4 w-4 text-lime-300" /> Python version
          </button>
        </div>
      </Section>
    </div>
  );
}
