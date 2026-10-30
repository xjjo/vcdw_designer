/**
 * Control-table INSERT generators for the deployment packet.
 *
 * Every INSERT's column list is driven from the authoritative `CONTROL_TABLES`
 * signatures (shared/contract/controlTables.ts) — never hardcoded here — and the
 * VALUES reproduce the real populate_*.sql conventions, verified against the
 * DataWarehouse memsql DDL (…/vcdw/ddl/memsql/populate_*.sql):
 *   - Logical names and physical table names are emitted UPPERCASE
 *     (e.g. `('SHIPMENT_FACT','DW_SHIPMENT_HEADER')`).
 *   - Mapping and net-change rows are emitted ONE ROW PER SOURCE table.
 *   - Net-change bookkeeping (`require_nc` &c.) carries a NULL `last_extracted`
 *     so the first run performs a full extract.
 * Scope is limited to the well-defined control tables; the value-mapped tables
 * (validation_policy_config, error_map) are deferred.
 */
import type { ControlTable } from './contract/controlTables';
import { CONTROL_TABLES } from './contract/controlTables';
import type { Dimension, Enumeration, Fact, NetChangeSource } from './types';

/** The three net-change bookkeeping tables, loaded identically per OLTP source. */
const REQUIRE_NC_TABLES = ['require_nc', 'initial_load_require_nc', 'incremental_load_require_nc'] as const;

/** Real populate_*.sql emit every logical/physical name in upper case. */
const U = (s: string): string => String(s).toUpperCase();

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

/** A net-change OLTP source resolved to its physical OLTP + DW copy table names. */
interface ResolvedSource {
  /** Physical OLTP table name (lower case). */
  oltp: string;
  /** Physical DW copy table name (lower case). */
  dwCopy: string;
}

/** Minimal shape needed to resolve a source — satisfied by `NetChangeSource` or a bare `_nc` name. */
interface NcSourceLike {
  ncTable: string;
  oltpTable?: string;
  dwOltpCopyTable?: string;
}

/**
 * Resolve an NC source to its physical OLTP + DW copy names exactly as the real
 * populate_*.sql derive them: the OLTP table defaults to the `_nc` mirror name
 * minus the suffix, and the DW copy table defaults to `dw_<oltp>`.
 */
function resolveSource(nc: NcSourceLike): ResolvedSource {
  const oltp = nc.oltpTable ?? nc.ncTable.replace(/_nc$/, '');
  const dwCopy = nc.dwOltpCopyTable ?? `dw_${oltp}`;
  return { oltp, dwCopy };
}

/** Non-support net-change sources of an entity, resolved to physical names. */
function netChangeSources(sources: NetChangeSource[] | undefined): ResolvedSource[] {
  return (sources ?? [])
    .filter((s) => (s.role ?? 'netchange') !== 'support')
    .map(resolveSource);
}

/**
 * Enumerations register as a dimension-shaped reference table (mapping + enabler)
 * but take NO require_nc rows — they share the common `enumeration_nc` source.
 * One mapping row is emitted per net-change source; the standard `enumeration_nc`
 * source resolves to `dw_enumeration` → `('LOAD_TYPE','DW_ENUMERATION')`.
 */
export function enumControlInserts(e: Enumeration): string {
  const name = U(e.enumTable ?? e.name);
  let sources = netChangeSources(e.netChange);
  if (sources.length === 0) {
    sources = [resolveSource({ ncTable: e.sourceNcTable ?? `${e.name}_nc` })];
  }

  const lines = sources.map((s) =>
    insertRow('dw_table_and_dimension_mapping', { DIMENSION_NAME: name, DW_TABLE_NAME: U(s.dwCopy) }),
  );
  lines.push(insertRow('dw_dimension_enabler_config', { DIMENSION_NAME: name, IS_ENABLE: 1 }));
  return lines.join('\n');
}

