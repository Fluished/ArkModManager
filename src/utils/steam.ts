import { desktopApi, isTauri } from '../lib/tauri';
import type { ModType, SteamModDetailsMap } from '../types';

const STEAM_API_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const BATCH_SIZE = 100;

interface RawSteamTag {
  tag?: string;
}

interface RawSteamFileDetail {
  result: number;
  publishedfileid: string;
  title?: string;
  tags?: (RawSteamTag | string)[];
  time_updated?: number;
  file_size?: string | number;
  preview_url?: string;
}

interface RawSteamResponse {
  response?: {
    publishedfiledetails?: RawSteamFileDetail[];
  };
}

export async function fetchSteamModDetails(modIds: string[]): Promise<SteamModDetailsMap> {
  // In Tauri: delegate to the Rust backend to avoid CORS and keep batching server-side.
  if (isTauri) {
    return desktopApi.fetchSteamModDetails(modIds);
  }

  // Fallback: direct browser fetch (plain `vite dev` in a browser tab, no Tauri shell).
  const results: SteamModDetailsMap = {};
  const batches: string[][] = [];
  for (let i = 0; i < modIds.length; i += BATCH_SIZE) {
    batches.push(modIds.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    try {
      const params = new URLSearchParams();
      params.append('itemcount', String(batch.length));
      batch.forEach((id, i) => params.append(`publishedfileids[${i}]`, id));

      const res = await fetch(STEAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) throw new Error(`Steam API error: ${res.status}`);
      const data: RawSteamResponse = await res.json();
      const details = data?.response?.publishedfiledetails ?? [];

      for (const item of details) {
        if (item.result === 1) {
          results[item.publishedfileid] = {
            modId: item.publishedfileid,
            name: item.title || `Mod ${item.publishedfileid}`,
            type: extractModType(item.tags),
            lastUpdated: item.time_updated
              ? new Date(item.time_updated * 1000).toISOString()
              : null,
            steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
            steamSize: item.file_size ? Number(item.file_size) : 0,
            previewUrl: item.preview_url || null,
            error: false,
          };
        } else {
          results[item.publishedfileid] = {
            modId: item.publishedfileid,
            name: null,
            type: 'Unknown',
            lastUpdated: null,
            steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
            steamSize: 0,
            previewUrl: null,
            error: true,
          };
        }
      }
    } catch (err) {
      console.error('Steam API fetch failed for batch:', err);
      for (const id of batch) {
        if (!results[id]) {
          results[id] = {
            modId: id,
            name: null,
            type: 'Unknown',
            lastUpdated: null,
            steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
            steamSize: 0,
            previewUrl: null,
            error: true,
          };
        }
      }
    }
  }

  return results;
}

function extractModType(tags: (RawSteamTag | string)[] | undefined): ModType {
  if (!tags || !Array.isArray(tags)) return 'Mod';
  const tagValues = tags.map((t) => (typeof t === 'object' ? t.tag ?? '' : t).toLowerCase());
  if (tagValues.includes('total conversion')) return 'Total Conversion';
  if (tagValues.includes('map')) return 'Map';
  if (tagValues.includes('structures')) return 'Structures';
  if (tagValues.includes('creatures')) return 'Creatures';
  if (tagValues.includes('gameplay')) return 'Gameplay';
  if (tagValues.includes('stack mod')) return 'Stack Mod';
  if (tagValues.includes('utilities')) return 'Utility';
  if (tagValues.includes('graphics')) return 'Graphics';
  return 'Mod';
}

export function parseModIds(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{5,12}$/.test(s)),
    ),
  ];
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
