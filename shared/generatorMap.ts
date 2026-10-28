/**
 * Mapping layer: DesignModel entities -> vcdw-etl-builder generator JSON.
 *
 * The generator (org.one.etl.util.JsonToVoParser) expects a narrower, per-entity
 * document keyed by `type`. This module derives that document from the richer
 * design model. It is the forward-compatibility bridge referenced in the design:
 * the UI edits the rich model, this produces the generator-ready contract.
 *
 * Contract reference (from JsonToVoParser):
 *  - fact:      { type, fact_name, fact_table, stg_table, stg_error_table, sub_job_name,
 *                 lookups[], fields[], netchange[], reconciles[] }
 *  - dimension: { type, name, dim_table, stg_table, stg_error_table, sub_job_name,
 *                 surrogate_key, natural_key, lookups[], fields[], netchange[] }
 *  - enumeration:{ type, name, table, enum_type, field_key, field_name,
 *                 fields[], netchange[], lookups[] }
 *  Lookup fields are comma-separated strings (streamKeyField, returnValue*, ...).
 */
import type {
  AnyEntity,
  Column,
  Dimension,
  Enumeration,
  Fact,
  LookupDef,
  NetChangeSource,
} from './types';

interface GeneratorLookup {
  table_name: string;
  cache: boolean;
  table_field_key: string;
  key_condition: string;
  stream_Key_field1: string;
  stream_Key_field2: string;
  return_value_field: string;
  return_value_new_name: string;
  return_value_default: string;
  return_value_default_type: string;
}

interface GeneratorField {
  coalesce: boolean;
  name: string;
  new_name: string;
  data_type: string;
  alias: string;
}

interface GeneratorNetChange {
  is_primary: boolean;
  oltp_table: string;
  oltp_table_sys_id: string;
  oltp_table_lmd: string;
  nc_table: string;
  dw_oltp_copy_table: string;
  condition: string;
}

function csv(values: (string | undefined)[]): string {
  return values.map((v) => v ?? '').join(',');
}

function mapLookup(l: LookupDef): GeneratorLookup {
  const returns = l.returnFields ?? [];
  return {
    table_name: l.tableName,
    cache: l.cache ?? true,
    table_field_key: csv(l.tableKeyFields),
    key_condition: csv((l.keyConditions?.length ? l.keyConditions : l.tableKeyFields.map(() => '='))),
    stream_Key_field1: csv(l.streamKeyFields),
    stream_Key_field2: csv(l.streamKeyFields.map(() => '')),
    return_value_field: csv(returns.map((r) => r.field)),
    return_value_new_name: csv(returns.map((r) => r.newName ?? '')),
    return_value_default: csv(returns.map((r) => r.default ?? '-1')),
    return_value_default_type: csv(returns.map((r) => String(r.defaultType ?? 5))),
  };
}

/** True when a column is a 1:1 rename of a source (NC) column (a generator `field`). */
function isDirectField(c: Column): boolean {
  if (c.mappingKind) return c.mappingKind === 'direct';
  return !c.autoIncrement && !c.auditRole && !c.isCalculated && !!c.sourceColumn;
}

/** Direct-mapped columns become source fields (rename + optional coalesce + table alias). */
function mapFields(cols: Column[]): GeneratorField[] {
  return cols.filter(isDirectField).map((c) => {
    const source = c.sourceColumn ?? c.name.toLowerCase();
    const renamed = source.toUpperCase() !== c.name.toUpperCase();
    return {
      coalesce: c.coalesce ?? false,
      name: source,
      new_name: renamed ? c.name : '',
      data_type: c.type,
      alias: c.sourceTable ?? '',
    };
  });
}

function mapNetChange(nc: NetChangeSource): GeneratorNetChange {
  return {
    is_primary: nc.isPrimary ?? false,
    oltp_table: nc.oltpTable ?? nc.ncTable.replace(/_nc$/, ''),
    oltp_table_sys_id: nc.oltpTableSysId ?? '',
    oltp_table_lmd: nc.oltpTableLmd ?? 'last_modified_date',
    nc_table: nc.ncTable,
    dw_oltp_copy_table: nc.dwOltpCopyTable ?? '',
    condition: nc.condition ?? '',
  };
}

