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
import type { Dimension, Enumeration } from './types';

/** The three net-change bookkeeping tables, loaded identically per OLTP source. */
const REQUIRE_NC_TABLES = ['require_nc', 'initial_load_require_nc', 'incremental_load_require_nc'] as const;
/** Epoch sentinel so the first run performs a full extract. */
const LAST_EXTRACTED = '1970-01-01 00:00:00';

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

/** Resolved OLTP source feeding a dimension's net-change load. */
interface OltpSource {
  oltp: string;
  dwTable: string;
}

/**
 * Dimensions register (mapping + enabler) plus, per net-change OLTP source, an
 * `dw_oltp_tables_mapping` row and a require_nc row in each of the three
 * net-change bookkeeping tables. When no net-change sources are declared, fall
 * back to a single synthetic source derived from the first `sourceNcTables` entry.
 */
export function dimensionControlInserts(d: Dimension): string {
  const lines: string[] = [
    insertRow('dw_table_and_dimension_mapping', { DIMENSION_NAME: d.name, DW_TABLE_NAME: d.name }),
    insertRow('dw_dimension_enabler_config', { DIMENSION_NAME: d.name, IS_ENABLE: 1 }),
  ];

  const ncs = (d.netChange ?? []).filter((s) => (s.role ?? 'netchange') !== 'support');
  let sources: OltpSource[];
  if (ncs.length > 0) {
    sources = ncs.map((nc) => {
      const oltp = nc.oltpTable ?? nc.ncTable.replace(/_nc$/, '');
      return { oltp, dwTable: nc.dwOltpCopyTable ?? `dw_${oltp}` };
    });
  } else {
    const first = d.sourceNcTables?.[0];
    const oltp = first ? first.replace(/_nc$/, '') : undefined;
    sources = oltp ? [{ oltp, dwTable: `dw_${oltp}` }] : [];
  }

  for (const s of sources) {
    lines.push(insertRow('dw_oltp_tables_mapping', { OLTP_TABLE: s.oltp, DW_TABLE: s.dwTable }));
  }
  for (const s of sources) {
    for (const table of REQUIRE_NC_TABLES) {
      lines.push(insertRow(table, { DIM_OR_FACT_TABLE: d.name, OLTP_TABLE: s.oltp, last_extracted: LAST_EXTRACTED }));
    }
  }
  return lines.join('\n');
}
