import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Hand,
  Heart,
  HelpCircle,
  ListVideo,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  Settings2,
  SkipBack,
  SkipForward,
  Video,
  VideoOff,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MediaPlayer, type MediaItem, type PlayerHandle, type PlayerState, type PlayerToast } from "./components/MediaPlayer";
import { GestureCamera, EMPTY_TELEMETRY, type CameraStatus, type Telemetry } from "./components/GestureCamera";
import { GestureHud } from "./components/GestureHud";
import { Library } from "./components/Library";
import { Drawer } from "./components/Drawer";
import { Onboarding } from "./components/Onboarding";
import { SettingsPanel, type LogEntry } from "./components/SettingsPanel";
import { Guide } from "./components/Guide";
import { PythonBuild } from "./components/PythonBuild";
import { GESTURES, GESTURE_BY_ID, type ActionId, type GestureId } from "./lib/gestures";
import { STORE_SETTINGS, loadSettings, readJson, writeJson, type Settings } from "./lib/settings";
import { parseYouTubeId } from "./lib/youtube";
import { cn } from "./utils/cn";

const VOLUME_STEP = 0.05;
const STORE_LIB = "wave.library.v1";
const STORE_LOG = "wave.log.v1";
const STORE_TOUR = "wave.onboarded.v2";

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

const actionIcon = (a: ActionId) => ACTION_META[a].icon;

type View = "studio" | "guide" | "python";

