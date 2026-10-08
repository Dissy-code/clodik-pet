const { app, BrowserWindow, Menu, ipcMain, screen, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');

const STATE_PATH = path.join(app.getPath('userData'), 'settings.json');
const PACKS_DIR = path.join(app.getPath('userData'), 'packs');
const FRAME_NAMES = ['base', 'blink', 'tired', 'legs_a', 'legs_b'];

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
  activePack: 'default',
  theme: 'light',
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
  win.setTitle('ClodikPet');
  win.webContents.on('did-finish-load', () => win.setTitle('ClodikPet'));
  win.on('show', () => reassertAlwaysOnTop());
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
  bubbleWin.setTitle('ClodikPetBubble');
  bubbleWin.webContents.on('did-finish-load', () => {
    bubbleWin.setTitle('ClodikPetBubble');
    bubbleWin.webContents.send('set-theme', settings.theme);
  });
  bubbleWin.setIgnoreMouseEvents(true);
  bubbleWin.loadFile('bubble.html');
  positionBubbleWin();
}

function applyTheme() {
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.webContents.send('set-theme', settings.theme);
}

function reassertAlwaysOnTop() {
  if (win && !win.isDestroyed()) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  }
}

function daysSince(ts) {
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

const BUILTIN_CATEGORIES = {
  'Цвета': {
    red: 'Красный',
    yellow: 'Жёлтый',
    green: 'Зелёный',
    blue: 'Синий',
    purple: 'Фиолетовый',
    pink: 'Розовый',
  },
  'Темы': {
    minecraft: 'Майнкрафт',
    lava: 'Лава',
    gold: 'Золото',
  },
};
const BUILTIN_PACKS = Object.assign({}, ...Object.values(BUILTIN_CATEGORIES));

function getSpritesPath() {
  if (settings.activePack === 'default') return path.join(__dirname, 'assets');
  if (BUILTIN_PACKS[settings.activePack]) return path.join(__dirname, 'builtin-packs', settings.activePack);
  const dir = path.join(PACKS_DIR, settings.activePack);
  const hasAllFrames = FRAME_NAMES.every(n => fs.existsSync(path.join(dir, `${n}.png`)));
  return hasAllFrames ? dir : path.join(__dirname, 'assets');
}

function listPacks() {
  try {
    return fs.readdirSync(PACKS_DIR).filter(name => {
      const dir = path.join(PACKS_DIR, name);
      return fs.statSync(dir).isDirectory() && FRAME_NAMES.every(n => fs.existsSync(path.join(dir, `${n}.png`)));
    });
  } catch {
    return [];
  }
}

function importPack() {
  const result = dialog.showOpenDialogSync(win, {
    title: 'Выбери текстурпак (.zip)',
    properties: ['openFile'],
    filters: [{ name: 'Текстурпак', extensions: ['zip'] }]
  });
  if (!result || !result[0]) return;
  const zipPath = result[0];

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    dialog.showErrorBox('Не получилось открыть архив', 'Файл повреждён или это не zip.');
    return;
  }

  const byName = new Map();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    byName.set(path.basename(entry.entryName).toLowerCase(), entry);
  }

  const missing = FRAME_NAMES.filter(n => !byName.has(`${n}.png`));
  if (missing.length) {
    dialog.showErrorBox('Не похоже на текстурпак', `В архиве не хватает файлов: ${missing.map(n => n + '.png').join(', ')}`);
    return;
  }

  let name = path.basename(zipPath, path.extname(zipPath)).replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_') || 'pack';
  let destDir = path.join(PACKS_DIR, name);
  let i = 2;
  while (fs.existsSync(destDir)) {
    destDir = path.join(PACKS_DIR, `${name}_${i}`);
    i++;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const n of FRAME_NAMES) {
    fs.writeFileSync(path.join(destDir, `${n}.png`), byName.get(`${n}.png`).getData());
  }

  settings.activePack = path.basename(destDir);
  saveSettings(settings);
  if (win) win.reload();
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
      label: 'Текстурка',
      submenu: [
        {
          label: 'Стандартная',
          type: 'radio',
          checked: settings.activePack === 'default',
          click: () => { settings.activePack = 'default'; saveSettings(settings); if (win) win.reload(); }
        },
        { type: 'separator' },
        ...Object.entries(BUILTIN_CATEGORIES).map(([category, packs]) => ({
          label: category,
          submenu: Object.entries(packs).map(([id, label]) => ({
            label,
            type: 'radio',
            checked: settings.activePack === id,
            click: () => { settings.activePack = id; saveSettings(settings); if (win) win.reload(); }
          }))
        })),
        ...(listPacks().length ? [
          { type: 'separator' },
          {
            label: 'Свои',
            submenu: listPacks().map(name => ({
              label: name,
              type: 'radio',
              checked: settings.activePack === name,
              click: () => { settings.activePack = name; saveSettings(settings); if (win) win.reload(); }
            }))
          }
        ] : []),
        { type: 'separator' },
        { label: 'Импортировать текстурпак...', click: () => importPack() }
      ]
    },
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
    {
      label: 'Тема пузыря',
      submenu: [
        {
          label: 'Светлая',
          type: 'radio',
          checked: settings.theme === 'light',
          click: () => { settings.theme = 'light'; saveSettings(settings); applyTheme(); }
        },
        {
          label: 'Тёмная',
          type: 'radio',
          checked: settings.theme === 'dark',
          click: () => { settings.theme = 'dark'; saveSettings(settings); applyTheme(); }
        }
      ]
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

const ROAM_POLL_MS = 15000;
const ROAM_CHANCE = 0.08;
function pollRoam() {
  if (!win || win.isDestroyed()) return;
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return;
  if (Math.random() > ROAM_CHANCE) return;
  const b = win.getBounds();
  const current = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const others = displays.filter(d => d.id !== current.id);
  if (!others.length) return;
  const target = others[Math.floor(Math.random() * others.length)];
  win.webContents.send('roam-to', target.workArea);
}

const WORKSPACE_POLL_MS = 1500;
const WORKSPACE_CMDS = {
  kwin: 'qdbus6 org.kde.KWin /VirtualDesktopManager org.freedesktop.DBus.Properties.Get org.kde.KWin.VirtualDesktopManager current',
  xdotool: 'xdotool get_desktop',
};

let currentWorkspace = null;
let workspacePollBusy = false;
let workspaceToolFailures = 0;
let workspaceMethod = null;
let workspaceProbeStarted = false;

function applyKwinSticky() {
  const scriptPath = path.join(__dirname, 'kwin-sticky.js');
  exec(`qdbus6 org.kde.KWin /Scripting loadScript "${scriptPath}" clodikPetSticky`, { timeout: 2000 }, (err, stdout) => {
    if (err) return;
    const id = stdout.trim();
    if (!id) return;
    exec(`qdbus6 org.kde.KWin /Scripting/Script${id} run`, { timeout: 2000 });
  });
}

function probeWorkspaceMethod() {
  workspaceProbeStarted = true;
  exec(WORKSPACE_CMDS.kwin, { timeout: 1000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      workspaceMethod = 'kwin';
      applyKwinSticky();
      return;
    }
    exec(WORKSPACE_CMDS.xdotool, { timeout: 1000 }, (err2, stdout2) => {
      if (!err2 && stdout2.trim()) workspaceMethod = 'xdotool';
    });
  });
}

