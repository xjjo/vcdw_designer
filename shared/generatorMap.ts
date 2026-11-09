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
  CurrencyConversion,
  Dimension,
  DimensionLookup,
  Enumeration,
  Fact,
  GeoEnrichment,
  JoinCondition,
  JoinDef,
  LookupDef,
  NetChangeSource,
  ValidationRule,
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
  role?: 'key' | 'attribute' | 'measure' | 'date_key' | 'audit' | 'calculated' | 'constant';
  formula?: string;
  constant_value?: string;
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

interface GeneratorSourceTable {
  name: string;
  alias: string;
  role: 'netchange' | 'support';
  columns: string[];
}

interface GeneratorJoin {
  name: string;
  left_table: string;
  left_alias: string;
  right_table: string;
  right_alias: string;
  join_type: string;
  on: JoinCondition[];
}

interface GeneratorDimensionLink {
  dimension: string;
  dim_table: string;
  source_id_column: string;
  target_sk_column: string;
  default_fallback_sk: number;
  mandatory: boolean;
  active_condition: string;
  role_alias: string;
}

interface GeneratorGeo {
  type: string;
  target_geo_sk: string;
  country_col: string;
  state_col: string;
  city_col: string;
}

interface GeneratorCurrency {
  source_amount_col: string;
  source_currency_col: string;
  target_base_amount_col: string;
  base_currency: string;
}

