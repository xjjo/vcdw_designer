import type { AnyEntity, EntityKind } from '@shared/types';

export const KIND_META: Record<EntityKind, { label: string; badge: string; color: string; icon: string }> = {
  enumeration: { label: 'Enumeration', badge: 'enum', color: '#8b5cf6', icon: '#' },
  dimension: { label: 'Dimension', badge: 'dim', color: '#3b82f6', icon: '◆' },
  fact: { label: 'Fact', badge: 'fact', color: '#10b981', icon: '⚡' },
};

export function entityKindOf(e: AnyEntity): EntityKind {
  return e.kind;
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a client-side file download. */
export function downloadFile(filename: string, content: string, mime = 'text/plain'): void {
  triggerDownload(filename, new Blob([content], { type: mime }));
}

/** Trigger a client-side download of binary content (e.g. a .zip). */
export function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  triggerDownload(filename, new Blob([new Uint8Array(bytes)], { type: mime }));
}
