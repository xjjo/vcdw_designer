import type { AnyEntity } from './types';

/** Facts drop the `dw_` prefix for their derived names (asset_fact_stg, ASSET_FACT_KEY). */
function baseName(kind: AnyEntity['kind'], name: string): string {
  return kind === 'fact' ? name.replace(/^dw_/, '') : name;
}

/**
 * Rename an entity and every name-derived value that still follows the OLD name
 * (key/name columns, surrogate key, staging/error tables, shard/sort keys,
 * default-row keys). Custom values that do not follow the old name are kept.
 * Source tables (net-change / OLTP) and the ENUM_TYPE filter never change.
 * Safe to call on every keystroke. Does not mutate the input.
 */
export function renameEntity(e: AnyEntity, newName: string): AnyEntity {
  if (e.name === newName) return e;
  const oldBase = baseName(e.kind, e.name);
  const newBase = baseName(e.kind, newName);
  const suffixes = e.kind === 'enumeration' ? ['_KEY', '_NAME'] : ['_KEY'];
  const colMap = new Map<string, string>(
    suffixes.map((s) => [`${oldBase.toUpperCase()}${s}`, `${newBase.toUpperCase()}${s}`]),
  );
  const col = (n: string): string => colMap.get(n) ?? n;
  const table = (t: string, suffix: string): string => (t === `${oldBase}${suffix}` ? `${newBase}${suffix}` : t);

  const next: AnyEntity = { ...e, name: newName, columns: e.columns.map((c) => ({ ...c, name: col(c.name) })) };
  if (e.shardKey !== undefined) next.shardKey = col(e.shardKey);
  if (e.sortKeys !== undefined) next.sortKeys = e.sortKeys.map(col);
  if (next.kind === 'dimension') {
    if (next.surrogateKey !== undefined) next.surrogateKey = col(next.surrogateKey);
    if (next.naturalKey !== undefined) next.naturalKey = col(next.naturalKey);
    if (next.stgTable !== undefined) next.stgTable = table(next.stgTable, '_stg');
    if (next.stgErrorTable !== undefined) next.stgErrorTable = table(next.stgErrorTable, '_stg_error');
    if (next.defaultRow !== undefined) {
      next.defaultRow = Object.fromEntries(Object.entries(next.defaultRow).map(([k, v]) => [col(k), v]));
    }
  }
  if (next.kind === 'fact') {
    if (next.stagingTable !== undefined) next.stagingTable = table(next.stagingTable, '_stg');
    if (next.errorTable !== undefined) next.errorTable = table(next.errorTable, '_stg_error');
  }
  return next;
}
