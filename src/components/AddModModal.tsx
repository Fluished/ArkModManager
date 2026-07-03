import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface AddModModalProps {
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function AddModModal({ onConfirm, onCancel }: AddModModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onConfirm(value.trim());
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add Mod</div>
        <p className="modal-desc">Enter a Steam Workshop mod ID:</p>
        <input
          ref={inputRef}
          className="modal-input"
          type="text"
          placeholder="e.g. 731604991"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="modal-btn confirm" onClick={() => onConfirm(value.trim())}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
