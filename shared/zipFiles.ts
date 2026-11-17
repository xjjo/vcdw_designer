import { zipSync, strToU8 } from 'fflate';
import type { PacketFile } from './packet';

/** Bundle generated files into a .zip, keeping each file's relative folder path. */
export function buildZip(files: PacketFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/').replace(/^\/+/, '');
    entries[path] = strToU8(f.content);
  }
  return zipSync(entries, { level: 6 });
}
