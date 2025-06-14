declare global {
  interface Window {
    electronAPI: {
      pickFiles: () => Promise<string[]>;
      pickFolder: () => Promise<string>;
      openFile: (path: string) => Promise<void>;
      fileExists: (path: string) => Promise<boolean>;
      readFolderVideos: (path: string) => Promise<VideoEntry[]>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;

      // ✅ Add these:
      getPresets: () => Promise<{ [key: string]: VideoEntry[] }>;
      savePresets: (data: { [key: string]: VideoEntry[] }) => Promise<void>;
    };
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface VideoEntry {
  path: string;
  label: string;
  missing?: boolean;
  children?: VideoEntry[];
  rating?: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit {
  maps: { [key: string]: VideoEntry[] } = {};
  mapNames: string[] = [];
  currentMap = '';
  selectedFolder: string = '';

  renamingMap = false;
  mapBeingRenamed = '';
  renameMapInput = '';

  renamingSubfolder: boolean = false;
  renameSubfolderInput: string = '';
  renamingFile: VideoEntry | null = null;
  renameFileInput = '';
  selectedVideoIndex: number | null = null;

  creatingFolder = false;
  newFolderName = '';

  async ngOnInit(): Promise<void> {
  try {
    const saved = await window.electronAPI.getPresets();
    if (saved && typeof saved === 'object') {
      this.maps = saved;
      this.mapNames = Object.keys(this.maps);
      this.currentMap = this.mapNames[0] || '';
      for (const map of this.mapNames) {
        await this.checkMissing(this.maps[map]);
      }
      this.selectedFolder = this.maps[this.currentMap]?.[0]?.label || '';
    }
  } catch (e) {
    console.error('Failed to load presets:', e);
  }
}

  async checkMissing(entries: VideoEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.children) {
        await this.checkMissing(entry.children);
      } else {
        entry.missing = !(await window.electronAPI.fileExists(entry.path));
      }
    }
  }

  saveMaps(): void {
  window.electronAPI.savePresets(this.maps);
}

  addMap(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || this.maps[trimmed]) return;
    this.maps[trimmed] = [];
    this.mapNames.push(trimmed);
    this.currentMap = trimmed;
    this.saveMaps();
  }

  removeMap(name: string): void {
    delete this.maps[name];
    this.mapNames = this.mapNames.filter(m => m !== name);
    if (this.currentMap === name) {
      this.currentMap = this.mapNames[0] || '';
    }
    this.saveMaps();
  }

  startRenameMap(name: string): void {
    this.renamingMap = true;
    this.mapBeingRenamed = name;
    this.renameMapInput = name;
  }

  confirmRenameMap(): void {
    const newName = this.renameMapInput.trim();
    const oldName = this.mapBeingRenamed;

    if (!newName) return;

    this.renamingMap = false;
    this.mapBeingRenamed = '';

    if (newName === oldName) return;

    this.maps[newName] = this.maps[oldName];
    delete this.maps[oldName];

    const index = this.mapNames.indexOf(oldName);
    if (index > -1) this.mapNames[index] = newName;

    if (this.currentMap === oldName) this.currentMap = newName;

    this.saveMaps();
  }

  async selectVideos(): Promise<void> {
  const paths = await window.electronAPI.pickFiles();
  if (!paths?.length || !this.currentMap) return;

  const entries = await Promise.all(
    paths.map(async p => ({
      path: p,
      label: p.split(/[/\\]/).pop() || 'Untitled',
      missing: !(await window.electronAPI.fileExists(p))
    }))
  );

  // Add to selected folder if it's a valid folder
  if (this.selectedFolder) {
    const folder = this.maps[this.currentMap].find(e => e.label === this.selectedFolder && e.children);
    if (folder && folder.children) {
      const existingLabels = new Set(folder.children.map(e => e.label));
      const filteredEntries = entries.filter(e => !existingLabels.has(e.label));

      if (filteredEntries.length < entries.length) {
        alert('Some files were not added because they already exist in this subfolder.');
      }

      folder.children.push(...filteredEntries);
      this.saveMaps();
      return;
    }
  }

  // Otherwise add to root, checking for duplicates too
  const currentEntries = this.maps[this.currentMap];
  const existingRootLabels = new Set(currentEntries.filter(e => !e.children).map(e => e.label));
  const filteredRootEntries = entries.filter(e => !existingRootLabels.has(e.label));

  if (filteredRootEntries.length < entries.length) {
    alert('Some files were not added because they already exist in this map.');
  }

  currentEntries.push(...filteredRootEntries);
  this.saveMaps();
}


  async importMapFromFolder(): Promise<void> {
  const folderPath = await window.electronAPI.pickFolder();
  if (!folderPath) return;

  const folderName = folderPath.split(/[/\\]/).pop() || 'Untitled';
  const rawFiles = await window.electronAPI.readFolderVideos(folderPath);

  const cleanedFiles = rawFiles.map(file => ({
    ...file,
    label: file.path.split(/[/\\]/).pop() || file.label
  }));

  const nestedTree = this.buildTree(cleanedFiles, folderPath);
  this.maps[folderName] = nestedTree;

  if (!this.mapNames.includes(folderName)) {
    this.mapNames.push(folderName);
  }

  this.currentMap = folderName;

  // 🔍 Auto-select first meaningful subfolder (e.g. Season 1)
  const firstFolderWithVideos = this.maps[folderName].find(
    entry =>
      entry.children &&
      entry.children.some(child => !child.children) &&
      !['screens', 'extras', 'featurettes'].includes(entry.label.toLowerCase())
  );

  this.selectedFolder = firstFolderWithVideos?.label || '';

  this.saveMaps();
}


  buildTree(flatList: VideoEntry[], basePath: string): VideoEntry[] {
    const tree: any = {};
    for (const entry of flatList) {
      const relative = entry.path.replace(basePath + '/', '').replace(basePath + '\\', '');
      const parts = relative.split(/[/\\]/);
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = i === parts.length - 1
            ? { ...entry }
            : { label: part, children: {} };
        }
        current = current[part].children || current[part];
      }
    }

    return this.flattenTree(tree);
  }

  flattenTree(obj: any): VideoEntry[] {
    return Object.values(obj).map((item: any) => {
      if (item.children) {
        return {
          label: item.label,
          path: '',
          children: this.flattenTree(item.children)
        };
      }
      return item;
    });
  }

  playVideo(path: string): void {
    window.electronAPI.openFile(path);
  }

  removeVideo(index: number): void {
  if (!this.currentMap) return;

  const isFlatList = !this.hasFolders() || !this.selectedFolder;
  let list: VideoEntry[] | undefined;

  if (isFlatList) {
    // root level, remove only flat items (not folders)
    list = this.maps[this.currentMap].filter(e => !e.children);
    const flatIndexes = this.maps[this.currentMap]
      .map((e, i) => (!e.children ? i : -1))
      .filter(i => i !== -1);
    const actualIndex = flatIndexes[index];
    if (actualIndex !== undefined) {
      this.maps[this.currentMap].splice(actualIndex, 1);
    }
  } else {
    // subfolder mode
    const folder = this.maps[this.currentMap].find(
      f => f.label === this.selectedFolder && f.children
    );
    if (folder && folder.children) {
      folder.children.splice(index, 1);
    }
  }

  this.saveMaps();
}


  startRenameFile(video: VideoEntry): void {
  this.renamingFile = video;
  this.renameFileInput = video.label;
  }

  confirmRenameFile(): void {
  if (!this.renamingFile || !this.renameFileInput.trim()) return;
  this.renamingFile.label = this.renameFileInput.trim();
  this.renamingFile = null;
  this.saveMaps();
}

  async syncCurrentMap(): Promise<void> {
    if (!this.currentMap || !this.maps[this.currentMap]) return;
    await this.checkMissing(this.maps[this.currentMap]);
    this.saveMaps();
  }

  hasFolders(): boolean {
    const map = this.maps?.[this.currentMap];
    return Array.isArray(map) && map.some(entry => !!entry.children);
  }

  startCreatingFolder(): void {
    this.creatingFolder = true;
    this.newFolderName = '';
  }

  createNewFolder(): void {
  const trimmed = this.newFolderName.trim();
  if (!trimmed || !this.currentMap) return;

  if (!this.maps[this.currentMap]) this.maps[this.currentMap] = [];

  const currentEntries = this.maps[this.currentMap];

  const folderAlreadyExists = currentEntries.some(entry => entry.label === trimmed);
  if (folderAlreadyExists) return;

  // Step 1: Separate flat videos (no children) from folders
  const flatVideos = currentEntries.filter(e => !e.children);
  const folders = currentEntries.filter(e => e.children);

  // Step 2: If there are any flat videos, move them into "Default" folder
  if (flatVideos.length > 0) {
    const defaultFolder = folders.find(f => f.label === 'Default' && f.children);

    if (defaultFolder) {
      defaultFolder.children!.push(...flatVideos);
    } else {
      folders.push({
        label: 'Default',
        path: '',
        children: flatVideos
      });
    }
  }

  // Step 3: Remove flat videos from root level
  this.maps[this.currentMap] = folders;

  // Step 4: Add the new subfolder
  this.maps[this.currentMap].push({
    label: trimmed,
    path: '',
    children: []
  });

  this.creatingFolder = false;
  this.newFolderName = '';
  this.selectedFolder = trimmed;

  this.saveMaps();
}


  filterText: string = '';
  sortOption: string = 'date-asc';

