/**
 * Kettle files the vcdw-etl-builder must produce for a generator document. The server compares
 * them with what the Java generator actually wrote, so a silent generator failure is reported
 * instead of returning a partial result as "ok".
 */
export function expectedEtlFiles(doc: Record<string, any>): string[] {
  switch (doc?.type) {
    case 'dimension': {
      const t = doc.dim_table;
      const files = [`${t}_sync.kjb`, `${t}_sync.ktr`];
      if (doc.load_strategy !== 'upsert_by_key') files.push(`update_${t}.ktr`);
      if (doc.has_unknown_row !== false) files.push(`${t}_insert_default_row.ktr`);
      if (doc.nk_updates === true) files.push(`${t}_handle_nk_updates.ktr`);
      return files;
    }
    case 'enumeration':
      return [`${doc.table}_sync.kjb`, `${doc.table}_sync.ktr`, `${doc.table}_insert_default_row.ktr`];
    case 'fact':
      return [
        `${doc.fact_table}_sync.kjb`,
        `load_${doc.stg_table}.ktr`,
        `sync_${doc.fact_table}_and_error.ktr`,
        `sync_${doc.fact_table}_with_new_records.ktr`,
      ];
    default:
      return [];
  }
}

/** Expected file names that are not among the produced paths (compared by file name). */
export function missingEtlFiles(doc: Record<string, any>, producedPaths: string[]): string[] {
  const produced = new Set(producedPaths.map((p) => p.split('/').pop()));
  return expectedEtlFiles(doc).filter((name) => !produced.has(name));
}
