import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { fetchSteamModDetails, parseModIds, formatFileSize, formatDate } from './utils/steam';
import './App.css';

const isElectron = typeof window !== 'undefined' && window.electronAPI;

function getFolderSizeColor(bytes) {
  if (bytes == null) return null;
  const MB = 1024 * 1024;
  if (bytes < 100 * MB) return 'size-green';
  if (bytes < 300 * MB) return 'size-yellow';
  if (bytes < 700 * MB) return 'size-orange';
  return 'size-red';
}

function ToolbarBtn({ onClick, disabled, title, children, variant = 'default' }) {
  return (
    <button className={`toolbar-btn ${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

const TYPE_COLORS = {
  'Total Conversion': '#e67e3f', 
  'Map': '#4e9edd', 
  'Structures': '#7b6cf6',
  'Creatures': '#4caf7d', 
  'Gameplay': '#d4a847', 
  'Stack Mod': '#e05b7f',
  'Utility': '#5bbdb5', 
  'Graphics': '#b06cf4', 
  'Mod': '#7a8a9a', 
  'Unknown': '#4a5568',
};

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || TYPE_COLORS['Mod'];
  return <span className="type-badge" style={{ '--badge-color': color }}>{type}</span>;
}

function AddModModal({ onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onConfirm(value.trim());
    if (e.key === 'Escape') onCancel();
  };
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Add Mod</div>
        <p className="modal-desc">Enter a Steam Workshop mod ID:</p>
        <input ref={inputRef} className="modal-input" type="text" placeholder="e.g. 731604991"
          value={value} onChange={e => setValue(e.target.value)} onKeyDown={handleKeyDown} />
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-btn confirm" onClick={() => onConfirm(value.trim())}>Add</button>
        </div>
      </div>
    </div>
  );
}

function ModRow({ mod, index, totalMods, onMoveUp, onMoveDown, onRemove,
  onDragStart, onDragEnter, onDragEnd, isDragging, isDragOver }) {
  return (
    <tr
      key={mod.modId}
      className={[
        mod.error ? 'row-error' : '',
        isDragging ? 'row-dragging' : '',
        isDragOver ? 'row-drag-over' : '',
      ].filter(Boolean).join(' ')}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
    >
      <td className="col-drag"><span className="drag-handle" title="Drag to reorder">⠿</span></td>
      <td className="col-order"><span className="order-num">{mod.order}</span></td>
      <td className="col-id">
        <a className="mod-id-link" href={mod.steamUrl} target="_blank" rel="noreferrer" title="View on Steam Workshop">
          {mod.modId}
        </a>
      </td>
      <td className="col-name"><span className="mod-name" title={mod.name}>{mod.name}</span></td>
      <td className="col-type"><TypeBadge type={mod.type} /></td>
      <td className="col-downloaded"><span className="date-val">{formatDate(mod.lastDownloaded)}</span></td>
      <td className="col-updated"><span className="date-val">{formatDate(mod.lastUpdated)}</span></td>
      <td className="col-size">
        <span className={`size-val ${getFolderSizeColor(mod.folderSize) || ''}`}>
          {mod.folderSize != null ? formatFileSize(mod.folderSize) : '—'}
        </span>
      </td>
      <td className="col-actions">
        <div className="order-btns">
          <button className="order-btn" onClick={() => onMoveUp(index)} disabled={index === 0} title="Move up">▲</button>
          <button className="order-btn" onClick={() => onMoveDown(index)} disabled={index === totalMods - 1} title="Move down">▼</button>
        </div>
      </td>
      <td className="col-remove">
        <button className="remove-btn" onClick={() => onRemove(mod.modId)} title="Remove mod">✕</button>
      </td>
    </tr>
  );
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [filter, setFilter] = useState('');
  const [modsDir, setModsDir] = useState('');
  const [defaultModsDir, setDefaultModsDir] = useState('');
  const [notification, setNotification] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.getDefaultModsPath().then(p => setDefaultModsDir(p || ''));
    window.electronAPI.getSettings().then(settings => {
      if (settings?.modsDir) setModsDir(settings.modsDir);
    });
  }, []);

  const notify = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const persistModsDir = useCallback((dir) => {
    setModsDir(dir);
    if (isElectron) window.electronAPI.saveSettings({ modsDir: dir });
  }, []);

  const handleSearch = useCallback(async () => {
    const ids = parseModIds(inputText);
    if (ids.length === 0) { notify('No valid mod IDs found.', 'warn'); return; }
    const skipped = inputText.split(/[\s,;]+/).filter(s => s.trim() && !/^\d{5,12}$/.test(s.trim())).length;
    setLoading(true);
    setLoadingMsg('Fetching mod details from Steam…');
    try {
      const steamData = await fetchSteamModDetails(ids);
      setLoadingMsg('Reading local mod folders…');
      let folderInfos = {};
      const activeDir = modsDir || defaultModsDir;
      if (isElectron && activeDir) {
        folderInfos = await window.electronAPI.getModFolderInfos({ modsDir: activeDir, modIds: ids });
      }
      const newMods = ids.map((id, index) => ({
        order: index + 1, modId: id,
        ...steamData[id],
        name: steamData[id]?.name || `Mod ${id}`,
        type: steamData[id]?.type || 'Unknown',
        folderSize: folderInfos[id]?.size ?? null,
        lastDownloaded: folderInfos[id]?.lastDownloaded ?? null,
        localPath: folderInfos[id]?.path ?? null,
      }));
      setMods(newMods);
      if (skipped > 0) notify(`Loaded ${newMods.length} mods. ${skipped} invalid entries ignored.`, 'warn');
      else notify(`Loaded ${newMods.length} mods.`, 'success');
    } catch {
      notify('Failed to fetch mod data. Check your connection.', 'error');
    } finally { setLoading(false); setLoadingMsg(''); }
  }, [inputText, modsDir, defaultModsDir]);

  const handleRefresh = useCallback(async () => {
    if (mods.length === 0) return;
    const ids = mods.map(m => m.modId);
    setLoading(true); setLoadingMsg('Refreshing mod data…');
    try {
      const steamData = await fetchSteamModDetails(ids);
      let folderInfos = {};
      const activeDir = modsDir || defaultModsDir;
      if (isElectron && activeDir) {
        folderInfos = await window.electronAPI.getModFolderInfos({ modsDir: activeDir, modIds: ids });
      }
      setMods(prev => prev.map(m => ({
        ...m, ...steamData[m.modId],
        name: steamData[m.modId]?.name || m.name,
        type: steamData[m.modId]?.type || m.type,
        folderSize: folderInfos[m.modId]?.size ?? m.folderSize,
        lastDownloaded: folderInfos[m.modId]?.lastDownloaded ?? m.lastDownloaded,
        localPath: folderInfos[m.modId]?.path ?? m.localPath,
      })));
      notify('Mod list refreshed.', 'success');
    } catch { notify('Refresh failed.', 'error'); }
    finally { setLoading(false); setLoadingMsg(''); }
  }, [mods, modsDir, defaultModsDir]);

  const handleAddMod = useCallback(() => setShowAddModal(true), []);

  const handleAddModConfirm = useCallback(async (id) => {
    setShowAddModal(false);
    if (!id || !/^\d{5,12}$/.test(id)) { if (id) notify('Invalid mod ID.', 'warn'); return; }
    if (mods.some(m => m.modId === id)) { notify('Mod already in list.', 'warn'); return; }
    setLoading(true); setLoadingMsg('Fetching mod info…');
    try {
      const steamData = await fetchSteamModDetails([id]);
      let folderInfo = null;
      const activeDir = modsDir || defaultModsDir;
      if (isElectron && activeDir) {
        const fi = await window.electronAPI.getModFolderInfos({ modsDir: activeDir, modIds: [id] });
        folderInfo = fi[id];
      }
      const newMod = {
        order: mods.length + 1, modId: id,
        ...steamData[id],
        name: steamData[id]?.name || `Mod ${id}`,
        type: steamData[id]?.type || 'Unknown',
        folderSize: folderInfo?.size ?? null,
        lastDownloaded: folderInfo?.lastDownloaded ?? null,
        localPath: folderInfo?.path ?? null,
      };
      setMods(prev => [...prev, newMod].map((m, i) => ({ ...m, order: i + 1 })));
      setInputText(prev => {
        const existing = parseModIds(prev);
        if (existing.includes(id)) return prev;
        return prev.trim() ? `${prev.trim()},${id}` : id;
      });
      notify(`Added: ${newMod.name}`, 'success');
    } catch { notify('Failed to fetch mod info.', 'error'); }
    finally { setLoading(false); setLoadingMsg(''); }
  }, [mods, modsDir, defaultModsDir]);

  const handleImport = useCallback(async () => {
    if (!isElectron) { notify('Import is only available in the desktop app.', 'warn'); return; }
    const content = await window.electronAPI.importModList();
    if (!content) return;
    setInputText(content);
    notify('Mod list imported. Press Search to load.', 'info');
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!isElectron) { notify('Only available in desktop app.', 'warn'); return; }
    const dir = modsDir || defaultModsDir;
    if (dir) { window.electronAPI.openFolder(dir); }
    else { notify('No mods folder path found.', 'warn'); }
  }, [modsDir, defaultModsDir]);

  const handleBrowseModsDir = useCallback(async () => {
    if (!isElectron) return;
    const dir = await window.electronAPI.browseModsDir();
    if (dir) { persistModsDir(dir); notify('Mods folder saved.', 'success'); }
  }, [persistModsDir]);

  const moveUp = useCallback((index) => {
    setMods(prev => {
      if (index === 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((m, i) => ({ ...m, order: i + 1 }));
    });
  }, []);

  const moveDown = useCallback((index) => {
    setMods(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((m, i) => ({ ...m, order: i + 1 }));
    });
  }, []);

  const handleDragStart = useCallback((index) => {
    dragIndex.current = index;
    setDraggingIndex(index);
  }, []);

  const handleDragEnter = useCallback((index) => {
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    const from = dragIndex.current;
    const to = dragOverIndex;
    if (from !== null && to !== null && from !== to) {
      setMods(prev => {
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

  const removeMod = useCallback((modId) => {
    setMods(prev => {
      const updated = prev.filter(m => m.modId !== modId).map((m, i) => ({ ...m, order: i + 1 }));
      setInputText(updated.map(m => m.modId).join(','));
      return updated;
    });
  }, []);

  const handleCopyOutput = () => {
    const str = mods.map(m => m.modId).join(',');
    navigator.clipboard.writeText(str);
    notify('Mod ID list copied to clipboard!', 'success');
    setInputText(str);
  };

  const filteredMods = useMemo(() => {
    if (!filter.trim()) return mods;
    const q = filter.toLowerCase();
    return mods.filter(m => m.modId.includes(q) || (m.name && m.name.toLowerCase().includes(q)));
  }, [mods, filter]);

  const displayDir = modsDir || defaultModsDir;

  return (
    <div className="app">
      {showAddModal && (
        <AddModModal onConfirm={handleAddModConfirm} onCancel={() => setShowAddModal(false)} />
      )}
      <div className="titlebar">
        <span className="titlebar-logo">⬡</span>
        <span className="titlebar-title">Ark Mod Manager</span>
        {isElectron && (
          <span
            className={`titlebar-path ${!modsDir ? 'titlebar-path-default' : ''}`}
            title={displayDir}
          >
            {displayDir
              ? (modsDir ? displayDir : `${displayDir} (default)`)
              : 'No mods folder set'}
          </span>
        )}
      </div>

      {notification && (
        <div className={`toast toast-${notification.type}`}>{notification.msg}</div>
      )}

      <div className="input-section">
        <div className="input-row">
          <textarea className="mod-input" value={inputText} onChange={e => setInputText(e.target.value)}
            placeholder="Paste mod IDs here: 123456,789012,345678 …" rows={2} spellCheck={false} />
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
              <ToolbarBtn onClick={handleAddMod} disabled={loading} title="Add a mod">+ Add Mod</ToolbarBtn>
              <ToolbarBtn onClick={handleRefresh} disabled={loading} title="Refresh all mod info">↻ Refresh</ToolbarBtn>
              <ToolbarBtn onClick={handleImport} disabled={loading} title="Import mod list from file">↑ Import</ToolbarBtn>
              <ToolbarBtn onClick={handleOpenFolder} title="Open mods folder">⊡ Open Folder</ToolbarBtn>
              {isElectron && (
                <ToolbarBtn onClick={handleBrowseModsDir} title="Set mods folder path" variant="subtle">⋯ Set Path</ToolbarBtn>
              )}
              <ToolbarBtn onClick={handleCopyOutput} title="Copy ordered mod IDs" variant="accent">⎘ Copy Output</ToolbarBtn>
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
            <input className="filter-input" type="text" placeholder="Filter by mod ID or name…"
              value={filter} onChange={e => setFilter(e.target.value)} />
            {filter && <button className="filter-clear" onClick={() => setFilter('')}>✕</button>}
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
                  const realIndex = mods.findIndex(m => m.modId === mod.modId);
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
          {isElectron && !modsDir && (
            <p className="empty-hint">
              <button className="link-btn" onClick={handleBrowseModsDir}>Set your mods folder</button>
              {' '}to see folder sizes and download dates.
            </p>
          )}
        </div>
      )}
    </div>
  );
}