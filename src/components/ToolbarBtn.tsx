import type { ReactNode } from 'react';

interface ToolbarBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  variant?: 'default' | 'subtle' | 'accent';
}

export function ToolbarBtn({ onClick, disabled, title, children, variant = 'default' }: ToolbarBtnProps) {
  return (
    <button className={`toolbar-btn ${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