/** Only net-change sources become generator netchange records; support tables are join-only. */
function netChangeSources(sources: NetChangeSource[] = []): NetChangeSource[] {
  return sources.filter((s) => (s.role ?? 'netchange') !== 'support');
}

/** Derive generator lookups from a fact's dimension lookups + generic lookups. */
function factLookups(f: Fact): GeneratorLookup[] {
  const fromDims: GeneratorLookup[] = (f.dimensionLookups ?? []).map((dl) => ({
    table_name: dl.dimensionTable,
    cache: true,
    table_field_key: 'OLTP_ID',
    key_condition: '=',
    stream_Key_field1: dl.sourceIdColumn,
    stream_Key_field2: '',
    return_value_field: dl.targetSkColumn,
    return_value_new_name: dl.targetSkColumn,
    return_value_default: String(dl.defaultFallbackSk),
    return_value_default_type: '5',
  }));
  const generic = (f.lookups ?? []).map(mapLookup);
  return [...fromDims, ...generic];
}

interface GeneratorEnumField {
  name: string;
  new_name: string;
  data_type: string;
  coalesce: boolean;
}

interface GeneratorEnumLookup {
  strategy: string;
  table_name: string;
  cache: boolean;
  table_field_key: string;
  key_condition: string;
  stream_key_field: string;
  return_value_field: string;
  return_value_new_name: string;
}

/** Normalize a physical SQL type into the generator's coarse data-type vocabulary. */
function generatorDataType(sqlType: string): string {
  const t = (sqlType ?? '').toUpperCase();
  if (/(BIGINT|SMALLINT|TINYINT|INT)/.test(t)) return 'integer';
  if (/(DECIMAL|NUMERIC|DOUBLE|FLOAT)/.test(t)) return 'decimal';
  if (/(DATETIME|TIMESTAMP|DATE|TIME)/.test(t)) return 'timestamp';
  return 'string';
}

/** The NC SELECT columns: direct-mapped columns + the ent scope join key. */
function enumFields(e: Enumeration): GeneratorEnumField[] {
  const fields = e.columns.filter(isDirectField).map((c) => ({
    name: c.sourceColumn as string,
    new_name: c.name,
    data_type: generatorDataType(c.type),
    coalesce: c.coalesce ?? false,
  }));
  const entSource = e.entScopeSource ?? 'sys_ent_id';
  if (entSource && !fields.some((f) => f.name.toLowerCase() === entSource.toLowerCase())) {
    fields.push({ name: entSource, new_name: entSource.toUpperCase(), data_type: 'integer', coalesce: false });
  }
  return fields;
}

/** Map a design lookup into the enum lookup shape (single stream key, explicit strategy). */
function mapEnumLookup(l: LookupDef): GeneratorEnumLookup {
  const returns = l.returnFields ?? [];
  return {
    strategy: l.strategy ?? 'left_join',
    table_name: l.tableName,
    cache: l.cache ?? true,
    table_field_key: csv(l.tableKeyFields),
    key_condition: csv(l.keyConditions?.length ? l.keyConditions : l.tableKeyFields.map(() => '=')),
    stream_key_field: csv(l.streamKeyFields),
    return_value_field: csv(returns.map((r) => r.field)),
    return_value_new_name: csv(returns.map((r) => r.newName ?? '')),
  };
}

/** Custom enum lookups, or the standard enterprise-scope lookup when none are defined. */
function enumLookups(e: Enumeration): GeneratorEnumLookup[] {
  const defined = (e.lookups ?? []).map(mapEnumLookup);
  if (defined.length) return defined;
  return [
    {
      strategy: 'left_join',
      table_name: 'enterprise',
      cache: true,
      table_field_key: 'OLTP_ID',
      key_condition: '=',
      stream_key_field: e.entScopeSource ?? 'sys_ent_id',
      return_value_field: 'ENT_NAME',
      return_value_new_name: 'ENT_NAME',
    },
  ];
}

