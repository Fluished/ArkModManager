import { isTauri as checkIsTauri, invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { openPath as openPathInShell } from '@tauri-apps/plugin-opener';
import { load, type Store } from '@tauri-apps/plugin-store';
import type {
  AppSettings,
  ModFolderInfoMap,
  SteamModDetailsMap,
} from '../types';

/** True when running inside the Tauri shell; false in a plain browser (e.g. `vite dev` in a tab). */
export const isTauri = checkIsTauri();

const SETTINGS_FILE = 'settings.json';
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(SETTINGS_FILE, { defaults: {}, autoSave: true });
  return storePromise;
}

/** Everything the renderer needs from the OS/filesystem/network, backed by Tauri commands & plugins. */
export const desktopApi = {
  async getSettings(): Promise<AppSettings> {
    const store = await getStore();
    const modsDir = await store.get<string>('modsDir');
    return { modsDir };
  },

  async saveSettings(data: AppSettings): Promise<void> {
    const store = await getStore();
    if (data.modsDir !== undefined) await store.set('modsDir', data.modsDir);
  },

  getDefaultModsPath(): Promise<string> {
    return invoke<string>('get_default_mods_path');
  },

  fetchSteamModDetails(modIds: string[]): Promise<SteamModDetailsMap> {
    return invoke<SteamModDetailsMap>('fetch_steam_mod_details', { modIds });
  },

  getModFolderInfos(modsDir: string, modIds: string[]): Promise<ModFolderInfoMap> {
    return invoke<ModFolderInfoMap>('get_mod_folder_infos', { modsDir, modIds });
  },

  async openFolder(folderPath: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await openPathInShell(folderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async browseModsDir(defaultPath?: string): Promise<string | null> {
    const selected = await openDialog({
      title: 'Select ARK Mods Folder',
      directory: true,
      defaultPath,
    });
    return typeof selected === 'string' ? selected : null;
  },

  async importModList(): Promise<string | null> {
    const selected = await openDialog({
      title: 'Import Mod List',
      multiple: false,
      filters: [
        { name: 'Text Files', extensions: ['txt', 'ini', 'cfg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (typeof selected !== 'string') return null;
    try {
      return await readTextFile(selected);
    } catch {
      return null;
    }
  },
};
