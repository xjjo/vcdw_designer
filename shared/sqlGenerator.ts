/**
 * Deterministic SQL generation from a DesignModel: CREATE TABLE (DDL) plus
 * sample-data INSERTs. Dialect-aware for MemSQL/MariaDB/MySQL.
 *
 * The goal is to give an ETL developer a runnable starting script, not a
 * production migration — so it favors clarity and safe defaults.
 */
import type {
  AnyEntity,
  Column,
  DesignModel,
  Dimension,
  Enumeration,
  Fact,
  JoinDef,
  LookupDef,
  MappingKind,
  NetChangeSource,
  SqlDialect,
} from './types';

function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '') + '`';
}

function columnDdl(c: Column): string {
  const parts = [quoteIdent(c.name), c.type];
  if (c.autoIncrement) parts.push('AUTO_INCREMENT');
  parts.push(c.nullable === false ? 'NOT NULL' : 'NULL');
  if (c.default != null && c.default !== '') parts.push(`DEFAULT ${c.default}`);
  if (c.comment) parts.push(`COMMENT ${sqlString(c.comment)}`);
  return parts.join(' ');
}

function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function tableName(e: AnyEntity): string {
  return e.name;
}

function tableConstraints(e: AnyEntity, dialect: SqlDialect): string[] {
  const lines: string[] = [];
  const pk = e.columns.filter((c) => c.isPk).map((c) => quoteIdent(c.name));
  if (pk.length) lines.push(`PRIMARY KEY (${pk.join(', ')})`);

  if (dialect === 'MemSQL') {
    if (e.shardKey) lines.push(`SHARD KEY (${quoteIdent(e.shardKey)})`);
    const sortKeys = e.sortKeys?.filter(Boolean) ?? [];
    if (sortKeys.length) lines.push(`SORT KEY (${sortKeys.map(quoteIdent).join(', ')})`);
  }
  return lines;
}

/** Generate a single CREATE TABLE statement for any entity. */
export function entityDdl(e: AnyEntity, dialect: SqlDialect): string {
  const isRefTable = e.kind === 'enumeration' && (e as Enumeration).isReferenceTable && dialect === 'MemSQL';
  const createKeyword = isRefTable ? 'CREATE REFERENCE TABLE' : 'CREATE TABLE';
  const body = [
    ...e.columns.map((c) => '  ' + columnDdl(c)),
    ...tableConstraints(e, dialect).map((l) => '  ' + l),
  ].join(',\n');
  return `${createKeyword} IF NOT EXISTS ${quoteIdent(tableName(e))} (\n${body}\n);`;
}

/** Staging + error DDL for facts (and dimensions that require staging). */
export function stagingDdl(e: AnyEntity, dialect: SqlDialect): string[] {
  const out: string[] = [];
  const cols = e.columns.filter((c) => !c.autoIncrement);
  const stgCols = [...cols, { id: 'err', name: 'ERROR', type: 'VARCHAR(512)', nullable: true } as Column];
  // Error (quarantine) tables carry extra bookkeeping columns the reconciler
  // uses to track resync/penalty/feedback attempts and the offending values.
  const quarantineCols: Column[] = [
    { id: 'stg_error_id', name: 'STG_ERROR_ID', type: 'BIGINT', autoIncrement: true },
    { id: 'error_resync_count', name: 'ERROR_RESYNC_COUNT', type: 'INT', default: '0' },
    { id: 'error_penalty_count', name: 'ERROR_PENALTY_COUNT', type: 'INT', default: '0' },
    { id: 'error_feedback_count', name: 'ERROR_FEEDBACK_COUNT', type: 'INT', default: '0' },
    { id: 'error_map_values', name: 'ERROR_MAP_VALUES', type: 'VARCHAR(4096)' },
  ];
  const buildStg = (tbl: string, isError = false) => {
    const tblCols = isError ? [...stgCols, ...quarantineCols] : stgCols;
    const body = tblCols.map((c) => '  ' + columnDdl(c)).join(',\n');
    return `CREATE TABLE IF NOT EXISTS ${quoteIdent(tbl)} (\n${body}\n);`;
  };
  if (e.kind === 'fact') {
    const f = e as Fact;
    if (f.stagingTable) out.push(buildStg(f.stagingTable));
    if (f.errorTable) out.push(buildStg(f.errorTable, true));
  } else if (e.kind === 'dimension') {
    const d = e as Dimension;
    if (d.requiresStaging && d.stgTable) out.push(buildStg(d.stgTable));
    if (d.requiresStaging && d.stgErrorTable) out.push(buildStg(d.stgErrorTable, true));
  }
  return out;
}

