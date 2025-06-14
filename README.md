# 🎬 VibeVault

**VibeVault** is a sleek, desktop media library app built with **Angular**, **Electron**, and **Express**.  
Organize your video collections into custom folders ("Maps"), import whole directories, track watched status, and even rate videos — all with data that **persists across restarts and reinstalls**.

---

## ✨ Features

- 🎞 Import folders or individual video files
- 📁 Create named _Maps_ and subfolders to organize your collection
- 🏷 Rename files/folders directly in-app
- ⭐ Rate videos (with averages per folder or map)
- 🔍 Auto-detect missing or moved files
- 💾 Saves data locally in `AppData` (Windows), so nothing is lost on restart
- 🎨 Clean dark UI with minimal design
- 🖥 Packaged into `.exe` installer with uninstaller and shortcuts

---

## 📦 Tech Stack

- ⚡ [Angular 20](https://angular.io/)
- 🧠 Electron 36
- 🚀 Express.js (local server)
- 💾 Native file system APIs via Electron IPC

---

## 🛠 Installation

```bash
npm install
npm run build
npm run electron
```
