/**
 * Control-table INSERT generators for the deployment packet.
 *
 * Every INSERT's column list is driven from the authoritative `CONTROL_TABLES`
 * signatures (shared/contract/controlTables.ts) — never hardcoded here — so the
 * generated rows reproduce the real populate_*.sql shape (Constraint 10 — no
 * fabrication). Scope is limited to the well-defined control tables; the
 * value-mapped tables (validation_policy_config, error_map) are deferred.
 */
import type { ControlTable } from './contract/controlTables';
import { CONTROL_TABLES } from './contract/controlTables';
import type { Enumeration } from './types';

function ct(table: string): ControlTable {
  const t = CONTROL_TABLES.find((c) => c.table === table);
  if (!t) throw new Error(`unknown control table ${table}`);
  return t;
}

function sqlVal(v: string | number | null): string {
  if (v === null) return 'NULL';
  return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
}

/** Build one INSERT using the authoritative column order; `values` maps colName->value. */
function insertRow(table: string, values: Record<string, string | number | null>): string {
  const t = ct(table);
  const cols = t.columns;
  const vals = cols.map((c) => sqlVal(c in values ? values[c] : null));
  return `INSERT INTO ${t.table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
}

/**
 * Enumerations register as a dimension-shaped reference table (mapping + enabler)
 * but take NO require_nc rows — they share the common `enumeration_nc` source.
 */
export function enumControlInserts(e: Enumeration): string {
  const name = e.enumTable ?? e.name;
  return [
    insertRow('dw_table_and_dimension_mapping', { DIMENSION_NAME: name, DW_TABLE_NAME: name }),
    insertRow('dw_dimension_enabler_config', { DIMENSION_NAME: name, IS_ENABLE: 1 }),
  ].join('\n');
}
