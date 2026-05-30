const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f1117',
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    // In packaged app, __dirname is .../resources/app/electron
    // build/ sits at .../resources/app/build
    win.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('fetch-steam-mod-details', async (_, { modIds }) => {
  const BATCH_SIZE = 100;
  const results = {};

  for (let i = 0; i < modIds.length; i += BATCH_SIZE) {
    const batch = modIds.slice(i, i + BATCH_SIZE);
    try {
      // Try GET endpoint first (IPublishedFileService/GetDetails) — no key needed for basic info
      const params = new URLSearchParams();
      params.append('itemcount', batch.length);
      batch.forEach((id, idx) => params.append(`publishedfileids[${idx}]`, id));

      const res = await fetch(
        `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const details = data?.response?.publishedfiledetails ?? [];

      for (const item of details) {
        if (item.result === 1) {
          results[item.publishedfileid] = {
            modId: item.publishedfileid,
            name: item.title || null,
            type: extractModType(item.tags),
            lastUpdated: item.time_updated
              ? new Date(item.time_updated * 1000).toISOString()
              : null,
            steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
            steamSize: item.file_size ? parseInt(item.file_size) : 0,
            previewUrl: item.preview_url || null,
            error: false,
          };
        } else {
          results[item.publishedfileid] = { modId: item.publishedfileid, error: true };
        }
      }
    } catch (err) {
      console.error('Steam fetch error:', err.message);
      for (const id of batch) {
        if (!results[id]) results[id] = { modId: id, error: true };
      }
    }
  }

  return results;
});

function extractModType(tags) {
  if (!tags || !Array.isArray(tags)) return 'Mod';
  const vals = tags.map(t => (typeof t === 'object' ? t.tag : t).toLowerCase());
  if (vals.includes('total conversion')) return 'Total Conversion';
  if (vals.includes('map')) return 'Map';
  if (vals.includes('structures')) return 'Structures';
  if (vals.includes('creatures')) return 'Creatures';
  if (vals.includes('gameplay')) return 'Gameplay';
  if (vals.includes('stack mod')) return 'Stack Mod';
  if (vals.includes('utilities')) return 'Utility';
  if (vals.includes('graphics')) return 'Graphics';
  return 'Mod';
}

function getFolderSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) total += getFolderSize(full);
      else total += fs.statSync(full).size;
    }
  } catch { /* folder missing or no access */ }
  return total;
}

function getModFolderInfo(modsDir, modId) {
  const modPath = path.join(modsDir, modId);
  try {
    const stat = fs.statSync(modPath);
    if (!stat.isDirectory()) return null;
    return {
      size: getFolderSize(modPath),
      lastDownloaded: stat.mtime.toISOString(),
      path: modPath,
    };
  } catch {
    return null;
  }
}

ipcMain.handle('get-mod-folder-infos', async (_, { modsDir, modIds }) => {
  const results = {};
  for (const id of modIds) {
    results[id] = getModFolderInfo(modsDir, id);
  }
  return results;
});

ipcMain.handle('open-folder', async (_, folderPath) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return { ok: true };
  }
  return { ok: false, error: 'Folder not found' };
});

ipcMain.handle('browse-mods-dir', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select ARK Mods Folder',
    properties: ['openDirectory'],
    defaultPath: getDefaultModsPath(),
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('import-mod-list', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import Mod List',
    filters: [
      { name: 'Text Files', extensions: ['txt', 'ini', 'cfg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return content;
  } catch (e) {
    return null;
  }
});

function getDefaultModsPath() {
  const home = require('os').homedir();
  const candidates = [
    path.join('C:\\', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'ARK', 'ShooterGame', 'Content', 'Mods'),
    path.join(home, '.steam', 'steam', 'steamapps', 'common', 'ARK', 'ShooterGame', 'Content', 'Mods'),
    path.join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'ARK', 'ShooterGame', 'Content', 'Mods'),
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return home;
}