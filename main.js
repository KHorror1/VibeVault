const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');

let mainWindow;

// ✅ Presets file path
const presetsPath = path.join(app.getPath('userData'), 'presets.json');

// ✅ Load presets from disk
function loadPresets() {
  try {
    if (fs.existsSync(presetsPath)) {
      return JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
    }
  } catch (e) {
    console.error('❌ Failed to load presets:', e);
  }
  return {}; // return empty object if nothing found
}

// ✅ Save presets to disk
function savePresets(data) {
  try {
    fs.writeFileSync(presetsPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ Failed to save presets:', e);
  }
}

// ✅ Start Express server
const expressApp = express();
const EXPRESS_PORT = 4567;

expressApp.get('/ping', (req, res) => {
  res.json({ message: 'pong from Express' });
});

expressApp.listen(EXPRESS_PORT, () => {
  console.log(`✅ Express server running at http://localhost:${EXPRESS_PORT}`);
});

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    console.log('🔧 Dev mode: loading http://localhost:4200');
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, 'dist', 'browser', 'browser', 'index.html');
    console.log('📄 Attempting to load index.html from:', indexPath);

    if (!fs.existsSync(indexPath)) {
      console.error('❌ index.html NOT FOUND!');
      mainWindow.loadURL('data:text/html,<h1 style="color:red;">Error: index.html not found</h1>');
      return;
    }

    mainWindow.loadFile(indexPath).catch(err => {
      console.error('❌ Failed to load index.html:', err);
      mainWindow.loadURL('data:text/html,<h1 style="color:red;">Failed to load index.html</h1>');
    });
  }
}

app.whenReady().then(createWindow);

// 🧠 Preset save/load IPC handlers
ipcMain.handle('presets:load', () => loadPresets());
ipcMain.handle('presets:save', (_, data) => savePresets(data));

// 🗂 File/Folder dialog handlers
ipcMain.handle('dialog:pick-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
  });
  return result.filePaths;
});

ipcMain.handle('dialog:pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.filePaths?.[0];
});

ipcMain.handle('file:open', async (_, filePath) => {
  await shell.openPath(filePath);
});

ipcMain.handle('file:exists', async (_, filePath) => {
  try {
    const normalized = path.resolve(filePath);
    return fs.existsSync(normalized);
  } catch {
    return false;
  }
});

ipcMain.handle('folder:read-videos', async (_, folderPath) => {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov'];
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (videoExtensions.includes(path.extname(entry.name).toLowerCase())) {
        results.push({
          path: fullPath,
          label: path.relative(folderPath, fullPath).replace(/\\/g, '/'),
          missing: false
        });
      }
    }
  }

  try {
    walk(folderPath);
    return results;
  } catch (e) {
    console.error('[folder:read-videos] error:', e);
    return [];
  }
});

// 🪟 Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
