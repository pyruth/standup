import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray
} from 'electron';
import {
  IDLE_THRESHOLDS,
  IPC_CHANNELS,
  REMINDER_INTERVALS,
  type BlacklistedApp,
  type SettingsPatch,
  type StandUpSettings,
  type SupportedPlatform
} from '../shared/types.js';
import { isBlacklistedPath, normalizeAppPath } from './path-identity.js';
import { detectForegroundAppPath } from './foreground-app.js';
import { SettingsStore } from './settings-store.js';
import { TimerEngine } from './timer-engine.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererDirectory = path.resolve(currentDirectory, '../renderer');
const projectDirectory = path.resolve(currentDirectory, '../..');
const platform = process.platform as SupportedPlatform;
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest && process.env.STANDUP_SMOKE_USER_DATA) {
  app.setPath('userData', process.env.STANDUP_SMOKE_USER_DATA);
}
const singleInstanceLock = app.requestSingleInstanceLock();

let settingsStore: SettingsStore;
let timerEngine: TimerEngine;
let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null;
let popupVisible = false;
let locked = false;
let suspended = false;
let tickRunning = false;
let timerHandle: NodeJS.Timeout | null = null;
let trayRefreshHandle: NodeJS.Timeout | null = null;

if (!singleInstanceLock) {
  app.quit();
}

function getResourcePath(filename: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, filename)
    : path.join(projectDirectory, 'build', filename);
}

function getPreloadPath(): string {
  return path.join(currentDirectory, 'preload.cjs');
}

function getForegroundDetectorRoot(): string {
  return app.isPackaged
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'get-windows'
      )
    : path.join(projectDirectory, 'node_modules', 'get-windows');
}

