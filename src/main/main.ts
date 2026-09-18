import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getDb, closeDb } from './db/connection';
import { registerIpcHandlers } from './ipc/registerHandlers';
import { seedAdminIfNeeded } from './services/authService';
import { autoBackupIfDue, autoBackupOnQuit } from './services/backupService';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Keep the data directory stable across product renames (library.db + covers
// were created under "lib_manage" before the app was branded LibraFlow).
app.setPath('userData', path.join(app.getPath('appData'), 'lib_manage'));

// Single instance — a second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// Lock down web contents: no popup windows, no navigating away from the app.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const allowedDev = MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const allowedProd = url.startsWith('file://');
    if (!allowedDev && !allowedProd) event.preventDefault();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('ready', () => {
  getDb(); // open + migrate
  seedAdminIfNeeded();
  registerIpcHandlers();
  createWindow();
  // Catches days where the app crashed or was killed before the quit backup ran.
  try {
    autoBackupIfDue();
  } catch (err) {
    console.error('Startup auto-backup failed:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  try {
    autoBackupOnQuit();
  } catch (err) {
    console.error('Quit auto-backup failed:', err);
  }
  closeDb();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