/**
 * Dimensions register (mapping + enabler) plus, per net-change OLTP source, a
 * `dw_oltp_tables_mapping` row and a require_nc row in each of the three
 * net-change bookkeeping tables. One mapping row is emitted per source
 * (`('SITE','DW_SITE')`, `('SITE','DW_SITE_ADDR')`). When no net-change sources
 * are declared, fall back to the declared `sourceNcTables`.
 */
export function dimensionControlInserts(d: Dimension): string {
  const name = U(d.name);
  let sources = netChangeSources(d.netChange);
  if (sources.length === 0) {
    sources = (d.sourceNcTables ?? []).map((nc) => resolveSource({ ncTable: nc }));
  }

  const lines: string[] = sources.map((s) =>
    insertRow('dw_table_and_dimension_mapping', { DIMENSION_NAME: name, DW_TABLE_NAME: U(s.dwCopy) }),
  );
  lines.push(insertRow('dw_dimension_enabler_config', { DIMENSION_NAME: name, IS_ENABLE: 1 }));

  for (const s of sources) {
    lines.push(insertRow('dw_oltp_tables_mapping', { OLTP_TABLE: U(s.oltp), DW_TABLE: U(s.dwCopy) }));
  }
  for (const s of sources) {
    for (const table of REQUIRE_NC_TABLES) {
      lines.push(insertRow(table, { DIM_OR_FACT_TABLE: name, OLTP_TABLE: U(s.oltp), last_extracted: null }));
    }
  }
  return lines.join('\n');
}

/**
 * Facts register (enabler + a per-source table mapping + a job_task_mapping
 * scheduler row) plus a require_nc row in each of the three net-change
 * bookkeeping tables per NC source. The NC source list is primaryNcTable +
 * secondaryNcTables + any net-change sources on the fact (support sources
 * excluded); each resolves to a DW copy table emitted as a `dw_table_and_fact_mapping`
 * row (`('SHIPMENT_FACT','DW_SHIPMENT_HEADER')`).
 *
 * `job_task_mapping_id` is an explicit auto-increment int in the real
 * populate_job_task_mapping.sql, so we emit NULL and flag it with a trailing
 * `-- set job_task_mapping_id` comment for the deployer to assign. The
 * `fact_name` column is UPPERCASE, while the `job_path` keeps the observed
 * lowercase `/<subject_area>/wrapper_for_<fact>_sync.kjb` shape.
 */
export function factControlInserts(f: Fact): string {
  const factName = f.name.replace(/^dw_/, '');
  const name = U(factName);
  const subjectArea = `${(f.domain ?? 'logistics').trim().toLowerCase().replace(/\s+/g, '_')}_fact`;
  const jobPath = `/${subjectArea}/wrapper_for_${factName}_sync.kjb`;

  const ncLike: NcSourceLike[] = [];
  if (f.primaryNcTable) ncLike.push({ ncTable: f.primaryNcTable });
  for (const t of f.secondaryNcTables ?? []) ncLike.push({ ncTable: t });
  for (const s of f.netChange ?? []) {
    if ((s.role ?? 'netchange') !== 'support') {
      ncLike.push({ ncTable: s.ncTable, oltpTable: s.oltpTable, dwOltpCopyTable: s.dwOltpCopyTable });
    }
  }
  const sources = ncLike.map(resolveSource);

  const lines: string[] = [insertRow('dw_fact_enabler_config', { FACT_NAME: name, IS_ENABLE: 1 })];
  for (const s of sources) {
    lines.push(insertRow('dw_table_and_fact_mapping', { FACT_NAME: name, DW_TABLE_NAME: U(s.dwCopy) }));
  }
  lines.push(
    `${insertRow('job_task_mapping', {
      job_task_mapping_id: null,
      priority: f.etlConfig?.priority ?? 2,
      fact_name: name,
      resource_cost: f.etlConfig?.resourceCost ?? 2,
      job_path: jobPath,
    })} -- set job_task_mapping_id`,
  );

  for (const s of sources) {
    for (const table of REQUIRE_NC_TABLES) {
      lines.push(insertRow(table, { DIM_OR_FACT_TABLE: name, OLTP_TABLE: U(s.oltp), last_extracted: null }));
    }
  }
  return lines.join('\n');
}
