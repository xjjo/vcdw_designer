import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Lightweight modal that asks the user for a single name/value. */
export default function NameModal({
  title,
  label = 'Name',
  initial = '',
  confirmLabel = 'Create',
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div className="field">
          <label>{label}</label>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="section-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn sm primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