/** Derive the standard `enumeration_nc` net-change record from the design. */
function enumNetChange(e: Enumeration): GeneratorNetChange {
  const ncTable = e.sourceNcTable ?? 'enumeration_nc';
  const oltp = ncTable.replace(/_nc$/, '');
  return {
    is_primary: true,
    oltp_table: oltp,
    oltp_table_sys_id: 'SYS_ENUM_ID',
    oltp_table_lmd: 'es_lmd',
    nc_table: ncTable,
    dw_oltp_copy_table: `dw_${oltp}`,
    condition: `enum_type='${e.enumTypeFilter ?? e.name}'`,
  };
}

export function enumerationToGenerator(e: Enumeration) {
  const keyCol = e.columns.find((c) => c.isSk) ?? e.columns.find((c) => c.isPk) ?? e.columns[0];
  // field_name (the enum's natural key) is derived from the Columns + Mapping tabs.
  const nameCol =
    e.columns.find((c) => c.sourceColumn === 'enum_entry_name') ??
    e.columns.find((c) => c.name.toUpperCase().endsWith('_NAME')) ??
    e.columns.find((c) => c.isNaturalKey && !c.isSk && !c.isPk);
  const ncSources = netChangeSources(e.netChange);
  const netchange = ncSources.length ? ncSources.map(mapNetChange) : [enumNetChange(e)];
  return {
    type: 'enumeration',
    name: e.name,
    table: e.enumTable ?? e.name,
    enum_type: e.enumTypeFilter ?? e.name,
    field_key: e.fieldKey ?? keyCol?.name ?? `${e.name.toUpperCase()}_KEY`,
    field_name: e.fieldName ?? nameCol?.name ?? `${e.name.toUpperCase()}_NAME`,
    fields: enumFields(e),
    netchange,
    lookups: enumLookups(e),
  };
}

export function dimensionToGenerator(d: Dimension) {
  const sk = d.surrogateKey ?? d.columns.find((c) => c.isSk)?.name ?? `${d.name.toUpperCase()}_KEY`;
  const nk = d.naturalKey ?? d.columns.find((c) => c.isNaturalKey)?.name ?? 'OLTP_ID';
  return {
    type: 'dimension',
    name: d.name,
    dim_table: d.name,
    stg_table: d.requiresStaging ? d.stgTable ?? `${d.name}_stg` : '',
    stg_error_table: d.requiresStaging ? d.stgErrorTable ?? `${d.name}_stg_error` : '',
    sub_job_name: `${d.name}_sync`,
    surrogate_key: sk,
    natural_key: nk,
    lookups: (d.lookups ?? []).map(mapLookup),
    fields: mapFields(d.columns),
    netchange: netChangeSources(d.netChange).map(mapNetChange),
  };
}

export function factToGenerator(f: Fact) {
  return {
    type: 'fact',
    fact_name: f.name.replace(/^dw_/, '').replace(/_fact$/, ''),
    fact_table: f.name,
    stg_table: f.stagingTable ?? `${f.name.replace(/^dw_/, '')}_stg`,
    stg_error_table: f.errorTable ?? `${f.name.replace(/^dw_/, '')}_stg_error`,
    sub_job_name: `${f.name.replace(/^dw_/, '')}_sync`,
    lookups: factLookups(f),
    fields: mapFields(f.columns),
    netchange: [
      ...(f.primaryNcTable
        ? [
            mapNetChange({
              id: 'primary',
              isPrimary: true,
              oltpTable: f.primaryNcTable.replace(/_nc$/, ''),
              ncTable: f.primaryNcTable,
            }),
          ]
        : []),
      ...(f.secondaryNcTables ?? []).map((t, i) =>
        mapNetChange({ id: `sec_${i}`, isPrimary: false, oltpTable: t.replace(/_nc$/, ''), ncTable: t }),
      ),
      ...netChangeSources(f.netChange).map(mapNetChange),
    ],
    reconciles: [],
  };
}

export function entityToGenerator(e: AnyEntity) {
  switch (e.kind) {
    case 'enumeration':
      return enumerationToGenerator(e);
    case 'dimension':
      return dimensionToGenerator(e);
    case 'fact':
      return factToGenerator(e);
    default:
      return null;
  }
}
