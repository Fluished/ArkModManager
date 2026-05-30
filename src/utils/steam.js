const STEAM_API_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const BATCH_SIZE = 100;

export async function fetchSteamModDetails(modIds) {
  // In Electron: delegate to main process to avoid CORS
  if (typeof window !== 'undefined' && window.electronAPI?.fetchSteamModDetails) {
    return window.electronAPI.fetchSteamModDetails({ modIds });
  }

  // Fallback: direct browser fetch (dev/web mode)
  const results = {};
  const batches = [];
  for (let i = 0; i < modIds.length; i += BATCH_SIZE) {
    batches.push(modIds.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    try {
      const params = new URLSearchParams();
      params.append('itemcount', batch.length);
      batch.forEach((id, i) => params.append(`publishedfileids[${i}]`, id));

      const res = await fetch(STEAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) throw new Error(`Steam API error: ${res.status}`);
      const data = await res.json();
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
            steamSize: item.file_size || 0,
            previewUrl: item.preview_url || null,
            error: false,
          };
        } else {
          results[item.publishedfileid] = { modId: item.publishedfileid, error: true };
        }
      }
    } catch (err) {
      console.error('Steam API fetch failed for batch:', err);
      for (const id of batch) {
        if (!results[id]) results[id] = { modId: id, error: true };
      }
    }
  }

  return results;
}

function extractModType(tags) {
  if (!tags || !Array.isArray(tags)) return 'Mod';
  const tagValues = tags.map(t => (typeof t === 'object' ? t.tag : t).toLowerCase());
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

export function parseModIds(input) {
  return [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(s => /^\d{5,12}$/.test(s))
    ),
  ];
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}