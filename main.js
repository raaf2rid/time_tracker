const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog
} = require("electron");
const { TimeTracker } = require("./src/tracker");

const IDLE_THRESHOLD_SECONDS = 120;
let mainWindow = null;
let tracker = null;
let tray = null;
let appIconImage = null;
const WINDOWS_ICONS_DIR = path.join(__dirname, "ui", "electron-icons", "windows");
const WINDOW_ICON_CANDIDATES = [
  path.join(WINDOWS_ICONS_DIR, "icon.ico"),
  path.join(WINDOWS_ICONS_DIR, "256x256.png"),
  path.join(WINDOWS_ICONS_DIR, "128x128.png")
];
const TRAY_ICON_CANDIDATES = [
  path.join(WINDOWS_ICONS_DIR, "32x32.png"),
  path.join(WINDOWS_ICONS_DIR, "16x16.png"),
  path.join(WINDOWS_ICONS_DIR, "48x48.png")
];
const DEV_WINDOW_ICON_PATH = WINDOW_ICON_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
const TRAY_ICON_PATH = TRAY_ICON_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow() {
  const windowIcon = app.isPackaged ? undefined : (DEV_WINDOW_ICON_PATH || undefined);
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    title: "Activity Log",
    icon: windowIcon,
    autoHideMenuBar: true,
    backgroundColor: "#05101b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (!app.isPackaged && DEV_WINDOW_ICON_PATH) {
    mainWindow.setIcon(DEV_WINDOW_ICON_PATH);
  }

  const uiDistIndex = path.join(__dirname, "ui", "dist", "index.html");
  const fallbackIndex = path.join(__dirname, "renderer", "index.html");
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(fs.existsSync(uiDistIndex) ? uiDistIndex : fallbackIndex);
  }

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.minimize();
    }
  });
}

function loadTrayIcon() {
  if (!TRAY_ICON_PATH) {
    return null;
  }

  const raw = nativeImage.createFromPath(TRAY_ICON_PATH);
  return raw.isEmpty() ? null : raw;
}

function createTray() {
  const icon = appIconImage
    || (DEV_WINDOW_ICON_PATH ? nativeImage.createFromPath(DEV_WINDOW_ICON_PATH) : null);
  const trayIcon = !icon || icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon.resize({ width: 20, height: 20, quality: "best" });
  tray = new Tray(trayIcon);
  tray.setToolTip("Activity Log");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Dashboard",
      click: () => {
        showMainWindow();
      }
    },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
      showMainWindow();
      return;
    }
    mainWindow.minimize();
  });
}

function registerIpc() {
  ipcMain.handle("tracker:get-snapshot", () => tracker.getSnapshot());
  ipcMain.handle("tracker:get-daily-summary", (_event, days = 7) =>
    tracker.getDailySummary(days)
  );
  ipcMain.handle("tracker:get-dashboard", (_event, period = "weekly", search = "") =>
    tracker.getDashboard(period, search)
  );
  ipcMain.handle("tracker:get-home-view", (_event, day = null) =>
    tracker.getHomeView(day)
  );
  ipcMain.handle("tracker:get-details-view", (_event, payload = {}) =>
    tracker.getDetailsView(payload)
  );
  ipcMain.handle("tracker:export", async (_event, { period = "weekly", format = "csv" } = {}) => {
    const safeFormat = format === "json" ? "json" : "csv";
    const ext = safeFormat === "json" ? "json" : "csv";

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: `Export ${safeFormat.toUpperCase()} Data`,
      defaultPath: `work-tracker-${period}-${new Date().toISOString().slice(0, 10)}.${ext}`,
      filters: [
        safeFormat === "json"
          ? { name: "JSON", extensions: ["json"] }
          : { name: "CSV", extensions: ["csv"] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    return tracker.exportData({
      format: safeFormat,
      filePath: saveResult.filePath,
      period
    });
  });
  ipcMain.handle("tracker:get-settings", () => ({
    idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
    autostartConfigured: true
  }));
}

app.whenReady().then(() => {
  appIconImage = loadTrayIcon();
  const loginItemSettings = app.isPackaged
    ? { openAtLogin: true, openAsHidden: true }
    : {
        openAtLogin: true,
        openAsHidden: true,
        path: process.execPath,
        args: [app.getAppPath(), "--hidden"]
      };
  app.setLoginItemSettings(loginItemSettings);

  tracker = new TimeTracker({
    dbPath: path.join(app.getPath("userData"), "tracker.db"),
    idleThresholdSeconds: IDLE_THRESHOLD_SECONDS
  });
  tracker.start();

  createMainWindow();
  createTray();
  registerIpc();

  if (process.argv.includes("--hidden")) {
    mainWindow.minimize();
  }
}).catch((error) => {
  console.error("App startup failed:", error);
  app.quit();
});

app.on("second-instance", (_event, argv) => {
  // A new launch was attempted while already running; surface existing window.
  showMainWindow();
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (tracker) {
    tracker.stop();
  }
});

app.on("window-all-closed", () => {
  // Keep background tracking alive; quit only from tray.
});

app.on("activate", () => {
  showMainWindow();
});
