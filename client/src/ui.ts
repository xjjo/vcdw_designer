import type { AnyEntity, EntityKind } from '@shared/types';

export const KIND_META: Record<EntityKind, { label: string; badge: string; color: string; icon: string }> = {
  enumeration: { label: 'Enumeration', badge: 'enum', color: '#8b5cf6', icon: '#' },
  dimension: { label: 'Dimension', badge: 'dim', color: '#3b82f6', icon: '◆' },
  fact: { label: 'Fact', badge: 'fact', color: '#10b981', icon: '⚡' },
};

export function entityKindOf(e: AnyEntity): EntityKind {
  return e.kind;
}

/** Trigger a client-side file download. */
export function downloadFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
