import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Hand, Heart, Maximize2, Minimize2, Monitor, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { MediaPlayer, type MediaItem, type PlayerHandle, type PlayerState, type PlayerToast } from "./components/MediaPlayer";
import { GestureCamera, type CameraStatus } from "./components/GestureCamera";
import { Library } from "./components/Library";
import { Guide } from "./components/Guide";
import { PythonBuild } from "./components/PythonBuild";
import { GESTURES, MOTION_GESTURES, type ActionId, type GestureId, type MotionGestureId } from "./lib/gestures";
import type { EngineConfig } from "./lib/engine";
import { DEFAULT_MOTION, type MotionConfig } from "./lib/motion";
import { parseYouTubeId } from "./lib/youtube";
import { cn } from "./utils/cn";

const VOLUME_STEP = 0.05;
const STORE_LIB = "wave.library.v1";
const STORE_LOG = "wave.log.v1";
const STORE_SET = "wave.settings.v2";

const SAMPLES: MediaItem[] = [
  {
    id: "sample-bbb",
    kind: "url",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    title: "Big Buck Bunny",
    subtitle: "Sample · MP4 · Blender Foundation",
  },
  {
    id: "sample-sintel",
    kind: "url",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    title: "Sintel",
    subtitle: "Sample · MP4 · Blender Foundation",
  },
  {
    id: "sample-tos",
    kind: "url",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    title: "Tears of Steel",
    subtitle: "Sample · MP4 · Blender Foundation",
  },
  {
    id: "sample-yt",
    kind: "youtube",
    src: "aqz-KE-bpKQ",
    title: "Big Buck Bunny (YouTube)",
    subtitle: "Sample · YouTube · Blender Foundation",
  },
];

interface LogEntry {
  id: number;
  time: string;
  action: ActionId;
  label: string;
  source: "gesture" | "manual";
  target: "app" | "system";
  count: number;
}