function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Due now';
  }

  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) {
    return `${minutes} min remaining`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${hours} hr remaining`
    : `${hours} hr ${remainder} min remaining`;
}

function applyLoginSetting(enabled: boolean): void {
  if (!app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...(process.platform === 'darwin' ? { type: 'mainAppService' } : {})
  });
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 640,
    minHeight: 620,
    title: 'StandUp Settings',
    backgroundColor: '#11131a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile(path.join(rendererDirectory, 'settings.html'));
  settingsWindow.once('ready-to-show', () => {
    if (smokeTest) {
      return;
    }
    if (process.platform === 'darwin') {
      void app.dock?.show();
    }
    settingsWindow?.show();
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }
  });
}

function showReminder(preview = false, display = true): void {
  if (popupVisible) {
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const windowWidth = 272;
  const windowHeight = 384;

  popupVisible = true;
  popupWindow = new BrowserWindow({
    x: workArea.x + workArea.width - windowWidth,
    y: workArea.y + workArea.height - windowHeight - 16,
    width: windowWidth,
    height: windowHeight,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  popupWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  popupWindow.setIgnoreMouseEvents(true);
  popupWindow.setFocusable(false);
  if (process.platform === 'darwin') {
    popupWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
  }

  popupWindow.loadFile(path.join(rendererDirectory, 'popup.html'));
  popupWindow.once('ready-to-show', () => {
    if (display) {
      popupWindow?.showInactive();
    }
  });

  const closeTimer = setTimeout(() => {
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.destroy();
    }
  }, 8_000);

  popupWindow.on('closed', () => {
    clearTimeout(closeTimer);
    popupWindow = null;
    popupVisible = false;
    rebuildTrayMenu();
  });

  if (!preview) {
    timerEngine.markReminderShown(Date.now());
  }
  rebuildTrayMenu();
}

async function getActiveAppPath(): Promise<string | undefined> {
  try {
    return await detectForegroundAppPath({
      platform,
      packageRoot: getForegroundDetectorRoot()
    });
  } catch (error) {
    console.warn('Unable to inspect the foreground application.', error);
    return undefined;
  }
}

async function timerTick(): Promise<void> {
  if (tickRunning) {
    return;
  }

  tickRunning = true;
  try {
    const settings = settingsStore.get();
    const activePath = await getActiveAppPath();
    const blocked = isBlacklistedPath(
      activePath,
      settings.blacklistedApps
        .filter((entry) => entry.platform === platform)
        .map((entry) => entry.normalizedPath),
      platform
    );

    const result = timerEngine.tick({
      now: Date.now(),
      idleSeconds: powerMonitor.getSystemIdleTime(),
      blocked,
      popupVisible
    });

    if (result.shouldShowReminder) {
      showReminder();
    }
  } finally {
    tickRunning = false;
  }
}

function rebuildTrayMenu(): void {
  if (!tray) {
    return;
  }

  const status = timerEngine.getStatus(Date.now(), popupVisible);
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: status.isPaused
        ? `Paused · ${formatDuration((status.pauseUntil ?? 0) - Date.now())}`
        : formatDuration(status.remainingMilliseconds),
      enabled: false
    },
    { type: 'separator' }
  ];

  if (status.isPaused) {
    template.push({
      label: 'Resume',
      click: () => {
        timerEngine.resume(Date.now());
        rebuildTrayMenu();
      }
    });
  } else {
    template.push(
      {
        label: 'Pause for 30 minutes',
        click: () => {
          timerEngine.pauseFor(30 * 60_000, Date.now());
          rebuildTrayMenu();
        }
      },
      {
        label: 'Pause for 1 hour',
        click: () => {
          timerEngine.pauseFor(60 * 60_000, Date.now());
          rebuildTrayMenu();
        }
      }
    );
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Preview Reminder',
      click: () => showReminder(true)
    },
    {
      label: 'Settings…',
      click: createSettingsWindow
    },
    {
      label: 'About StandUp',
      click: () => app.showAboutPanel()
    },
    { type: 'separator' },
    {
      label: 'Quit StandUp',
      click: () => app.quit()
    }
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip('StandUp');
}

function createTray(): void {
  const source = nativeImage.createFromPath(getResourcePath('icon.png'));
  const icon = source.resize({
    width: process.platform === 'darwin' ? 18 : 24,
    height: process.platform === 'darwin' ? 18 : 24,
    quality: 'best'
  });
  tray = new Tray(icon);
  tray.on('click', createSettingsWindow);
  rebuildTrayMenu();
}

function assertSettingsPatch(value: unknown): SettingsPatch {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Invalid settings update.');
  }

  const patch = value as SettingsPatch;
  if (
    patch.reminderIntervalMinutes !== undefined &&
    !REMINDER_INTERVALS.includes(patch.reminderIntervalMinutes)
  ) {
    throw new TypeError('Invalid reminder interval.');
  }
  if (
    patch.idleThresholdMinutes !== undefined &&
    !IDLE_THRESHOLDS.includes(patch.idleThresholdMinutes)
  ) {
    throw new TypeError('Invalid idle threshold.');
  }
  if (
    patch.launchAtLogin !== undefined &&
    typeof patch.launchAtLogin !== 'boolean'
  ) {
    throw new TypeError('Invalid login setting.');
  }
  return patch;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getSettings, () => settingsStore.get());
  ipcMain.handle(
    IPC_CHANNELS.updateSettings,
    (_event, rawPatch: unknown): StandUpSettings => {
      const patch = assertSettingsPatch(rawPatch);
      const before = settingsStore.get();
      const next = settingsStore.set({ ...before, ...patch });

      if (
        patch.reminderIntervalMinutes !== undefined &&
        patch.reminderIntervalMinutes !== before.reminderIntervalMinutes
      ) {
        timerEngine.setReminderInterval(patch.reminderIntervalMinutes);
      }
      if (
        patch.idleThresholdMinutes !== undefined &&
        patch.idleThresholdMinutes !== before.idleThresholdMinutes
      ) {
        timerEngine.setIdleThreshold(patch.idleThresholdMinutes);
      }
      if (patch.launchAtLogin !== undefined) {
        applyLoginSetting(patch.launchAtLogin);
      }

      rebuildTrayMenu();
      return next;
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseBlacklistedApp,
    async (): Promise<StandUpSettings> => {
      const dialogOptions: Electron.OpenDialogOptions = {
        title:
          process.platform === 'darwin'
            ? 'Choose an application'
            : 'Choose an executable',
        properties: ['openFile'],
        filters:
          process.platform === 'win32'
            ? [{ name: 'Applications', extensions: ['exe'] }]
            : [{ name: 'Applications', extensions: ['app'] }]
      };
      const result =
        settingsWindow && !settingsWindow.isDestroyed()
          ? await dialog.showOpenDialog(settingsWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || !result.filePaths[0]) {
        return settingsStore.get();
      }

      const selectedPath = result.filePaths[0];
      const normalizedPath = normalizeAppPath(selectedPath, platform);
      const current = settingsStore.get();
      if (
        current.blacklistedApps.some(
          (entry) =>
            entry.platform === platform &&
            entry.normalizedPath === normalizedPath
        )
      ) {
        return current;
      }

      const extension = path.extname(selectedPath);
      const entry: BlacklistedApp = {
        id: randomUUID(),
        name: path.basename(selectedPath, extension),
        path: selectedPath,
        normalizedPath,
        platform
      };
      return settingsStore.set({
        ...current,
        blacklistedApps: [...current.blacklistedApps, entry]
      });
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.removeBlacklistedApp,
    (_event, id: unknown): StandUpSettings => {
      if (typeof id !== 'string') {
        throw new TypeError('Invalid blacklist entry.');
      }
      const current = settingsStore.get();
      return settingsStore.set({
        ...current,
        blacklistedApps: current.blacklistedApps.filter(
          (entry) => entry.id !== id
        )
      });
    }
  );
  ipcMain.handle(IPC_CHANNELS.previewReminder, () => showReminder(true));
  ipcMain.handle(IPC_CHANNELS.getStatus, () =>
    timerEngine.getStatus(Date.now(), popupVisible)
  );
}

function registerPowerEvents(): void {
  powerMonitor.on('lock-screen', () => {
    locked = true;
    timerEngine.setSystemBlocked(true, Date.now());
  });
  powerMonitor.on('unlock-screen', () => {
    locked = false;
    timerEngine.setSystemBlocked(suspended, Date.now());
  });
  powerMonitor.on('suspend', () => {
    suspended = true;
    timerEngine.setSystemBlocked(true, Date.now());
  });
  powerMonitor.on('resume', () => {
    suspended = false;
    timerEngine.setSystemBlocked(locked, Date.now());
  });
}

async function runSmokeTest(): Promise<void> {
  try {
    createSettingsWindow();
    const window = settingsWindow;
    if (!window) {
      throw new Error('Settings window was not created.');
    }

    await new Promise<void>((resolve, reject) => {
      window.webContents.once('did-finish-load', () => resolve());
      window.webContents.once(
        'did-fail-load',
        (_event, code, description) =>
          reject(new Error(`Settings failed to load (${code}): ${description}`))
      );
    });

    const preloadReady = await window.webContents.executeJavaScript(
      "typeof window.standUp?.getSettings === 'function'"
    );
    if (!preloadReady) {
      throw new Error('The secure preload bridge was not exposed.');
    }

    await detectForegroundAppPath({
      platform,
      packageRoot: getForegroundDetectorRoot()
    });
    showReminder(true, false);
    const smokeResultPath = process.env.STANDUP_SMOKE_RESULT;
    if (smokeResultPath) {
      fs.writeFileSync(smokeResultPath, 'ok', 'utf8');
    }
    setTimeout(() => app.quit(), 1_000);
  } catch (error) {
    console.error('StandUp smoke test failed.', error);
    app.exit(2);
  }
}

app.on('second-instance', createSettingsWindow);

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  settingsStore = new SettingsStore(
    path.join(app.getPath('userData'), 'settings.json')
  );
  app.setAboutPanelOptions({
    applicationName: 'StandUp',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Copyright © 2026 ioiostudios',
    credits: 'A healthy desktop companion by ioiostudios.'
  });
  const settings = settingsStore.get();
  timerEngine = new TimerEngine(
    settings.reminderIntervalMinutes,
    settings.idleThresholdMinutes
  );

  if (!smokeTest) {
    applyLoginSetting(settings.launchAtLogin);
  }
  registerIpcHandlers();
  registerPowerEvents();
  createTray();

  timerHandle = setInterval(() => void timerTick(), 1_000);
  trayRefreshHandle = setInterval(rebuildTrayMenu, 15_000);
  void timerTick();

  if (smokeTest) {
    void runSmokeTest();
  }
});

app.on('activate', createSettingsWindow);
app.on('before-quit', () => {
  if (timerHandle) {
    clearInterval(timerHandle);
  }
  if (trayRefreshHandle) {
    clearInterval(trayRefreshHandle);
  }
});
app.on('window-all-closed', () => {
  // StandUp is a tray utility and remains active without visible windows.
});
