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
 *  - enumeration:{ type, enum_type, name, field_key, field_name }
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

/** Non-audit, non-auto-increment columns become source fields. */
function mapFields(cols: Column[]): GeneratorField[] {
  return cols
    .filter((c) => !c.autoIncrement)
    .map((c) => ({
      coalesce: false,
      name: c.sourceColumn ?? c.name.toLowerCase(),
      new_name: c.name,
      data_type: c.type,
      alias: '',
    }));
}

function mapNetChange(nc: NetChangeSource): GeneratorNetChange {
  return {
    is_primary: nc.isPrimary ?? false,
    oltp_table: nc.oltpTable,
    oltp_table_sys_id: nc.oltpTableSysId ?? '',
    oltp_table_lmd: nc.oltpTableLmd ?? 'last_modified_date',
    nc_table: nc.ncTable,
    dw_oltp_copy_table: nc.dwOltpCopyTable ?? '',
    condition: nc.condition ?? '',
  };
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

export function enumerationToGenerator(e: Enumeration) {
  const keyCol = e.columns.find((c) => c.isSk) ?? e.columns[0];
  const nameCol =
    e.columns.find((c) => c.name.toUpperCase() === 'ENUM_ENTRY_NAME') ??
    e.columns.find((c) => c.isNaturalKey);
  return {
    type: 'enumeration',
    enum_type: e.enumTypeFilter ?? e.name,
    name: e.name,
    field_key: keyCol?.name ?? `${e.name.toUpperCase()}_KEY`,
    field_name: nameCol?.name ?? 'ENUM_ENTRY_NAME',
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
    netchange: (d.netChange ?? []).map(mapNetChange),
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
      ...(f.netChange ?? []).map(mapNetChange),
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