interface GeneratorValidation {
  rule_name: string;
  condition: string;
  error_code: string;
  error_message: string;
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

function roleOf(c: Column): NonNullable<GeneratorField['role']> {
  if (c.mappingKind === 'calculated' || c.isCalculated) return 'calculated';
  if (c.mappingKind === 'constant') return 'constant';
  if (c.auditRole) return 'audit';
  if (c.isMeasure) return 'measure';
  if (c.isDateKey) return 'date_key';
  if (c.isPk || c.isSk || c.isNaturalKey) return 'key';
  return 'attribute';
}

/**
 * All generator fields: direct source renames plus derived (calculated/constant)
 * and role-annotated columns. Audit columns are excluded (controller ruling:
 * audit columns are handled downstream, as before).
 */
export function mapAllFields(cols: Column[]): GeneratorField[] {
  return cols
    .filter((c) => !c.autoIncrement)
    .map((c) => ({ c, role: roleOf(c) }))
    .filter((x) => x.role !== 'audit') // controller ruling: audit handled downstream
    .filter((x) => x.role === 'calculated' || x.role === 'constant' || !!x.c.sourceColumn)
    .map(({ c, role }) => {
      const source = c.sourceColumn ?? c.name.toLowerCase();
      const renamed = source.toUpperCase() !== c.name.toUpperCase();
      const derived = role === 'calculated' || role === 'constant';
      const base: GeneratorField = {
        coalesce: c.coalesce ?? false,
        name: derived ? c.name.toLowerCase() : source,
        new_name: derived ? c.name : renamed ? c.name : '',
        data_type: c.type,
        alias: c.sourceTable ?? '',
        role,
      };
      if (role === 'calculated' && c.formula) base.formula = c.formula;
      if (role === 'constant') base.constant_value = c.constantValue ?? '';
      return base;
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

/** All declared source tables (net-change and support) with their join columns. */
export function mapSourceTables(sources: NetChangeSource[] = []): GeneratorSourceTable[] {
  return sources.map((s) => ({
    name: s.ncTable,
    alias: s.alias ?? s.ncTable,
    role: s.role ?? 'netchange',
    columns: (s.columns ?? []).map((c) => c.name),
  }));
}

/** Generic joins between declared source tables (snake_case + explicit ON clause). */
export function mapJoins(joins: JoinDef[] = []): GeneratorJoin[] {
  return joins.map((j) => ({
    name: j.name ?? '',
    left_table: j.leftTable,
    left_alias: j.leftAlias ?? j.leftTable,
    right_table: j.rightTable,
    right_alias: j.rightAlias ?? j.rightTable,
    join_type: j.joinType,
    on: (j.onConditions ?? []).map((c) => ({ left: c.left, op: c.op, right: c.right })),
  }));
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

/** Fact → dimension surrogate-key links (active-row guard + fallback SK). */
export function mapDimensionLinks(links: DimensionLookup[] = []): GeneratorDimensionLink[] {
  return links.map((dl) => ({
    dimension: dl.dimensionId,
    dim_table: dl.dimensionTable,
    source_id_column: dl.sourceIdColumn,
    target_sk_column: dl.targetSkColumn,
    default_fallback_sk: dl.defaultFallbackSk,
    mandatory: dl.isMandatory,
    active_condition: dl.activeCondition ?? 'DELETED = 0',
    role_alias: dl.roleAlias ?? '',
  }));
}

/** Geo-enrichment lookups (country/state/city → geo surrogate key). */
export function mapGeo(geos: GeoEnrichment[] = []): GeneratorGeo[] {
  return geos.map((g) => ({
    type: g.type,
    target_geo_sk: g.targetGeoSk,
    country_col: g.sourceCountryCol,
    state_col: g.sourceStateCol,
    city_col: g.sourceCityCol,
  }));
}

/** Currency conversions (source amount/currency → base amount). */
export function mapCurrency(convs: CurrencyConversion[] = []): GeneratorCurrency[] {
  return convs.map((c) => ({
    source_amount_col: c.sourceAmountCol,
    source_currency_col: c.sourceCurrencyCol,
    target_base_amount_col: c.targetBaseAmountCol,
    base_currency: c.baseCurrency,
  }));
}

/** Record-level validation rules emitted to the generator contract. */
export function mapValidations(rules: ValidationRule[] = []): GeneratorValidation[] {
  return rules.map((v) => ({
    rule_name: v.ruleName,
    condition: v.condition,
    error_code: v.errorCode,
    error_message: v.errorMessage,
  }));
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
    name: c.sourceColumn ?? c.name.toLowerCase(),
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
  // Mirror configInserts/packet: when no net-change sources are declared, fall
  // back to the dimension's `sourceNcTables` so generator.json netchange[] is
  // never empty for a simple dimension.
  const declaredNc = netChangeSources(d.netChange);
  const ncSources = declaredNc.length
    ? declaredNc
    : (d.sourceNcTables ?? []).map(
        (nc) => ({ id: nc, ncTable: nc, oltpTable: nc.replace(/_nc$/, '') } as NetChangeSource),
      );
  return {
    type: 'dimension',
    name: d.name,
    dim_table: d.name,
    stg_table: d.requiresStaging ? d.stgTable ?? `${d.name}_stg` : '',
    stg_error_table: d.requiresStaging ? d.stgErrorTable ?? `${d.name}_stg_error` : '',
    sub_job_name: `${d.name}_sync`,
    surrogate_key: sk,
    natural_key: nk,
    dimension_type: d.dimensionType ?? 'simple',
    has_unknown_row: d.hasDefaultUnknownRow ?? false,
    nk_updates: d.nkUpdates ?? false,
    default_row: d.defaultRow ?? {},
    lookups: (d.lookups ?? []).map(mapLookup),
    fields: mapFields(d.columns),
    source_tables: mapSourceTables(d.netChange),
    joins: mapJoins(d.joins),
    netchange: ncSources.map(mapNetChange),
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
    fields: mapAllFields(f.columns),
    source_tables: mapSourceTables(f.netChange),
    joins: mapJoins(f.joins),
    dimension_links: mapDimensionLinks(f.dimensionLookups),
    geo: mapGeo(f.geoEnrichment),
    currency: mapCurrency(f.currencyConversions),
    validations: mapValidations(f.validationRules),
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
    reconciles: (f.reconciles ?? []).map((r) => ({ nc_table: r.ncTable, ktr_file_name: r.ktrFileName })),
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