/**
 * CDC net-change (NC) mirror table DDL: the declared source columns plus the
 * standard control columns (`ES_LMD`, `DIM_OR_FACT_TABLE`, `RECONCILED`). On
 * MemSQL it is sharded on the OLTP sys-id column (or the first column).
 */
export function ncTableDdl(source: NetChangeSource, dialect: SqlDialect): string {
  const sourceCols: Column[] = (source.columns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type ?? 'VARCHAR(255)',
    comment: c.comment,
  }));
  const controlCols: Column[] = [
    { id: 'es_lmd', name: 'ES_LMD', type: 'DATETIME(6)' },
    { id: 'dim_or_fact_table', name: 'DIM_OR_FACT_TABLE', type: 'VARCHAR(128)' },
    { id: 'reconciled', name: 'RECONCILED', type: 'TINYINT(1)', default: '0' },
  ];
  const lines = [...sourceCols, ...controlCols].map((c) => '  ' + columnDdl(c));
  if (dialect === 'MemSQL') {
    const shardCol = source.oltpTableSysId?.trim() || source.columns?.[0]?.name;
    if (shardCol) lines.push('  ' + `SHARD KEY (${quoteIdent(shardCol)})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(source.ncTable)} (\n${lines.join(',\n')}\n);`;
}

function sampleValueFor(c: Column, rowIndex: number): string {
  const t = c.type.toUpperCase();
  if (c.autoIncrement) return 'DEFAULT';
  if (c.isSk && c.name.toUpperCase().includes('KEY')) return String(rowIndex + 1);
  if (/INT|BIGINT|TINYINT|SMALLINT/.test(t)) {
    if (c.name.toUpperCase() === 'DELETED') return '0';
    return String((rowIndex + 1) * 10);
  }
  if (/DECIMAL|DOUBLE|FLOAT|NUMERIC/.test(t)) return String((rowIndex + 1) * 100.5);
  if (/DATE|TIME/.test(t)) return 'CURRENT_TIMESTAMP';
  // string-ish
  const base = c.name.toLowerCase().replace(/_/g, ' ');
  return sqlString(`${base} ${rowIndex + 1}`);
}

/** Sample INSERTs including the mandatory unknown (-1) row for dimensions. */
export function sampleInserts(e: AnyEntity, rows = 3): string {
  const cols = e.columns;
  const insertCols = cols.map((c) => quoteIdent(c.name)).join(', ');
  const statements: string[] = [];

  const buildRow = (values: string[]) =>
    `INSERT INTO ${quoteIdent(tableName(e))} (${insertCols}) VALUES (${values.join(', ')});`;

  if (e.kind === 'dimension' && (e as Dimension).hasDefaultUnknownRow) {
    const values = cols.map((c) => {
      if (c.isSk) return '-1';
      if (/INT|DECIMAL|DOUBLE|FLOAT/.test(c.type.toUpperCase())) return c.name.toUpperCase() === 'DELETED' ? '0' : '-1';
      if (/DATE|TIME/.test(c.type.toUpperCase())) return 'CURRENT_TIMESTAMP';
      return sqlString('Unknown');
    });
    statements.push(buildRow(values));
  }

  for (let i = 0; i < rows; i++) {
    const values = cols.map((c) => sampleValueFor(c, i));
    statements.push(buildRow(values));
  }
  return statements.join('\n');
}

export interface GeneratedSql {
  ddl: string;
  staging: string;
  inserts: string;
  full: string;
}

/** Generate the complete SQL script for one entity. */
export function generateEntitySql(e: AnyEntity, dialect: SqlDialect, rows = 3): GeneratedSql {
  const ddl = entityDdl(e, dialect);
  const staging = stagingDdl(e, dialect).join('\n\n');
  const inserts = sampleInserts(e, rows);
  const sections = [
    `-- =====================================================`,
    `-- ${e.kind.toUpperCase()}: ${e.name}`,
    `-- =====================================================`,
    ddl,
    staging ? `\n-- staging / error tables\n${staging}` : '',
    `\n-- sample data\n${inserts}`,
  ].filter(Boolean);
  return { ddl, staging, inserts, full: sections.join('\n') };
}

/** Generate SQL for the whole model in dependency-friendly order. */
export function generateModelSql(model: DesignModel, rows = 3): string {  const dialect = model.project.targetDatabase;
  const order: AnyEntity[] = [...model.enumerations, ...model.dimensions, ...model.facts];
  const header = [
    `-- =====================================================`,
    `-- Generated by VCDW Designer`,
    `-- Project: ${model.project.name} v${model.project.version}`,
    `-- Target : ${dialect}`,
    `-- =====================================================\n`,
  ].join('\n');
  return header + order.map((e) => generateEntitySql(e, dialect, rows).full).join('\n\n\n');
}

// ---------------------------------------------------------------------------
// Source SELECT preview (Sources & Joins editor)
// ---------------------------------------------------------------------------

/** Minimal shape needed to render an illustrative source SELECT. */
export interface SelectPreviewInput {
  sources: NetChangeSource[];
  joins: JoinDef[];
  columns: Column[];
}

/** Mirror of the mapping editor's inference so the preview matches the Mapping tab. */
function effectiveMappingKind(c: Column): MappingKind {
  if (c.mappingKind) return c.mappingKind;
  if (c.auditRole) return 'audit';
  if (c.autoIncrement || c.isSk) return 'generated';
  if (c.isCalculated) return 'calculated';
  if (c.lookupId) return 'lookup';
  return 'direct';
}

function isNumericType(type = ''): boolean {
  return /(INT|DECIMAL|NUMERIC|DOUBLE|FLOAT)/.test(type.toUpperCase());
}

const aliasOf = (s: NetChangeSource): string => s.alias?.trim() || s.ncTable;

/** Build a live, illustrative SELECT from the declared sources, joins and column mapping. */
export function buildSourceSelectPreview({ sources, joins, columns }: SelectPreviewInput): string {
  const netchange = sources.filter((s) => (s.role ?? 'netchange') !== 'support');
  const from = netchange.find((s) => s.isPrimary) ?? netchange[0] ?? sources[0];
  if (!from || !from.ncTable.trim()) {
    return '-- Declare at least one source table (with a table name) to preview the SELECT.';
  }

  const selectLines: string[] = [];
  for (const c of columns) {
    const kind = effectiveMappingKind(c);
    // Audit / surrogate columns are DW-managed; lookups add a column to the
    // Pentaho *stream* (a separate Database Lookup step), never to the SELECT.
    if (kind === 'audit' || kind === 'generated' || kind === 'lookup') continue;
    if (kind === 'direct') {
      const a = c.sourceTable?.trim();
      const src = c.sourceColumn?.trim();
      if (a && src) {
        const ref = `${a}.${src}`;
        const expr = c.coalesce ? `COALESCE(${ref}, ${isNumericType(c.type) ? '-1' : "'No Value'"})` : ref;
        selectLines.push(`${expr} AS ${c.name}`);
      } else {
        selectLines.push(`NULL AS ${c.name} -- map a source column`);
      }
    } else if (kind === 'constant') {
      selectLines.push(`${c.constantValue ? `'${c.constantValue}'` : 'NULL'} AS ${c.name}`);
    } else if (kind === 'calculated') {
      selectLines.push(`${c.formula ? `(${c.formula})` : 'NULL'} AS ${c.name}`);
    } else if (kind === 'join') {
      // A join-mapped column is projected from the joined table, aliased to the
      // final mapped column name (e.g. `en.ENTERPRISE_NAME AS ENTERPRISE_NAME`).
      const join = joins.find((j) => j.id === c.joinId);
      const a = join?.rightAlias?.trim() || join?.rightTable?.trim();
      const field = c.joinField?.trim();
      if (a && field) {
        const ref = `${a}.${field}`;
        const expr = c.coalesce ? `COALESCE(${ref}, ${isNumericType(c.type) ? '-1' : "'No Value'"})` : ref;
        selectLines.push(`${expr} AS ${c.name}`);
      } else {
        selectLines.push(`NULL AS ${c.name} -- pick a join and its returned field in Mapping`);
      }
    }
  }
  if (!selectLines.length) selectLines.push(`${aliasOf(from)}.*`);

  const lines: string[] = ['SELECT'];
  lines.push(selectLines.map((l, i) => `  ${l}${i < selectLines.length - 1 ? ',' : ''}`).join('\n'));
  lines.push(`FROM ${from.ncTable} ${aliasOf(from)}`);

  for (const j of joins) {
    const rightRef = j.rightAlias?.trim() ? `${j.rightTable} ${j.rightAlias.trim()}` : j.rightTable || '/* table */';
    const cond = j.onConditions
      .filter((c) => c.left || c.right)
      .map((c) => `${c.left} ${c.op || '='} ${c.right}`)
      .join(' AND ');
    lines.push(`${j.joinType} JOIN ${rightRef} ON ${cond || '/* on ... */'}`);
  }

  return lines.join('\n');
}

/** Minimal shape needed to describe the Pentaho stream lookup steps. */
export interface StreamLookupInput {
  columns: Column[];
  lookups: LookupDef[];
}

/**
 * Describe the columns that lookup steps add to the *stream* (not the SELECT).
 * Each lookup-mapped column becomes a Pentaho "Database Lookup" step that reads
 * the current stream keys and appends its returned value as a new stream field.
 */
export function buildStreamLookupPreview({ columns, lookups }: StreamLookupInput): string {
  const lines: string[] = [];
  for (const c of columns) {
    if (effectiveMappingKind(c) !== 'lookup') continue;
    const lk = lookups.find((l) => l.id === c.lookupId);
    const table = lk?.tableName?.trim() || '/* lookup table */';
    const ret =
      c.lookupField?.trim() ||
      lk?.returnFields?.[0]?.newName ||
      lk?.returnFields?.[0]?.field ||
      c.name;
    const streamKeys = lk?.streamKeyFields ?? [];
    const tableKeys = lk?.tableKeyFields ?? [];
    const conds = lk?.keyConditions ?? [];
    const n = Math.max(streamKeys.length, tableKeys.length);
    const matches: string[] = [];
    for (let i = 0; i < n; i++) {
      const tk = (tableKeys[i] || '/* key */').trim();
      const sk = (streamKeys[i] || '/* stream field */').trim();
      const op = (conds[i] || '=').trim();
      matches.push(`${table}.${tk} ${op} stream.${sk}`);
    }
    const matchText = matches.length ? matches.join(' AND ') : '/* no key condition */';
    lines.push(
      `Lookup to ${table}: match ${matchText}; return ${table}.${ret} and add it to the stream as "${c.name}"`,
    );
  }
  if (!lines.length) {
    return '-- No lookups: no columns are mapped via a lookup. Lookups add fields to the stream, not the SELECT.';
  }
  return lines.join('\n');
}

/** Minimal shape to render a SingleStore CREATE TABLE for a declared source table. */
export interface SourceDdlInput {
  name: string;
  columns?: { name: string; type?: string }[];
  storageType?: 'columnstore' | 'rowstore';
}

/** Build a SingleStore (MemSQL) CREATE TABLE statement for a source table. */
export function buildSourceTableDdl({ name, columns, storageType = 'columnstore' }: SourceDdlInput): string {
  const tableName = name.trim() || 'source_table';
  const cols = (columns ?? []).filter((c) => c.name.trim());
  const colLines = cols.length
    ? cols.map((c) => `  ${c.name.trim()} ${c.type?.trim() || 'VARCHAR(256)'}`)
    : ['  /* add columns in the Source Tables section */'];
  const isRowstore = storageType === 'rowstore';
  const header = isRowstore
    ? `-- SingleStore in-memory rowstore table\nCREATE ROWSTORE TABLE ${tableName} (`
    : `-- SingleStore columnstore table\nCREATE TABLE ${tableName} (`;
  const keyLine = isRowstore
    ? '  /* SHARD KEY (col) — pick a distribution column */'
    : '  /* SORT KEY (col), SHARD KEY (col) — pick columns for ordering/distribution */';
  return `${header}\n${[...colLines, keyLine].join(',\n')}\n);`;
}
