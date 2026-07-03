import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AddModModal } from './components/AddModModal';
import { ModRow } from './components/ModRow';
import { ToolbarBtn } from './components/ToolbarBtn';
import { desktopApi, isTauri } from './lib/tauri';
import type { Mod, Notification } from './types';
import { fetchSteamModDetails, parseModIds } from './utils/steam';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [filter, setFilter] = useState('');
  const [modsDir, setModsDir] = useState('');
  const [defaultModsDir, setDefaultModsDir] = useState('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    desktopApi.getDefaultModsPath().then((p) => setDefaultModsDir(p || ''));
    desktopApi.getSettings().then((settings) => {
      if (settings?.modsDir) setModsDir(settings.modsDir);
    });
  }, []);

  const notify = (msg: string, type: Notification['type'] = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const persistModsDir = useCallback((dir: string) => {
    setModsDir(dir);
    if (isTauri) desktopApi.saveSettings({ modsDir: dir });
  }, []);

  const handleSearch = useCallback(async () => {
    const ids = parseModIds(inputText);
    if (ids.length === 0) {
      notify('No valid mod IDs found.', 'warn');
      return;
    }
    const skipped = inputText.split(/[\s,;]+/).filter((s) => s.trim() && !/^\d{5,12}$/.test(s.trim())).length;
    setLoading(true);
    setLoadingMsg('Fetching mod details from Steam…');
    try {
      const steamData = await fetchSteamModDetails(ids);
      setLoadingMsg('Reading local mod folders…');
      let folderInfos: Awaited<ReturnType<typeof desktopApi.getModFolderInfos>> = {};
      const activeDir = modsDir || defaultModsDir;
      if (isTauri && activeDir) {
        folderInfos = await desktopApi.getModFolderInfos(activeDir, ids);
      }
      const newMods: Mod[] = ids.map((id, index) => {
        const steam = steamData[id];
        const folder = folderInfos[id];
        return {
          order: index + 1,
          modId: id,
          ...steam,
          name: steam?.name || `Mod ${id}`,
          type: steam?.type || 'Unknown',
          lastUpdated: steam?.lastUpdated ?? null,
          folderSize: folder?.size ?? null,
          lastDownloaded: folder?.lastDownloaded ?? null,
          localPath: folder?.path ?? null,
        };
      });
      setMods(newMods);
      if (skipped > 0) notify(`Loaded ${newMods.length} mods. ${skipped} invalid entries ignored.`, 'warn');
      else notify(`Loaded ${newMods.length} mods.`, 'success');
    } catch {
      notify('Failed to fetch mod data. Check your connection.', 'error');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [inputText, modsDir, defaultModsDir]);

  const handleRefresh = useCallback(async () => {
    if (mods.length === 0) return;
    const ids = mods.map((m) => m.modId);
    setLoading(true);
    setLoadingMsg('Refreshing mod data…');
    try {
      const steamData = await fetchSteamModDetails(ids);
      let folderInfos: Awaited<ReturnType<typeof desktopApi.getModFolderInfos>> = {};
      const activeDir = modsDir || defaultModsDir;
      if (isTauri && activeDir) {
        folderInfos = await desktopApi.getModFolderInfos(activeDir, ids);
      }
      setMods((prev) =>
        prev.map((m) => {
          const steam = steamData[m.modId];
          const folder = folderInfos[m.modId];
          return {
            ...m,
            ...steam,
            name: steam?.name || m.name,
            type: steam?.type || m.type,
            lastUpdated: steam?.lastUpdated ?? m.lastUpdated,
            folderSize: folder?.size ?? m.folderSize,
            lastDownloaded: folder?.lastDownloaded ?? m.lastDownloaded,
            localPath: folder?.path ?? m.localPath,
          };
        }),
      );
      notify('Mod list refreshed.', 'success');
    } catch {
      notify('Refresh failed.', 'error');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [mods, modsDir, defaultModsDir]);

  const handleAddMod = useCallback(() => setShowAddModal(true), []);

  const handleAddModConfirm = useCallback(
    async (id: string) => {
      setShowAddModal(false);
      if (!id || !/^\d{5,12}$/.test(id)) {
        if (id) notify('Invalid mod ID.', 'warn');
        return;
      }
      if (mods.some((m) => m.modId === id)) {
        notify('Mod already in list.', 'warn');
        return;
      }
      setLoading(true);
      setLoadingMsg('Fetching mod info…');
      try {
        const steamData = await fetchSteamModDetails([id]);
        const steam = steamData[id];
        let folderInfo = null;
        const activeDir = modsDir || defaultModsDir;
        if (isTauri && activeDir) {
          const fi = await desktopApi.getModFolderInfos(activeDir, [id]);
          folderInfo = fi[id];
        }
        const newMod: Mod = {
          order: mods.length + 1,
          modId: id,
          ...steam,
          name: steam?.name || `Mod ${id}`,
          type: steam?.type || 'Unknown',
          lastUpdated: steam?.lastUpdated ?? null,
          folderSize: folderInfo?.size ?? null,
          lastDownloaded: folderInfo?.lastDownloaded ?? null,
          localPath: folderInfo?.path ?? null,
        };
        setMods((prev) => [...prev, newMod].map((m, i) => ({ ...m, order: i + 1 })));
        setInputText((prev) => {
          const existing = parseModIds(prev);
          if (existing.includes(id)) return prev;
          return prev.trim() ? `${prev.trim()},${id}` : id;
        });
        notify(`Added: ${newMod.name}`, 'success');
      } catch {
        notify('Failed to fetch mod info.', 'error');
      } finally {
        setLoading(false);
        setLoadingMsg('');
      }
    },
    [mods, modsDir, defaultModsDir],
  );

  const handleImport = useCallback(async () => {
    if (!isTauri) {
      notify('Import is only available in the desktop app.', 'warn');
      return;
    }
    const content = await desktopApi.importModList();
    if (!content) return;
    setInputText(content);
    notify('Mod list imported. Press Search to load.', 'info');
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!isTauri) {
      notify('Only available in desktop app.', 'warn');
      return;
    }
    const dir = modsDir || defaultModsDir;
    if (dir) {
      const result = await desktopApi.openFolder(dir);
      if (!result.ok) notify('Failed to open folder.', 'error');
    } else {
      notify('No mods folder path found.', 'warn');
    }
  }, [modsDir, defaultModsDir]);

  const handleBrowseModsDir = useCallback(async () => {
    if (!isTauri) return;
    const dir = await desktopApi.browseModsDir(defaultModsDir || undefined);
    if (dir) {
      persistModsDir(dir);
      notify('Mods folder saved.', 'success');
    }
  }, [persistModsDir, defaultModsDir]);

  const moveUp = useCallback((index: number) => {
    setMods((prev) => {
      if (index === 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((m, i) => ({ ...m, order: i + 1 }));
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setMods((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((m, i) => ({ ...m, order: i + 1 }));
    });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    dragIndex.current = index;
    setDraggingIndex(index);
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    const from = dragIndex.current;
    const to = dragOverIndex;
    if (from !== null && to !== null && from !== to) {
      setMods((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next.map((m, i) => ({ ...m, order: i + 1 }));
      });
    }
    dragIndex.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  }, [dragOverIndex]);

  const removeMod = useCallback((modId: string) => {
    setMods((prev) => {
      const updated = prev.filter((m) => m.modId !== modId).map((m, i) => ({ ...m, order: i + 1 }));
      setInputText(updated.map((m) => m.modId).join(','));
      return updated;
    });
  }, []);

  const handleCopyOutput = () => {
    const str = mods.map((m) => m.modId).join(',');
    navigator.clipboard.writeText(str);
    notify('Mod ID list copied to clipboard!', 'success');
    setInputText(str);
  };

  const filteredMods = useMemo(() => {
    if (!filter.trim()) return mods;
    const q = filter.toLowerCase();
    return mods.filter((m) => m.modId.includes(q) || (m.name && m.name.toLowerCase().includes(q)));
  }, [mods, filter]);

  const displayDir = modsDir || defaultModsDir;

  return (
    <div className="app">
      {showAddModal && <AddModModal onConfirm={handleAddModConfirm} onCancel={() => setShowAddModal(false)} />}
      <div className="titlebar">
        <span className="titlebar-logo">⬡</span>
        <span className="titlebar-title">Ark Mod Manager</span>
        {isTauri && (
          <span className={`titlebar-path ${!modsDir ? 'titlebar-path-default' : ''}`} title={displayDir}>
            {displayDir ? (modsDir ? displayDir : `${displayDir} (default)`) : 'No mods folder set'}
          </span>
        )}
      </div>

      {notification && <div className={`toast toast-${notification.type}`}>{notification.msg}</div>}

      <div className="input-section">
        <div className="input-row">
          <textarea
            className="mod-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste mod IDs here: 123456,789012,345678 …"
            rows={2}
            spellCheck={false}
          />
          <button className="search-btn" onClick={handleSearch} disabled={loading}>
            {loading ? <span className="spinner" /> : '⌕ Search'}
          </button>
        </div>
        {loadingMsg && <div className="loading-msg">{loadingMsg}</div>}
      </div>

      {mods.length > 0 && (
        <div className="table-section">
          <div className="toolbar">
            <div className="toolbar-left">
              <ToolbarBtn onClick={handleAddMod} disabled={loading} title="Add a mod">
                + Add Mod
              </ToolbarBtn>
              <ToolbarBtn onClick={handleRefresh} disabled={loading} title="Refresh all mod info">
                ↻ Refresh
              </ToolbarBtn>
              <ToolbarBtn onClick={handleImport} disabled={loading} title="Import mod list from file">
                ↑ Import
              </ToolbarBtn>
              <ToolbarBtn onClick={handleOpenFolder} title="Open mods folder">
                ⊡ Open Folder
              </ToolbarBtn>
              {isTauri && (
                <ToolbarBtn onClick={handleBrowseModsDir} title="Set mods folder path" variant="subtle">
                  ⋯ Set Path
                </ToolbarBtn>
              )}
              <ToolbarBtn onClick={handleCopyOutput} title="Copy ordered mod IDs" variant="accent">
                ⎘ Copy Output
              </ToolbarBtn>
            </div>
            <div className="mod-count">
              <span className="count-number">{mods.length}</span>
              <span className="count-label">mods</span>
              {filter && filteredMods.length !== mods.length && (
                <span className="count-filtered">({filteredMods.length} shown)</span>
              )}
            </div>
          </div>

          <div className="filter-bar">
            <span className="filter-icon">⌕</span>
            <input
              className="filter-input"
              type="text"
              placeholder="Filter by mod ID or name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="filter-clear" onClick={() => setFilter('')}>
                ✕
              </button>
            )}
          </div>

          <div className="size-legend">
            <span className="legend-label">Folder size:</span>
            <span className="legend-item size-green">● &lt;100 MB</span>
            <span className="legend-item size-yellow">● 100–300 MB</span>
            <span className="legend-item size-orange">● 300–700 MB</span>
            <span className="legend-item size-red">● &gt;700 MB</span>
          </div>

          <div className="table-wrapper">
            <table className="mod-table">
              <thead>
                <tr>
                  <th className="col-drag"></th>
                  <th className="col-order">#</th>
                  <th className="col-id">Mod ID</th>
                  <th className="col-name">Name</th>
                  <th className="col-type">Type</th>
                  <th className="col-downloaded">Downloaded</th>
                  <th className="col-updated">Updated (Author)</th>
                  <th className="col-size">Folder Size</th>
                  <th className="col-actions">Order</th>
                  <th className="col-remove"></th>
                </tr>
              </thead>
              <tbody>
                {filteredMods.map((mod) => {
                  const realIndex = mods.findIndex((m) => m.modId === mod.modId);
                  return (
                    <ModRow
                      key={mod.modId}
                      mod={mod}
                      index={realIndex}
                      totalMods={mods.length}
                      onMoveUp={moveUp}
                      onMoveDown={moveDown}
                      onRemove={removeMod}
                      onDragStart={handleDragStart}
                      onDragEnter={handleDragEnter}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingIndex === realIndex}
                      isDragOver={dragOverIndex === realIndex}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mods.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <p>Paste mod IDs above and press Search to load your mod list.</p>
          {isTauri && !modsDir && (
            <p className="empty-hint">
              <button className="link-btn" onClick={handleBrowseModsDir}>
                Set your mods folder
              </button>{' '}
              to see folder sizes and download dates.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
