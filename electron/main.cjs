const { app, BrowserWindow, ipcMain, session, shell, screen, systemPreferences } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const input = require("./input.cjs");

// Keep hand tracking running when the window is minimised, covered or in the background.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const DIST = path.join(__dirname, "..", "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

let server = null;
let origin = "";
let win = null;
let savedBounds = null;

/** Serve the built UI from http://127.0.0.1:<port>. A real http origin (not file://) is needed for the YouTube embed and for getUserMedia. */
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve(origin);
    });
  });
}

function isOurs(url) {
  return typeof url === "string" && origin && url.startsWith(origin);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 360,
    minHeight: 420,
    backgroundColor: "#0a0a0b",
    title: "Wave",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // links to other sites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isOurs(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(origin);

  // `WAVE_SMOKE=1 electron .` loads the UI, checks the bridge and the input module, prints a report and exits (used for CI / sanity checks)
  if (process.env.WAVE_SMOKE) {
    win.webContents.once("did-finish-load", async () => {
      try {
        const report = await win.webContents.executeJavaScript(
          `(async () => ({
            title: document.title,
            rootChildren: document.getElementById("root").children.length,
            bridge: !!window.wave,
            platform: window.wave && window.wave.platform,
            send: window.wave ? await window.wave.send("volume_up") : null,
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
          }))()`,
        );
        console.log("SMOKE " + JSON.stringify(report));
      } catch (e) {
        console.log("SMOKE_ERROR " + e);
      }
      app.quit();
    });
  }

  win.on("closed", () => {
    win = null;
  });
}

// one instance only (two copies would fight over the camera)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  await startServer();

  // The camera is the only permission the UI may ask for, and only from our own origin.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(permission === "media" && isOurs(details.requestingUrl));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    return permission === "media" && isOurs(requestingOrigin);
  });

  if (process.platform === "darwin") {
    // macOS shows its own camera prompt only if the app asks first
    systemPreferences.askForMediaAccess("camera").catch(() => {});
  }

  ipcMain.on("wave:version", (e) => {
    e.returnValue = app.getVersion();
  });

  ipcMain.handle("wave:send", async (e, action, opts) => {
    if (!isOurs(e.senderFrame && e.senderFrame.url)) return { ok: false, error: "Blocked: unknown sender" };
    if (process.platform === "darwin" && !systemPreferences.isTrustedAccessibilityClient(true)) {
      return {
        ok: false,
        error: "Allow Wave in System Settings > Privacy & Security > Accessibility, then try again.",
      };
    }
    return input.perform(action, opts || {});
  });

  ipcMain.handle("wave:set-mini", (e, on) => {
    if (!win || !isOurs(e.senderFrame && e.senderFrame.url)) return;
    if (on) {
      savedBounds = win.getBounds();
      const wa = screen.getDisplayMatching(savedBounds).workArea;
      win.setMinimumSize(320, 300);
      win.setBounds({ x: wa.x + wa.width - 400, y: wa.y + 16, width: 380, height: 520 });
      win.setAlwaysOnTop(true, "floating");
    } else {
      win.setAlwaysOnTop(false);
      win.setMinimumSize(360, 420);
      if (savedBounds) win.setBounds(savedBounds);
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});
