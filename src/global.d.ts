/// <reference types="vite/client" />

// Bridge exposed by electron/preload.cjs. It only exists inside the desktop app.
interface WaveBridge {
  isDesktop: true;
  platform: string;
  version: string;
  /** press the OS keys / click that belong to `action`; resolves with ok=false and a message on failure */
  send(action: string, opts?: { swipeKeys?: "arrows" | "media" }): Promise<{ ok: boolean; error?: string }>;
  /** small always-on-top window so the camera stays visible while another app has focus */
  setMini(on: boolean): Promise<void>;
}

interface Window {
  wave?: WaveBridge;
}