getFilteredSorted(list: VideoEntry[]): VideoEntry[] {
  if (!list) return [];

  let filtered = [...list];

  // optional filter logic
  // if (this.filterText.trim()) {
  //   filtered = filtered.filter(e =>
  //     e.label?.toLowerCase().includes(this.filterText.toLowerCase())
  //   );
  // }

  // Sort rated videos to the bottom
  filtered.sort((a, b) => {
    const aRated = typeof a.rating === 'number' && a.rating > 0;
    const bRated = typeof b.rating === 'number' && b.rating > 0;

    if (aRated && !bRated) return 1;
    if (!aRated && bRated) return -1;

    // Then apply other sort
    switch (this.sortOption) {
      case 'name-asc':
        return a.label.localeCompare(b.label);
      case 'name-desc':
        return b.label.localeCompare(a.label);
      case 'date-desc':
        return -1; // treat original order
      case 'date-asc':
      default:
        return 0;
    }
  });

  return filtered;
}

hoverRatings = new WeakMap<VideoEntry, number>();
hoverHalves = new WeakMap<VideoEntry, boolean>();

setRating(video: VideoEntry, newRating: number): void {
  if (video.rating === newRating) {
    video.rating = undefined;
  } else {
    video.rating = newRating;
  }
  this.saveMaps();
}

