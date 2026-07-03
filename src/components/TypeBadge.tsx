import type { CSSProperties } from 'react';
import type { ModType } from '../types';

const TYPE_COLORS: Record<ModType, string> = {
  'Total Conversion': '#e67e3f',
  Map: '#4e9edd',
  Structures: '#7b6cf6',
  Creatures: '#4caf7d',
  Gameplay: '#d4a847',
  'Stack Mod': '#e05b7f',
  Utility: '#5bbdb5',
  Graphics: '#b06cf4',
  Mod: '#7a8a9a',
  Unknown: '#4a5568',
};

interface BadgeStyle extends CSSProperties {
  '--badge-color'?: string;
}

export function TypeBadge({ type }: { type: ModType }) {
  const color = TYPE_COLORS[type] || TYPE_COLORS.Mod;
  const style: BadgeStyle = { '--badge-color': color };
  return (
    <span className="type-badge" style={style}>
      {type}
    </span>
  );
}
