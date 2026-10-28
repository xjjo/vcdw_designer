import { useState, type ReactNode } from 'react';

interface Props {
  title: ReactNode;
  /** Short description shown next to the title while collapsed. */
  subtitle?: ReactNode;
  /** Whether the section starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
  /** Stable id — when set, the open/closed state persists across tab switches. */
  id?: string;
  /** Optional actions rendered on the right of the header (clicks don't toggle). */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

const STATE_PREFIX = 'vcdw-collapsible:';

function readOpen(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback;
  try {
    const raw = localStorage.getItem(STATE_PREFIX + id);
    return raw == null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function persistOpen(id: string | undefined, open: boolean): void {
  if (!id) return;
  try {
    localStorage.setItem(STATE_PREFIX + id, open ? '1' : '0');
  } catch {
    /* ignore quota errors */
  }
}

/** Generic collapsible panel. Header shows title + short description when closed. */
export default function Collapsible({
  title,
  subtitle,
  defaultOpen = false,
  id,
  right,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  function toggle() {
    setOpen((o) => {
      const next = !o;
      persistOpen(id, next);
      return next;
    });
  }
  return (
    <div className={`panel collapsible ${open ? 'open' : 'collapsed'} ${className ?? ''}`}>
      <div className="collapsible-head" onClick={toggle}>
        <span className="collapsible-caret">{open ? '▾' : '▸'}</span>
        <div className="collapsible-title-wrap">
          <div className="collapsible-title">{title}</div>
          {subtitle && <div className="collapsible-sub">{subtitle}</div>}
        </div>
        {right && (
          <div className="collapsible-actions" onClick={(e) => e.stopPropagation()}>
            {right}
          </div>
        )}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