const ACTION_META: Record<ActionId, { label: string; icon: ReactNode }> = {
  play: { label: "Play", icon: <Play className="h-4 w-4 fill-current" /> },
  pause: { label: "Pause", icon: <Pause className="h-4 w-4 fill-current" /> },
  volume_up: { label: "Volume up", icon: <Volume2 className="h-4 w-4" /> },
  volume_down: { label: "Volume down", icon: <Volume1 className="h-4 w-4" /> },
  mute: { label: "Mute", icon: <VolumeX className="h-4 w-4" /> },
  prev_item: { label: "Previous", icon: <ChevronUp className="h-4 w-4" /> },
  next_item: { label: "Next", icon: <ChevronDown className="h-4 w-4" /> },
  like: { label: "Like", icon: <Heart className="h-4 w-4 fill-current" /> },
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface Settings {
  target: "app" | "system";
  invertSwipe: boolean;
  /** what swipe up / down presses in other apps: arrow keys (Reels, Shorts, TikTok) or media prev / next (music) */
  swipeKeys: "arrows" | "media";
  engine: EngineConfig;
  motion: MotionConfig;
}

const DEFAULT_SETTINGS: Settings = {
  target: "app",
  invertSwipe: false,
  swipeKeys: "arrows",
  engine: { holdMs: 350, cooldownMs: 1200, repeatMs: 250 },
  motion: DEFAULT_MOTION,
};

type Tab = "studio" | "guide" | "python";

export default function App() {
  const desktop = typeof window !== "undefined" ? window.wave : undefined;

  const [tab, setTab] = useState<Tab>("studio");
  const [mini, setMini] = useState(false);

  const [settings, setSettings] = useState<Settings>(() => {
    const s = load<Partial<Settings>>(STORE_SET, {});
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...s,
      engine: { ...DEFAULT_SETTINGS.engine, ...s.engine },
      motion: { ...DEFAULT_SETTINGS.motion, ...s.motion },
    };
    // system control only exists in the desktop app
    if (!(typeof window !== "undefined" && window.wave)) merged.target = "app";
    return merged;
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [items, setItems] = useState<MediaItem[]>(() => [...SAMPLES, ...load<MediaItem[]>(STORE_LIB, [])]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [activeId, setActiveId] = useState<string | null>(SAMPLES[0].id);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [autoPlay, setAutoPlay] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>({ playing: false, volume: 0.6, muted: false });
  const playerStateRef = useRef(playerState);
  const playerRef = useRef<PlayerHandle>(null);
  const liked = useRef<Set<string>>(new Set());
  // the OS only has a play/pause TOGGLE key, so we remember what we last did (null = unknown)
  const sysPlaying = useRef<boolean | null>(null);

  const [toast, setToast] = useState<PlayerToast | null>(null);
  const toastId = useRef(0);
  const [activeGesture, setActiveGesture] = useState<GestureId>("none");
  const [activeMotion, setActiveMotion] = useState<MotionGestureId | null>(null);
  const motionTimer = useRef<number>(0);
  const [camStatus, setCamStatus] = useState<CameraStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>(() => load<LogEntry[]>(STORE_LOG, []));

  const media = items.find((i) => i.id === activeId) ?? null;
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const onPlayerState = useCallback((s: PlayerState) => {
    playerStateRef.current = s;
    setPlayerState(s);
  }, []);

  // persist library (only link-based items), log and settings
  useEffect(() => {
    const persist = items.filter((i) => !i.id.startsWith("sample-") && i.kind !== "file");
    localStorage.setItem(STORE_LIB, JSON.stringify(persist));
  }, [items]);
  useEffect(() => {
    localStorage.setItem(STORE_LOG, JSON.stringify(log.slice(0, 30)));
  }, [log]);
  useEffect(() => {
    localStorage.setItem(STORE_SET, JSON.stringify(settings));
  }, [settings]);

  const showToast = useCallback((label: string, icon: ReactNode, detail?: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, label, detail, icon });
  }, []);

  // ---- library handlers
  const select = useCallback((id: string) => {
    setAutoPlay(true);
    setActiveId(id);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const list = itemsRef.current;
      if (!list.length) return null;
      const i = list.findIndex((x) => x.id === activeIdRef.current);
      const next = list[(i + dir + list.length) % list.length];
      select(next.id);
      return next;
    },
    [select],
  );

  const runAction = useCallback(
    (rawAction: ActionId, source: "gesture" | "manual") => {
      const s = settingsRef.current;
      // "invert swipe" swaps previous / next
      let action = rawAction;
      if (s.invertSwipe && action === "prev_item") action = "next_item";
      else if (s.invertSwipe && action === "next_item") action = "prev_item";

      const meta = ACTION_META[action];
      let label = meta.label;
      let detail: string | undefined;
      let icon = meta.icon;
      const target: "app" | "system" = s.target === "system" && window.wave ? "system" : "app";

      if (target === "system") {
        // ---- control whatever app has focus (YouTube Shorts, Instagram Reels, Spotify, VLC …) via OS keys / clicks
        let send = true;
        if (action === "play") {
          if (sysPlaying.current === true) send = false;
          else sysPlaying.current = true;
        } else if (action === "pause") {
          if (sysPlaying.current === false) send = false;
          else sysPlaying.current = false;
        } else if (action === "prev_item" || action === "next_item") {
          sysPlaying.current = true; // a new reel / track starts playing by itself
        }
        if (send) {
          window.wave!.send(action, { swipeKeys: s.swipeKeys }).then((r) => {
            if (!r.ok) showToast("Couldn't send input", <Hand className="h-4 w-4" />, r.error?.slice(0, 60));
          });
        } else {
          label = `${meta.label} (already)`;
        }
        if (action === "prev_item") label = "Previous reel / video";
        if (action === "next_item") label = "Next reel / video";
        if (action === "like") label = "Like (double click)";
        showToast(label, icon, detail);
      } else {
        // ---- control the built-in player
        const p = playerRef.current;
        const ps = playerStateRef.current;
        if (!p || !mediaRef.current) {
          if (action === "prev_item" || action === "next_item") {
            const n = step(action === "next_item" ? 1 : -1);
            label = n ? `${meta.label}: ${n.title}` : "Library is empty";
          } else {
            label = "Select a video first";
          }
        } else {
          switch (action) {
            case "play":
              p.play();
              break;
            case "pause":
              p.pause();
              break;
            case "volume_up":
              p.volumeBy(VOLUME_STEP);
              detail = `${Math.min(100, Math.round((ps.volume + VOLUME_STEP) * 100))}%`;
              break;
            case "volume_down":
              p.volumeBy(-VOLUME_STEP);
              detail = `${Math.max(0, Math.round((ps.volume - VOLUME_STEP) * 100))}%`;
              break;
            case "mute":
              p.toggleMute();
              label = ps.muted ? "Unmuted" : "Muted";
              icon = ps.muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />;
              break;
            case "prev_item":
            case "next_item": {
              const n = step(action === "next_item" ? 1 : -1);
              label = action === "next_item" ? "Next" : "Previous";
              detail = n?.title.slice(0, 28);
              break;
            }
            case "like": {
              const id = mediaRef.current.id;
              if (liked.current.has(id)) {
                liked.current.delete(id);
                label = "Unliked";
              } else {
                liked.current.add(id);
                label = "Liked";
              }
              detail = mediaRef.current.title.slice(0, 28);
              break;
            }
          }
        }
        showToast(label, icon, detail);
      }

      setLog((prev) => {
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const last = prev[0];
        const continuous = action === "volume_up" || action === "volume_down";
        if (last && continuous && last.action === action && Date.now() - last.id < 2500) {
          return [{ ...last, id: Date.now(), time, count: last.count + 1 }, ...prev.slice(1)];
        }
        return [{ id: Date.now(), time, action, label: meta.label, source, target, count: 1 }, ...prev].slice(0, 30);
      });
    },
    [showToast, step],
  );

  const onGestureAction = useCallback((action: ActionId) => runAction(action, "gesture"), [runAction]);

  const onMotion = useCallback((m: MotionGestureId) => {
    setActiveMotion(m);
    window.clearTimeout(motionTimer.current);
    motionTimer.current = window.setTimeout(() => setActiveMotion(null), 900);
  }, []);

  const addFiles = (files: File[]) => {
    const added: MediaItem[] = files.map((f, i) => ({
      id: `file-${Date.now()}-${i}`,
      kind: "file",
      src: URL.createObjectURL(f),
      title: f.name.replace(/\.[^.]+$/, ""),
      subtitle: `Local file · ${(f.size / 1024 / 1024).toFixed(1)} MB`,
    }));
    setItems((prev) => [...prev, ...added]);
    select(added[0].id);
  };

  const addLink = (raw: string): string | null => {
    const value = raw.trim();
    const yt = parseYouTubeId(value);
    let item: MediaItem;
    if (yt) {
      item = {
        id: `yt-${yt}-${Date.now()}`,
        kind: "youtube",
        src: yt,
        title: `YouTube · ${yt}`,
        subtitle: "YouTube video",
      };
    } else {
      try {
        const u = new URL(value);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
        const name = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? u.hostname);
        item = {
          id: `url-${Date.now()}`,
          kind: "url",
          src: value,
          title: name.replace(/\.[^.]+$/, "") || u.hostname,
          subtitle: u.hostname,
        };
      } catch {
        return "That doesn't look like a YouTube link or a direct video URL.";
      }
    }
    setItems((prev) => [...prev, item]);
    select(item.id);
    return null;
  };

  const remove = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (it?.kind === "file") URL.revokeObjectURL(it.src);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const setGestureCb = useCallback((g: GestureId) => setActiveGesture(g), []);

  const toggleMini = async () => {
    const next = !mini;
    setMini(next);
    await window.wave?.setMini(next);
  };

  const setTarget = (target: "app" | "system") => {
    sysPlaying.current = null;
    setSettings((s) => ({ ...s, target }));
  };

  const cfg = settings.engine;
  const sysMode = settings.target === "system";

  return (
    <div className="relative min-h-screen bg-[#0a0a0b] text-white">
      <div className={cn("bg-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]", mini && "hidden")} />
      <div className={cn("pointer-events-none absolute left-1/2 top-[-240px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-lime-300/[0.07] blur-[120px]", mini && "hidden")} />

      {/* header */}
      <header className={cn("sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0b]/75 backdrop-blur-xl", mini && "hidden")}>
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <button onClick={() => setTab("studio")} className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-300 text-black">
              <Hand className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Wave</span>
            <span className="hidden text-xs text-white/35 sm:inline">Touchless media player</span>
          </button>

          <nav className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
            {(
              [
                ["studio", "Studio"],
                ["guide", "How it works"],
                ["python", "Python build"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  window.scrollTo({ top: 0 });
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-medium transition",
                  tab === id ? "bg-white text-black" : "text-white/55 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs md:flex">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                camStatus === "running" ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : camStatus === "loading" ? "animate-pulse bg-amber-300" : "bg-white/25",
              )}
            />
            <span className="text-white/60">
              {camStatus === "running" ? "Gestures live" : camStatus === "loading" ? "Starting…" : "Gestures off"}
            </span>
          </div>
        </div>
      </header>

      {tab === "guide" && !mini && <Guide />}
      {tab === "python" && !mini && <PythonBuild />}

      {/* The studio stays mounted (just hidden) on other tabs so the camera keeps running. */}
      <main className={cn("relative mx-auto max-w-[1400px] px-6 pb-24", tab !== "studio" && !mini && "hidden", mini && "max-w-[380px] px-3 pb-3 pt-3")}>
        <div className={cn("py-10 md:py-14", mini && "hidden")}>
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-lime-300">Studio</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
            Control your media <span className="text-white/35">without touching anything.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/50">
            Real-time hand tracking turns hand poses and swipes into play, pause, volume, next / previous reel and double-tap like – in this app or in any
            other app on your computer.
          </p>
        </div>

        <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]", mini && "block")}>
          {/* left */}
          <div className={cn("space-y-6", mini && "hidden")}>
            <MediaPlayer ref={playerRef} media={media} toast={toast} autoPlay={autoPlay} onState={onPlayerState} />
            <Library
              items={items}
              activeId={activeId}
              playing={playerState.playing}
              onSelect={select}
              onRemove={remove}
              onAddFiles={addFiles}
              onAddLink={addLink}
            />
          </div>

          {/* right */}
          <div className="space-y-6">
            {/* control target */}
            <div className={cn("rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5", mini && "hidden")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Control target</h2>
                {desktop && (
                  <span className="rounded-full bg-lime-300/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-lime-300">Desktop app</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-black/20 p-1">
                <button
                  onClick={() => setTarget("app")}
                  className={cn("rounded-xl px-3 py-2 text-[13px] font-medium transition", !sysMode ? "bg-white text-black" : "text-white/55 hover:text-white")}
                >
                  This app's player
                </button>
                <button
                  onClick={() => desktop && setTarget("system")}
                  disabled={!desktop}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                    sysMode ? "bg-lime-300 text-black" : "text-white/55 hover:text-white",
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" /> Other apps
                </button>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-white/40">
                {!desktop
                  ? "Controlling other apps needs the desktop version – a browser tab is not allowed to press keys in other programs."
                  : sysMode
                    ? "Gestures now press real keys / clicks in whichever window has focus (Chrome with Shorts or Reels, Spotify, VLC…). Click that window once, then use gestures."
                    : "Gestures control the player inside this window."}
              </p>
              {desktop && (
                <button
                  onClick={toggleMini}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-[13px] font-medium text-white/85 transition hover:bg-white/[0.08]"
                >
                  <Minimize2 className="h-4 w-4" /> Mini mode (stays on top)
                </button>
              )}
            </div>

            <GestureCamera
              config={cfg}
              motion={settings.motion}
              onAction={onGestureAction}
              onGesture={setGestureCb}
              onMotion={onMotion}
              onStatus={setCamStatus}
              compact={mini}
            />

            {mini && (
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0 text-[13px]">
                  <span className="block truncate text-white/85">{toast ? toast.label : "Waiting for a gesture…"}</span>
                  <span className="block text-[11px] text-white/35">{sysMode ? "Controlling the focused app" : "Controlling Wave's player"}</span>
                </div>
                <button
                  onClick={toggleMini}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                  aria-label="Leave mini mode"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* gesture map */}
            <div className={cn("rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5", mini && "hidden")}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Gesture map</h2>
                <span className="text-[11px] text-white/35">click a row to test</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {GESTURES.map((g) => {
                  const on = activeGesture === g.id;
                  return (
                    <li key={g.id}>
                      <GestureRow
                        on={on}
                        emoji={g.emoji}
                        label={g.label}
                        hint={g.continuous ? "Hold to repeat" : "Hold ~0.4 s"}
                        badge={g.actionLabel}
                        onClick={() => runAction(g.action, "manual")}
                      />
                    </li>
                  );
                })}
                <li className="px-1 pb-0.5 pt-2 text-[10px] uppercase tracking-widest text-white/30">Motion gestures</li>
                {MOTION_GESTURES.map((g) => (
                  <li key={g.id}>
                    <GestureRow
                      on={activeMotion === g.id}
                      emoji={g.emoji}
                      label={g.label}
                      hint={g.id === "double_pinch" ? "Pinch twice quickly" : "Quick open-hand flick"}
                      badge={g.actionLabel}
                      onClick={() => runAction(g.action, "manual")}
                    />
                  </li>
                ))}
              </ul>
            </div>

            {/* tuning */}
            <div className={cn("rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5", mini && "hidden")}>
              <h2 className="mb-4 text-sm font-semibold tracking-tight">Tuning</h2>
              <div className="space-y-5">
                <Slider
                  label="Hold to confirm"
                  hint="Debounce time"
                  value={cfg.holdMs}
                  min={150}
                  max={900}
                  step={50}
                  unit="ms"
                  onChange={(v) => setSettings((s) => ({ ...s, engine: { ...s.engine, holdMs: v } }))}
                />
                <Slider
                  label="Cooldown"
                  hint="Lock after Play / Pause / Mute"
                  value={cfg.cooldownMs}
                  min={400}
                  max={3000}
                  step={100}
                  unit="ms"
                  onChange={(v) => setSettings((s) => ({ ...s, engine: { ...s.engine, cooldownMs: v } }))}
                />
                <Slider
                  label="Volume repeat"
                  hint="Time between ±5% steps"
                  value={cfg.repeatMs}
                  min={100}
                  max={800}
                  step={50}
                  unit="ms"
                  onChange={(v) => setSettings((s) => ({ ...s, engine: { ...s.engine, repeatMs: v } }))}
                />
                <Slider
                  label="Swipe distance"
                  hint="Smaller = more sensitive"
                  value={Math.round(settings.motion.swipeDistance * 100)}
                  min={10}
                  max={40}
                  step={1}
                  unit="%"
                  onChange={(v) => setSettings((s) => ({ ...s, motion: { ...s.motion, swipeDistance: v / 100 } }))}
                />
                <Slider
                  label="Swipe cooldown"
                  hint="One flick = one command"
                  value={settings.motion.swipeCooldownMs}
                  min={400}
                  max={2000}
                  step={100}
                  unit="ms"
                  onChange={(v) => setSettings((s) => ({ ...s, motion: { ...s.motion, swipeCooldownMs: v } }))}
                />
                <label className="flex items-center justify-between gap-4 text-[13px] text-white/85">
                  <span>
                    Swipe presses
                    <span className="ml-2 text-[11px] text-white/30">other apps only</span>
                  </span>
                  <select
                    value={settings.swipeKeys}
                    onChange={(e) => setSettings((s) => ({ ...s, swipeKeys: e.target.value as Settings["swipeKeys"] }))}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white focus:border-lime-300/50 focus:outline-none"
                  >
                    <option value="arrows">↑ / ↓ arrows (Reels, Shorts)</option>
                    <option value="media">Media prev / next (music)</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 text-[13px] text-white/85">
                  <span>
                    Invert swipe direction
                    <span className="ml-2 text-[11px] text-white/30">{settings.invertSwipe ? "up = next, down = previous" : "up = previous, down = next"}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.invertSwipe}
                    onChange={(e) => setSettings((s) => ({ ...s, invertSwipe: e.target.checked }))}
                    className="h-4 w-4 accent-lime-300"
                  />
                </label>
              </div>
            </div>

            {/* log */}
            <div className={cn("rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5", mini && "hidden")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Activity</h2>
                {log.length > 0 && (
                  <button onClick={() => setLog([])} className="text-[11px] text-white/35 transition hover:text-white/70">
                    Clear
                  </button>
                )}
              </div>
              {log.length === 0 ? (
                <p className="py-4 text-center text-xs text-white/30">Commands will appear here.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {log.slice(0, 7).map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05] text-white/70">{ACTION_META[l.action].icon}</span>
                      <span className="flex-1 text-white/85">
                        {l.label}
                        {l.count > 1 && <span className="ml-1.5 font-mono text-xs text-white/35">×{l.count}</span>}
                      </span>
                      {l.target === "system" && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">system</span>}
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider", l.source === "gesture" ? "bg-lime-300/15 text-lime-300" : "bg-white/[0.06] text-white/40")}>
                        {l.source}
                      </span>
                      <span className="font-mono text-[11px] text-white/30">{l.time}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className={cn("relative border-t border-white/[0.06] py-8 text-center text-xs text-white/30", mini && "hidden")}>
        Wave · MediaPipe Hand Landmarker · All processing happens on your device
      </footer>
    </div>
  );
}

function GestureRow({
  on,
  emoji,
  label,
  hint,
  badge,
  onClick,
}: {
  on: boolean;
  emoji: string;
  label: string;
  hint: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        on ? "border-lime-300/50 bg-lime-300/[0.08]" : "border-transparent hover:border-white/10 hover:bg-white/[0.03]",
      )}
    >
      <span className="text-xl">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white/90">{label}</span>
        <span className="block truncate text-[11px] text-white/35">{hint}</span>
      </span>
      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", on ? "bg-lime-300 text-black" : "bg-white/[0.06] text-white/60")}>{badge}</span>
    </button>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <span className="text-[13px] text-white/85">{label}</span>
          <span className="ml-2 text-[11px] text-white/30">{hint}</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-lime-300">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="range-lime"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--p" as any]: `${p}%` }}
      />
    </div>
  );
}
