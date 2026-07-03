/** Mod "type" classification derived from Steam Workshop tags. */
export type ModType =
  | 'Total Conversion'
  | 'Map'
  | 'Structures'
  | 'Creatures'
  | 'Gameplay'
  | 'Stack Mod'
  | 'Utility'
  | 'Graphics'
  | 'Mod'
  | 'Unknown';

/** Result of a single Steam Workshop lookup, returned from the Rust `fetch_steam_mod_details` command. */
export interface SteamModDetail {
  modId: string;
  name: string | null;
  type: ModType;
  lastUpdated: string | null;
  steamUrl: string;
  steamSize: number;
  previewUrl: string | null;
  error: boolean;
}

export type SteamModDetailsMap = Record<string, SteamModDetail | undefined>;

/** Local folder stats, returned from the Rust `get_mod_folder_infos` command. */
export interface ModFolderInfo {
  size: number;
  lastDownloaded: string;
  path: string;
}

export type ModFolderInfoMap = Record<string, ModFolderInfo | null>;

/** Persisted app settings (stored via tauri-plugin-store). */
export interface AppSettings {
  modsDir?: string;
}

/** A single row in the mod table — merges Steam data, local folder data, and order. */
export interface Mod {
  order: number;
  modId: string;
  name: string;
  type: ModType;
  lastUpdated: string | null;
  steamUrl?: string;
  steamSize?: number;
  previewUrl?: string | null;
  error?: boolean;
  folderSize: number | null;
  lastDownloaded: string | null;
  localPath: string | null;
}

export interface Notification {
  msg: string;
  type: 'info' | 'success' | 'warn' | 'error';
}
