/**
 * Field-mapping CSV generators for the deployment packet.
 *
 * The ETL flow reads two mapping resources per net-change source:
 *   - `<nc>.csv`            — DB column -> stream (target) field, one row per
 *                             directly-mapped column of that source.
 *   - `enable_mapping.csv`  — marks each NC table as mapping-enabled (`Y`).
 */
import type { Column, NetChangeSource } from './types';

export interface CsvFile {
  fileName: string;
  content: string;
}

/** A column is a direct 1:1 field mapping when it renames a source column. */
function isDirectMapped(c: Column): boolean {
  return (c.mappingKind ?? 'direct') === 'direct' && !!c.sourceColumn;
}

/**
 * DB-field -> stream-field CSV for one net-change source. Emits one row per
 * directly-mapped column read from this source: columns whose `sourceTable`
 * matches `source.alias`, or — when the source has no alias — every direct
 * column that carries a `sourceColumn`.
 */
export function ncMappingCsv(source: NetChangeSource, cols: Column[]): CsvFile {
  const rows = cols.filter((c) => {
    if (!isDirectMapped(c)) return false;
    return source.alias ? c.sourceTable === source.alias : true;
  });
  const lines = ['DBFieldName,StreamFieldName', ...rows.map((c) => `${c.sourceColumn},${c.name}`)];
  return { fileName: `${source.ncTable}.csv`, content: lines.join('\n') };
}

/** One row per net-change source marking its NC table as mapping-enabled. */
export function enableMappingCsv(sources: NetChangeSource[]): CsvFile {
  const lines = ['DB_TABLE_NAME,IS_MAPPING_ENABLED', ...sources.map((s) => `${s.ncTable},Y`)];
  return { fileName: 'enable_mapping.csv', content: lines.join('\n') };
}