function pollWorkspace() {
  if (!win || win.isDestroyed()) return;
  if (!workspaceProbeStarted) { probeWorkspaceMethod(); return; }
  if (!workspaceMethod || workspacePollBusy || workspaceToolFailures >= 10) return;
  workspacePollBusy = true;
  exec(WORKSPACE_CMDS[workspaceMethod], { timeout: 1000 }, (err, stdout) => {
    workspacePollBusy = false;
    if (err) {
      workspaceToolFailures++;
      return;
    }
    workspaceToolFailures = 0;
    const id = stdout.trim();
    if (!id) return;
    if (currentWorkspace === null) {
      currentWorkspace = id;
      return;
    }
    if (id !== currentWorkspace) {
      currentWorkspace = id;
      reassertAlwaysOnTop();
      if (workspaceMethod === 'kwin') applyKwinSticky();
      win.webContents.send('workspace-changed');
    }
  });
}

app.whenReady().then(() => {
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  createWindow();
  setInterval(pollActivity, POLL_MS);
  setInterval(pollCursor, CURSOR_POLL_MS);
  setInterval(pollRoam, ROAM_POLL_MS);
  setInterval(pollWorkspace, WORKSPACE_POLL_MS);
  setInterval(reassertAlwaysOnTop, 3000);
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
    spritesPath: getSpritesPath(),
    displays: screen.getAllDisplays().map(d => d.workArea),
  };
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { applyDecay(); saveSettings(settings); });