onStarEnter(video: VideoEntry, star: number, event: MouseEvent): void {
  this.hoverRatings.set(video, star);
  this.hoverHalves.set(video, event.offsetX < 12);
}

onStarLeave(video: VideoEntry): void {
  this.hoverRatings.set(video, 0);
  this.hoverHalves.set(video, false);
}

getStarPercent(video: VideoEntry, star: number): number {
  const hover = this.hoverRatings.get(video) || 0;
  const half = this.hoverHalves.get(video) || false;
  const value = hover ? hover - (half ? 0.5 : 0) : video.rating || 0;

  if (value >= star) return 100;
  if (value >= star - 0.5) return 50;
  return 0;
}

showAverages = false;

getMapAverage(mapName: string): number {
  const entries = this.maps[mapName] || [];
  const ratings = this.collectRatings(entries);
  return this.calculateAverage(ratings);
}

getFolderAverage(mapName: string, folderLabel: string): number {
  const folder = this.maps[mapName]?.find(e => e.label === folderLabel && e.children);
  const ratings = folder?.children ? this.collectRatings(folder.children) : [];
  return this.calculateAverage(ratings);
}

collectRatings(entries: VideoEntry[]): number[] {
  let ratings: number[] = [];
  for (const entry of entries) {
    if (entry.children) {
      ratings = ratings.concat(this.collectRatings(entry.children));
    } else if (typeof entry.rating === 'number') {
      ratings.push(entry.rating);
    }
  }
  return ratings;
}