export default function App() {
  const desktop = typeof window !== "undefined" ? window.wave : undefined;

  const [view, setView] = useState<View>("studio");
  const [mini, setMini] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [tour, setTour] = useState(() => !readJson<boolean>(STORE_TOUR, false));
  const [camHidden, setCamHidden] = useState(false);

  const [settings, setSettings] = useState<Settings>(() => loadSettings(!!desktop));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [items, setItems] = useState<MediaItem[]>(() => [...SAMPLES, ...readJson<MediaItem[]>(STORE_LIB, [])]);
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
  const [burst, setBurst] = useState(0);
  const [activeGesture, setActiveGesture] = useState<GestureId>("none");
  const [teleRaw, setTele] = useState<Telemetry>(EMPTY_TELEMETRY);
  let tele = teleRaw;
  const [camStatus, setCamStatus] = useState<CameraStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>(() => readJson<LogEntry[]>(STORE_LOG, []));

  const media = items.find((i) => i.id === activeId) ?? null;
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const onPlayerState = useCallback((s: PlayerState) => {
    playerStateRef.current = s;
    setPlayerState(s);
  }, []);

  // persist library (only link-based items), activity and settings
  useEffect(() => {
    writeJson(
      STORE_LIB,
      items.filter((i) => !i.id.startsWith("sample-") && i.kind !== "file"),
    );
  }, [items]);
  useEffect(() => writeJson(STORE_LOG, log.slice(0, 30)), [log]);
  useEffect(() => writeJson(STORE_SETTINGS, settings), [settings]);

  const showToast = useCallback((label: string, icon: ReactNode, detail?: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, label, detail, icon });
  }, []);

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
      // "swap next and previous"
      let action = rawAction;
      if (s.invertSkip && action === "prev_item") action = "next_item";
      else if (s.invertSkip && action === "next_item") action = "prev_item";

      const meta = ACTION_META[action];
      let label = meta.label;
      let detail: string | undefined;
      let icon = meta.icon;
      const target: "app" | "system" = s.target === "system" && window.wave ? "system" : "app";

      if (target === "system") {
        // control whatever app has focus (YouTube Shorts, Instagram Reels, Spotify, VLC …) via OS keys / clicks
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
          window.wave!.send(action, { swipeKeys: s.skipKeys }).then((r) => {
            if (!r.ok) showToast("Couldn't send the key", <Hand className="h-4 w-4" />, r.error?.slice(0, 70));
          });
        } else {
          label = `${meta.label} (already)`;
        }
        if (action === "like") setBurst((b) => b + 1);
        showToast(label, icon, detail);
      } else {
        const p = playerRef.current;
        const ps = playerStateRef.current;
        if (!p || !mediaRef.current) {
          if (action === "prev_item" || action === "next_item") {
            const n = step(action === "next_item" ? 1 : -1);
            label = n ? meta.label : "Library is empty";
            detail = n?.title.slice(0, 28);
          } else {
            label = "Pick something to play first";
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
              detail = n?.title.slice(0, 28);
              break;
            }
            case "like": {
              const id = mediaRef.current.id;
              if (liked.current.has(id)) {
                liked.current.delete(id);
                label = "Removed like";
              } else {
                liked.current.add(id);
                label = "Liked";
                setBurst((b) => b + 1);
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
  const onTest = useCallback((action: ActionId) => runAction(action, "manual"), [runAction]);

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
        return "Enter a YouTube link or a direct link to a video file.";
      }
    }
    setItems((prev) => [...prev, item]);
    select(item.id);
    setLibOpen(false);
    return null;
  };

  const remove = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (it?.kind === "file") URL.revokeObjectURL(it.src);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const toggleMini = async () => {
    const next = !mini;
    setMini(next);
    setLibOpen(false);
    setSetOpen(false);
    await window.wave?.setMini(next);
  };

  const setTarget = (target: "app" | "system") => {
    sysPlaying.current = null;
    if (target === "system") playerRef.current?.pause(); // the built-in player must not keep playing behind the scenes
    setSettings((s) => ({ ...s, target }));
  };

  const closeTour = useCallback(() => {
    writeJson(STORE_TOUR, true);
    setTour(false);
  }, []);

  // development-only preview of the gesture ring: http://localhost:5173/?hud=four&hold=0.6 (removed from production builds)
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("hud");
    if (g && GESTURE_BY_ID[g]) tele = { ...tele, gesture: g as GestureId, hold: Number(q.get("hold") ?? 0.6) };
  }

  const sysMode = settings.target === "system";
  const activeMeta = tele.gesture !== "none" ? GESTURE_BY_ID[tele.gesture] : null;
  const running = camStatus === "running";
  const upNext = items.length > 1 ? items[(items.findIndex((i) => i.id === activeId) + 1) % items.length] : null;

  return (
    <div className="relative h-screen overflow-hidden bg-[#08080a] text-white">
      {/* ambient light behind the stage */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-260px] h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-lime-300/[0.06] blur-[130px]" />

      {/* ───────── top bar ───────── */}
      {!mini && (
        <header className="relative z-20 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-white/[0.06] px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-lime-300 text-black">
              <Hand className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Wave</span>
            <span
              className={cn(
                "ml-1 hidden items-center gap-2 rounded-full border border-white/[0.08] px-2.5 py-1 text-xs text-white/60 md:flex",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", running ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : camStatus === "loading" ? "animate-pulse bg-amber-300" : "bg-white/25")} />
              {running ? "Watching for gestures" : camStatus === "loading" ? "Starting camera" : "Camera off"}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1" role="group" aria-label="What Wave controls">
            <button
              onClick={() => setTarget("app")}
              aria-pressed={!sysMode}
              className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition", !sysMode ? "bg-white text-black" : "text-white/55 hover:text-white")}
            >
              This player
            </button>
            <button
              onClick={() => desktop && setTarget("system")}
              disabled={!desktop}
              aria-pressed={sysMode}
              title={desktop ? "Press keys in the app you are using" : "Needs the desktop app: a web page cannot press keys in other programs"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                sysMode ? "bg-lime-300 text-black" : "text-white/55 hover:text-white",
              )}
            >
              <Monitor className="h-3.5 w-3.5" /> Other apps
            </button>
          </div>

          <div className="flex items-center justify-end gap-1">
            <IconBtn label={camHidden ? "Show camera" : "Hide camera"} onClick={() => setCamHidden((v) => !v)}>
              {camHidden ? <VideoOff className="h-[18px] w-[18px]" /> : <Video className="h-[18px] w-[18px]" />}
            </IconBtn>
            <IconBtn label="Library" onClick={() => setLibOpen(true)}>
              <ListVideo className="h-[18px] w-[18px]" />
            </IconBtn>
            <IconBtn label="Settings" onClick={() => setSetOpen(true)}>
              <Settings2 className="h-[18px] w-[18px]" />
            </IconBtn>
            <IconBtn label="Welcome guide" onClick={() => setTour(true)}>
              <HelpCircle className="h-[18px] w-[18px]" />
            </IconBtn>
            {desktop && (
              <button
                onClick={toggleMini}
                className="ml-2 flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[13px] font-medium text-white/90 transition hover:bg-white/[0.12]"
              >
                <Minimize2 className="h-3.5 w-3.5" /> Mini mode
              </button>
            )}
          </div>
        </header>
      )}

      {/* ───────── stage ───────── */}
      <main className={cn("relative z-10 flex h-[calc(100vh-56px)] gap-5 px-5 pb-5 pt-4 [--reserve:190px] max-lg:pb-[236px] max-lg:[--reserve:430px]", mini && "hidden")}>
        <section className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-4">
          <div className="relative w-full" style={{ maxWidth: "min(100%, calc((100vh - var(--reserve)) * 1.7778))" }}>
            <MediaPlayer ref={playerRef} media={media} toast={toast} autoPlay={autoPlay} onState={onPlayerState} />

            {/* the ring that fills while a pose is held */}
            <GestureHud gesture={tele.gesture} hold={tele.hold} className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2" />

            {burst > 0 && (
              <div key={burst} className="heart-pop pointer-events-none absolute inset-0 z-20 grid place-items-center">
                <Heart className="h-28 w-28 fill-lime-300 text-lime-300 drop-shadow-[0_0_30px_rgba(190,242,100,0.5)]" />
              </div>
            )}

            {sysMode && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-3xl border border-white/[0.08] bg-[#0a0a0c]/95 p-8 text-center backdrop-blur-md">
                <div className="max-w-md">
                  <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-lime-300 text-black">
                    <Monitor className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Controlling your other apps</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/55">
                    Gestures now press real keys in the window you are using. Open Mini mode, then click your Reels, Shorts or music window once.
                  </p>
                  <button onClick={toggleMini} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-lime-200">
                    <Minimize2 className="h-4 w-4" /> Open Mini mode
                  </button>
                  <p className="mt-4 text-xs text-white/35">For a like, rest the mouse pointer over the video first.</p>
                </div>
              </div>
            )}
          </div>

          {/* now playing */}
          <div className="flex w-full items-center justify-between gap-4" style={{ maxWidth: "min(100%, calc((100vh - var(--reserve)) * 1.7778))" }}>
            <div className="min-w-0">
              <p className="text-xs text-white/40">{upNext ? "Up next" : "Library"}</p>
              <p className="truncate text-[15px] font-medium text-white/90">{upNext ? upNext.title : "Open the library to pick a video"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn label="Previous" onClick={() => onTest("prev_item")}>
                <SkipBack className="h-[18px] w-[18px]" />
              </IconBtn>
              <IconBtn label="Next" onClick={() => onTest("next_item")}>
                <SkipForward className="h-[18px] w-[18px]" />
              </IconBtn>
              <button onClick={() => setLibOpen(true)} className="ml-1 flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 text-[13px] text-white/80 transition hover:bg-white/[0.07]">
                <ListVideo className="h-4 w-4" /> Library
              </button>
            </div>
          </div>
        </section>

        {/* right column: sits under the floating camera */}
        <aside className="hidden w-[320px] shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
          {!camHidden && <div className="h-[312px] shrink-0" aria-hidden />}
          <div className="glass rounded-2xl p-2">
            <div className="flex items-baseline justify-between px-2.5 pb-1.5 pt-2">
              <h2 className="text-[13px] font-semibold text-white">Gestures</h2>
              <button onClick={() => setSetOpen(true)} className="text-[11px] text-white/40 transition hover:text-white/80">
                Adjust
              </button>
            </div>
            <ul>
              {GESTURES.map((g) => {
                const on = tele.gesture === g.id || activeGesture === g.id;
                return (
                  <li key={g.id}>
                    <button
                      onClick={() => onTest(g.action)}
                      title="Click to test"
                      className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-[7px] text-left transition", on ? "bg-lime-300/12 ring-1 ring-lime-300/40" : "hover:bg-white/[0.045]")}
                    >
                      <span className="w-6 text-center text-lg leading-none">{g.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{g.label}</span>
                      <span className={cn("text-xs font-medium", on ? "text-lime-300" : "text-white/45")}>{g.actionLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </main>

      {/* ───────── camera: one instance, moves between the corner dock and mini mode ───────── */}
      <div
        className={cn(
          "z-30 transition-[opacity,transform] duration-200",
          mini ? "fixed inset-x-3 top-3" : "fixed bottom-3 right-3 w-[220px] lg:bottom-auto lg:right-5 lg:top-[72px] lg:w-[320px]",
          !mini && camHidden && "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <GestureCamera
          config={settings.engine}
          motion={settings.motion}
          swipeEnabled={settings.swipeEnabled}
          threeVariant={settings.threeVariant}
          onAction={onGestureAction}
          onGesture={setActiveGesture}
          onTelemetry={setTele}
          onStatus={setCamStatus}
          compact
        />
      </div>

      {/* ───────── mini mode footer ───────── */}
      {mini && (
        <div className="glass fixed inset-x-3 bottom-3 z-30 rounded-2xl p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-2xl">{activeMeta ? activeMeta.emoji : "🖐️"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{activeMeta ? activeMeta.actionLabel : toast ? toast.label : "Waiting for a gesture"}</p>
              <p className="truncate text-xs text-white/40">
                {toast?.detail ?? (sysMode ? "Controlling the app you clicked last" : "Controlling Wave's own player")}
              </p>
            </div>
            <button onClick={toggleMini} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-white/70 transition hover:bg-white/10" aria-label="Leave mini mode" title="Leave mini mode">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-lime-300 transition-[width] duration-100" style={{ width: `${Math.round(tele.hold * 100)}%` }} />
          </div>
        </div>
      )}

      {/* ───────── drawers ───────── */}
      <Drawer open={libOpen} onClose={() => setLibOpen(false)} title="Library">
        <Library
          items={items}
          activeId={activeId}
          playing={playerState.playing}
          onSelect={(id) => {
            select(id);
            setLibOpen(false);
          }}
          onRemove={remove}
          onAddFiles={(f) => {
            addFiles(f);
            setLibOpen(false);
          }}
          onAddLink={addLink}
        />
      </Drawer>

      <Drawer open={setOpen} onClose={() => setSetOpen(false)} title="Settings">
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          desktop={!!desktop}
          activeGesture={tele.gesture}
          log={log}
          actionIcon={actionIcon}
          onClearLog={() => setLog([])}
          onTest={onTest}
          onTour={() => {
            setSetOpen(false);
            setTour(true);
          }}
          onGuide={() => {
            setSetOpen(false);
            setView("guide");
          }}
          onPython={() => {
            setSetOpen(false);
            setView("python");
          }}
        />
      </Drawer>

      <Onboarding open={tour} desktop={!!desktop} onClose={closeTour} />

      {/* reference pages sit on top of the studio, which stays mounted so the camera keeps running */}
      {view !== "studio" && (
        <div className="fixed inset-0 z-[55] overflow-y-auto bg-[#08080a]">
          <div className="sticky top-0 z-10 flex h-14 items-center border-b border-white/[0.06] bg-[#08080a]/85 px-5 backdrop-blur-xl">
            <button onClick={() => setView("studio")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to Wave
            </button>
          </div>
          {view === "guide" && <Guide />}
          {view === "python" && <PythonBuild />}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
