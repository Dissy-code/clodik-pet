const { app, BrowserWindow, Menu, ipcMain, screen, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  breakIdleSec: 180,
  sleepIdleSec: 600,
  nagSec: 45 * 60,
  nagHardSec: 90 * 60,
  pets: 0,
  drops: 0,
  bornAt: Date.now(),
  hunger: 100,
  happiness: 100,
  lastTickAt: Date.now(),
};

const HUNGER_FULL_DECAY_MS = 8 * 60 * 60 * 1000;
const HAPPINESS_FULL_DECAY_MS = 30 * 60 * 60 * 1000;

function clamp100(v) { return Math.max(0, Math.min(100, v)); }

function applyDecay() {
  const now = Date.now();
  const dtMs = Math.max(0, now - (settings.lastTickAt || now));
  settings.lastTickAt = now;
  settings.hunger = clamp100(settings.hunger - dtMs * (100 / HUNGER_FULL_DECAY_MS));
  settings.happiness = clamp100(settings.happiness - dtMs * (100 / HAPPINESS_FULL_DECAY_MS));
}

function feedPet() {
  applyDecay();
  settings.hunger = 100;
  settings.happiness = clamp100(settings.happiness + 10);
  saveSettings(settings);
  if (win && !win.isDestroyed()) win.webContents.send('fed');
}

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch {}
}

let settings = loadSettings();
applyDecay();
let win = null;
let bubbleWin = null;
let workSeconds = 0;
let lastIdle = 0;

const POLL_MS = 5000;
const PET_W = 88;
const PET_H = 74;
const BUBBLE_W = 220;
const BUBBLE_H = 70;

let displayArea = null;

function positionBubbleWin() {
  if (!win || !bubbleWin) return;
  const b = win.getBounds();
  bubbleWin.setPosition(
    Math.round(b.x + (PET_W - BUBBLE_W) / 2),
    Math.round(b.y - BUBBLE_H + 20)
  );
}

function pickDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function createWindow() {
  const display = pickDisplay();
  displayArea = display.workArea;
  const x = Math.round(displayArea.x + (displayArea.width - PET_W) / 2);
  const y = displayArea.y + displayArea.height - PET_H - 6;

  win = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x, y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('context-menu', () => showContextMenu());

  bubbleWin = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    }
  });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.setIgnoreMouseEvents(true);
  bubbleWin.loadFile('bubble.html');
  positionBubbleWin();
}

function daysSince(ts) {
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function showContextMenu() {
  applyDecay();
  const menu = Menu.buildFromTemplate([
    { label: '🍪 Покормить', click: () => feedPet() },
    { label: '🎲 Трюк!', click: () => { if (win) win.webContents.send('do-trick'); } },
    { type: 'separator' },
    { label: `Сытость: ${Math.round(settings.hunger)}%`, enabled: false },
    { label: `Настроение: ${Math.round(settings.happiness)}%`, enabled: false },
    { type: 'separator' },
    { label: `С тобой уже ${daysSince(settings.bornAt)} дн.`, enabled: false },
    { label: `Поглажен ${settings.pets} раз`, enabled: false },
    { label: `Уронили ${settings.drops} раз`, enabled: false },
    { type: 'separator' },
    {
      label: 'Порог нытья про перерыв',
      submenu: [15, 30, 45, 60, 90].map(min => ({
        label: `${min} мин`,
        type: 'radio',
        checked: settings.nagSec === min * 60,
        click: () => { settings.nagSec = min * 60; settings.nagHardSec = min * 60 * 2; saveSettings(settings); }
      }))
    },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() }
  ]);
  menu.popup({ window: win });
}

function pollActivity() {
  const idle = powerMonitor.getSystemIdleTime();
  const wasAway = lastIdle >= settings.breakIdleSec;
  const justReturned = wasAway && idle < 2;

  if (idle >= settings.breakIdleSec) {
    workSeconds = 0;
  } else {
    workSeconds += POLL_MS / 1000;
  }
  lastIdle = idle;

  applyDecay();
  saveSettings(settings);

  if (win && !win.isDestroyed()) {
    win.webContents.send('pet-state', {
      idleSeconds: idle,
      workSeconds,
      justReturned,
      settings,
    });
  }
}

const CURSOR_POLL_MS = 1000;
function pollCursor() {
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const cursorDisplay = screen.getDisplayNearestPoint(cursor);
  win.webContents.send('cursor-state', { cursor, cursorArea: cursorDisplay.workArea });
}

app.whenReady().then(() => {
  createWindow();
  setInterval(pollActivity, POLL_MS);
  setInterval(pollCursor, CURSOR_POLL_MS);
});

ipcMain.on('move-window', (e, { x, y }) => {
  if (!win) return;
  win.setPosition(Math.round(x), Math.round(y));
  positionBubbleWin();
});

ipcMain.on('bubble-update', (e, data) => {
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.webContents.send('bubble-update', data);
});

ipcMain.on('stat-inc', (e, key) => {
  if (key !== 'pets' && key !== 'drops') return;
  settings[key] = (settings[key] || 0) + 1;
  if (key === 'pets') {
    applyDecay();
    settings.happiness = clamp100(settings.happiness + 3);
  }
  saveSettings(settings);
});

ipcMain.on('get-init', (e) => {
  const b = win.getBounds();
  e.returnValue = {
    areaX: displayArea.x,
    areaY: displayArea.y,
    areaWidth: displayArea.width,
    areaHeight: displayArea.height,
    petW: PET_W,
    petH: PET_H,
    x: b.x,
    y: b.y,
  };
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { applyDecay(); saveSettings(settings); });