calculateAverage(ratings: number[]): number {
  if (!ratings.length) return 0;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return sum / ratings.length;
}

sanitizeId(input: string, star: number): string {
  return 'grad-' + (input || '').replace(/[^a-zA-Z0-9-_]/g, '') + '-' + star;
}

minimize() {
  window.electronAPI?.minimize?.();
}

maximize() {
  window.electronAPI?.maximize?.();
}

close() {
  window.electronAPI?.close?.();
}

startRenameSubfolder(): void {
  const folder = this.maps[this.currentMap]?.find(f => f.label === this.selectedFolder && f.children);
  if (!folder) return;

  this.renamingSubfolder = true;
  this.renameSubfolderInput = folder.label;
}

confirmRenameSubfolder(): void {
  const newName = this.renameSubfolderInput.trim();
  const folder = this.maps[this.currentMap]?.find(f => f.label === this.selectedFolder && f.children);
  if (!folder || !newName || newName === folder.label) {
    this.renamingSubfolder = false;
    return;
  }

  const duplicate = this.maps[this.currentMap].some(f => f.label === newName && f !== folder && f.children);
  if (duplicate) {
    alert('A folder with this name already exists.');
    return;
  }

  folder.label = newName;
  this.selectedFolder = newName;
  this.renamingSubfolder = false;
  this.saveMaps();
}

removeSubfolder(): void {
  const confirmed = confirm(`Delete folder "${this.selectedFolder}" and its contents?`);
  if (!confirmed) return;

  this.maps[this.currentMap] = this.maps[this.currentMap].filter(
    f => !(f.label === this.selectedFolder && f.children)
  );

  this.selectedFolder = '';
  this.saveMaps();
}

async importMapAsSubfolder(): Promise<void> {
  const folderPath = await window.electronAPI.pickFolder();
  if (!folderPath || !this.currentMap) return;

  const folderName = folderPath.split(/[/\\]/).pop() || 'Untitled';
  const rawFiles = await window.electronAPI.readFolderVideos(folderPath);

  const cleanedFiles = rawFiles.map(file => ({
    ...file,
    label: file.path.split(/[/\\]/).pop() || file.label
  }));

  // Check if folder already exists
  const folderExists = this.maps[this.currentMap]?.some(
    e => e.label === folderName && e.children
  );
  if (folderExists) {
    alert('A subfolder with this name already exists.');
    return;
  }

  const map = this.maps[this.currentMap];
  const flatVideos = map.filter(e => !e.children);
  const folders = map.filter(e => e.children);

  // Move flat videos to Default
  if (flatVideos.length > 0) {
    let defaultFolder = folders.find(f => f.label === 'Default' && f.children);
    if (!defaultFolder) {
      defaultFolder = { label: 'Default', path: '', children: [] };
      folders.push(defaultFolder);
    }
    defaultFolder.children!.push(...flatVideos);
  }

  // Reassign cleaned structure to root
  this.maps[this.currentMap] = folders;

  // Add imported folder
  this.maps[this.currentMap].push({
    label: folderName,
    path: '',
    children: cleanedFiles
  });

  this.selectedFolder = folderName;
  this.saveMaps();
}

  
}
