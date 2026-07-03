import { formatDate, formatFileSize } from '../utils/steam';
import type { Mod } from '../types';
import { TypeBadge } from './TypeBadge';

function getFolderSizeColor(bytes: number | null): string | null {
  if (bytes == null) return null;
  const MB = 1024 * 1024;
  if (bytes < 100 * MB) return 'size-green';
  if (bytes < 300 * MB) return 'size-yellow';
  if (bytes < 700 * MB) return 'size-orange';
  return 'size-red';
}

interface ModRowProps {
  mod: Mod;
  index: number;
  totalMods: number;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (modId: string) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}

export function ModRow({
  mod,
  index,
  totalMods,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
  isDragOver,
}: ModRowProps) {
  return (
    <tr
      className={[mod.error ? 'row-error' : '', isDragging ? 'row-dragging' : '', isDragOver ? 'row-drag-over' : '']
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      <td className="col-drag">
        <span className="drag-handle" title="Drag to reorder">
          ⠿
        </span>
      </td>
      <td className="col-order">
        <span className="order-num">{mod.order}</span>
      </td>
      <td className="col-id">
        <a className="mod-id-link" href={mod.steamUrl} target="_blank" rel="noreferrer" title="View on Steam Workshop">
          {mod.modId}
        </a>
      </td>
      <td className="col-name">
        <span className="mod-name" title={mod.name}>
          {mod.name}
        </span>
      </td>
      <td className="col-type">
        <TypeBadge type={mod.type} />
      </td>
      <td className="col-downloaded">
        <span className="date-val">{formatDate(mod.lastDownloaded)}</span>
      </td>
      <td className="col-updated">
        <span className="date-val">{formatDate(mod.lastUpdated)}</span>
      </td>
      <td className="col-size">
        <span className={`size-val ${getFolderSizeColor(mod.folderSize) || ''}`}>
          {mod.folderSize != null ? formatFileSize(mod.folderSize) : '—'}
        </span>
      </td>
      <td className="col-actions">
        <div className="order-btns">
          <button className="order-btn" onClick={() => onMoveUp(index)} disabled={index === 0} title="Move up">
            ▲
          </button>
          <button
            className="order-btn"
            onClick={() => onMoveDown(index)}
            disabled={index === totalMods - 1}
            title="Move down"
          >
            ▼
          </button>
        </div>
      </td>
      <td className="col-remove">
        <button className="remove-btn" onClick={() => onRemove(mod.modId)} title="Remove mod">
          ✕
        </button>
      </td>
    </tr>
  );
}
