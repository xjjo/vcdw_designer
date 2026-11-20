/**
 * VCDW Designer — shared design model.
 *
 * This is the single, framework-neutral source of truth for a data-warehouse
 * design. It is intentionally richer than the ETL code-generator contract:
 * the generator mapping (see generatorMap.ts) derives the narrower generator
 * JSON from this model, so the UI can stay expressive while remaining
 * forward-compatible with the vcdw-etl-builder.
 */

export type SqlDialect = 'MemSQL' | 'MariaDB' | 'MySQL';

export type EntityKind = 'enumeration' | 'dimension' | 'fact';

export type AggregationType = 'NONE' | 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';

/**
 * How a target column is produced in the ETL flow:
 *  - direct:     1:1 rename of a source (NC) column, optionally coalesced.
 *  - lookup:     value returned by a Database Lookup / join step (parent key or name).
 *  - audit:      DW-managed audit column (DELETED, DW_CREATED, ...).
 *  - generated:  surrogate key assigned by auto-increment.
 *  - constant:   a literal value.
 *  - calculated: a SQL expression evaluated in staging.
 */
export type MappingKind = 'direct' | 'lookup' | 'join' | 'audit' | 'generated' | 'constant' | 'calculated';

/** A single physical column plus every design-time flag we may need. */
export interface Column {
  id: string;
  name: string;
  /** SQL type, e.g. "BIGINT", "VARCHAR(64)", "DECIMAL(18,4)". */
  type: string;
  nullable?: boolean;
  default?: string;
  comment?: string;

  // --- key roles ---
  isPk?: boolean;
  isSk?: boolean;
  isNaturalKey?: boolean;
  isFk?: boolean;
  /** id of the dimension/enumeration this FK points at. */
  referencedEntityId?: string;
  autoIncrement?: boolean;

  // --- fact-oriented roles ---
  isMeasure?: boolean;
  aggregation?: AggregationType;
  isCalculated?: boolean;
  /** SQL expression evaluated in staging when isCalculated. */
  formula?: string;
  isDateKey?: boolean;

  // --- mapping to the OLTP / SLICE source ---
  /** How this column is fed in the ETL flow (defaults inferred when absent). */
  mappingKind?: MappingKind;
  /** Direct-mapped source column name (1:1 rename) in the origin/NC table. */
  sourceColumn?: string;
  /** Source table alias the direct column is read from (multi-source facts/dims). */
  sourceTable?: string;
  /** Coalesce the value in the ETL flow (text -> 'No Value', numeric -> -1/0). */
  coalesce?: boolean;
  /** Id of the lookup that yields this column when mappingKind = 'lookup'. */
  lookupId?: string;
  /** Which return field of the lookup feeds this column (lookups can return many). */
  lookupField?: string;
  /** Id of the join that yields this column when mappingKind = 'join'. */
  joinId?: string;
  /** Which field returned by the join feeds this column. */
  joinField?: string;
  /** Literal value when mappingKind = 'constant'. */
  constantValue?: string;
  /**
   * Stream-only column: read and used by the ETL flow (e.g. a lookup driver) but not a physical
   * column of the target table. Excluded from the table DDL and from the insert/update.
   */
  isTransient?: boolean;
  /** SQL literal used by coalesce() (e.g. `0`, `-1`, `'No Value'`); empty = default by type. */
  coalesceDefault?: string;

  // --- audit ---
  /** Non-empty when this column comes from an audit profile. */
  auditRole?: string;
}

/** A physical column of a source (OLTP/NC) table, used to drive field mapping. */
export interface SourceColumn {
  id: string;
  name: string;
  type?: string;
  comment?: string;
}

/** How a support table participates physically. */
export type SupportTableKind = 'nc' | 'dw' | 'other';

/**
 * A reusable VCDW support table (names starting with `dw_` or ending with `_nc`).
 * Stored in its own YAML library so it can be referenced by facts / dims / enums.
 */
export interface SupportTable {
  id: string;
  kind: 'support';
  name: string;
  displayName?: string;
  description?: string;
  /** 'nc' = net-change mirror, 'dw' = dw copy table, else 'other'. */
  tableKind?: SupportTableKind;
  /** Suggested alias when joined. */
  alias?: string;
  /** Where the definition came from. */
  origin?: 'db' | 'manual';
  columns: SourceColumn[];
}

/** Reusable, fully customizable set of audit columns applied to any entity. */
export interface AuditFieldProfile {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
}

/**
 * How a declared source table participates in the ETL flow:
 *  - netchange: drives change-data-capture (has an OLTP origin + _nc mirror).
 *  - support:   exists only to be joined in the source SELECT.
 */
export type SourceRole = 'netchange' | 'support';

/**
 * A source table feeding an entity. Every entry is a real table you can join;
 * `role` decides whether it also drives net-change (CDC), and `isPrimary`
 * marks the single primary net-change table.
 */
export interface NetChangeSource {
  id: string;
  /** Defaults to 'netchange' when absent (back-compat with older designs). */
  role?: SourceRole;
  isPrimary?: boolean;
  /** Physical table referenced in FROM / JOIN (the _nc mirror for net-change sources). */
  ncTable: string;
  /** Table alias used when mapping fields / writing joins (e.g. 'en', 'me'). */
  alias?: string;
  /** Declared physical columns of this source, used by the mapping/joins editors. */
  columns?: SourceColumn[];
  /** When true, emit a CREATE TABLE DDL for this source in the preview. */
  createDdl?: boolean;
  /** SingleStore storage layout used when `createDdl` is on. */
  storageType?: 'columnstore' | 'rowstore';
  // --- net-change origin metadata (only meaningful when role === 'netchange') ---
  oltpTable?: string;
  oltpTableSysId?: string;
  oltpTableLmd?: string;
  dwOltpCopyTable?: string;
  condition?: string;
  /**
   * Derived source (role 'support'): SQL emitted as `with <ncTable> as (<sql>)` before the read query, so joins can
   * reference `ncTable` like a table (e.g. item's `item_pgrp_level_assoc`). Empty = physical table.
   */
  sql?: string;
}

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export interface JoinCondition {
  left: string;
  op: string;
  right: string;
}

/** Generic, fully customizable join between two tables. */
export interface JoinDef {
  id: string;
  name?: string;
  leftTable: string;
  /** Alias for the left table (informational; the ON clause references aliases). */
  leftAlias?: string;
  rightTable: string;
  /** Alias for the right table, used in the generated JOIN clause and ON conditions. */
  rightAlias?: string;
  joinType: JoinType;
  onConditions: JoinCondition[];
}

export interface LookupReturnField {
  field: string;
  newName?: string;
  default?: string;
  /** Pentaho return-value default type code (0 = String). */
  defaultType?: number;
}

/** Join/lookup strategy understood by the generator (`lookup` = stream lookup step). */
export type LookupStrategy = 'lookup' | 'left_join' | 'inner_join';

/** Generic lookup (maps 1:1 onto the ETL generator lookup contract). */
export interface LookupDef {
  id: string;
  /** Human-readable step label (e.g. 'Lookup Invoicer Org'). */
  name?: string;
  /** Optional link to a dimension/enum entity for the diagram. */
  targetEntityId?: string;
  tableName: string;
  cache?: boolean;
  /** Resolution strategy; enums typically use `left_join` for enterprise scope. */
  strategy?: LookupStrategy;
  streamKeyFields: string[];
  tableKeyFields: string[];
  keyConditions?: string[];
  returnFields: LookupReturnField[];
  /** ORDER BY applied by the Database Lookup step when several rows match (empty = none). */
  orderBy?: string;
  /** Staged dimensions: flag the row (ERROR / ERROR_MAP_VALUES) when the driver is set and the lookup returns null. */
  errorOnMiss?: LookupErrorOnMiss;
}

export interface LookupErrorOnMiss {
  /** Code written to ERROR_MAP_VALUES (unique per entity). */
  code: number;
  /** Message appended to ERROR; default `<FIRST_RETURN> Lookup Failed`. */
  message?: string;
  /** Returned fields checked for null; default = every return field. */
  checkFields?: string[];
  /** 'all' (default): every checked field null; 'any': at least one null (item rule 4). */
  checkMode?: ErrorCheckMode;
}

export type ErrorCheckMode = 'all' | 'any';

/** Fact → dimension surrogate-key resolution. */
export interface DimensionLookup {
  id: string;
  dimensionId: string;
  dimensionTable: string;
  sourceIdColumn: string;
  targetSkColumn: string;
  defaultFallbackSk: number;
  isMandatory: boolean;
  /** Active-row predicate for the lookup (defaults to 'DELETED = 0'). */
  activeCondition?: string;
  /** Role label when the same dimension is resolved multiple times (e.g. 'invoicer'). */
  roleAlias?: string;
}

export interface GeoEnrichment {
  id: string;
  /** e.g. "ship_from", "ship_to". */
  type: string;
  targetGeoSk: string;
  sourceCountryCol: string;
  sourceStateCol: string;
  sourceCityCol: string;
}

export interface CurrencyConversion {
  id: string;
  sourceAmountCol: string;
  sourceCurrencyCol: string;
  targetBaseAmountCol: string;
  baseCurrency: string;
}

export interface ValidationRule {
  id: string;
  ruleName: string;
  /** SQL predicate that must hold for a record to be valid. */
  condition: string;
  errorCode: string;
  errorMessage: string;
  /** Dimensions: stream field that must be non-null for the rule to apply (with `checkFields`). */
  driverField?: string;
  /** Dimensions: stream fields checked for null. */
  checkFields?: string[];
  /** Dimensions: 'all' (default) or 'any' checked field null. */
  checkMode?: ErrorCheckMode;
}

/** Kettle named parameter declared in every generated KTR/KJB of the entity (e.g. `product.group.type.name`). */
export interface EntityParameter {
  name: string;
  default?: string;
}

/** Optional hooks of a staged dimension job (item_sync.kjb). */
export interface DimensionExtensions {
  /** Truncate the stg table before each chunk (default true). */
  truncateStg?: boolean;
  /** Refresh model_attribute_keys_stg before the sync (sync_attribute_key_into_attribute_stg_key_table.ktr). */
  attributeKeys?: { modelLevel: string; associatedModelLevel?: string };
  /** Run the EPT computation (call_compuatation_transformation.kjb) after the sync. */
  ept?: { transPath: string };
}

/** Post-load reconciliation: a net-change table re-checked by a Pentaho transform. */
export interface ReconcileDef {
  id: string;
  /** Net-change table whose loaded rows are reconciled. */
  ncTable: string;
  /** Pentaho `.ktr` transform file that performs the reconciliation. */
  ktrFileName: string;
}

export interface EtlConfig {
  isEnabled?: boolean;
  priority?: number;
  /** 1 = light .. 4 = critical. */
  resourceCost?: number;
}

/** Canvas position for the diagram. */
export interface UiState {
  x: number;
  y: number;
}

export interface BaseEntity {
  id: string;
  kind: EntityKind;
  name: string;
  displayName?: string;
  description?: string;
  domain?: string;
  columns: Column[];
  /** id of the applied audit profile, if any. */
  auditProfileId?: string;
  shardKey?: string;
  sortKeys?: string[];
  etlConfig?: EtlConfig;
  netChange?: NetChangeSource[];
  joins?: JoinDef[];
  lookups?: LookupDef[];
  /** Kettle named parameters declared in the generated KTR/KJB (dimensions). */
  parameters?: EntityParameter[];
  ui?: UiState;
}

export interface Enumeration extends BaseEntity {
  kind: 'enumeration';
  isReferenceTable?: boolean;
  sourceNcTable?: string;
  enumTypeFilter?: string;
  /** @deprecated Ignored: the physical table is always `name`. Kept so old YAML designs still parse. */
  enumTable?: string;
  /** @deprecated Ignored: `field_key` is derived from the SK column. Kept so old YAML designs still parse. */
  fieldKey?: string;
  /** @deprecated Ignored: `field_name` is derived from the `enum_entry_name` column. Kept so old YAML designs still parse. */
  fieldName?: string;
  /** Source column in the NC table that carries the enterprise scope id. */
  entScopeSource?: string;
}

/**
 * The build pattern a dimension follows in the ETL flow:
 *  - simple:        1:1 net-change → dimension load.
 *  - staged:        loaded through a staging table before the final merge.
 *  - geo:           carries a geo-address tuple (country/state/city/...).
 *  - hierarchical:  denormalizes a parent/ancestor chain onto each row.
 *  - multi_target:  a single source feeds several dimension tables.
 */
export type DimensionType = 'simple' | 'staged' | 'geo' | 'hierarchical' | 'multi_target';

export interface Dimension extends BaseEntity {
  kind: 'dimension';
  requiresStaging?: boolean;
  sourceNcTables?: string[];
  hasDefaultUnknownRow?: boolean;
  surrogateKey?: string;
  naturalKey?: string;
  stgTable?: string;
  stgErrorTable?: string;
  /** Build pattern driving the generated ETL flow (defaults to 'simple'). */
  dimensionType?: DimensionType;
  /** Target tables fed when dimensionType = 'multi_target'. */
  multiTargetTables?: string[];
  /** Allow natural-key (type-1) updates on existing rows. */
  nkUpdates?: boolean;
  /** Literal column values for the unknown/default row (keyed by column name). */
  defaultRow?: Record<string, string>;
  /** MemSQL REFERENCE table (replicated on every leaf), like most VCDW dimensions. */
  isReferenceTable?: boolean;
  /**
   * How new rows are written:
   *  - insert_new:    anti-join on OLTP_ID + insert (default).
   *  - upsert_by_key: InsertUpdate keyed on `upsertKeys` (rows already present are left untouched).
   */
  loadStrategy?: DimensionLoadStrategy;
  /** Target columns that identify a row when loadStrategy = 'upsert_by_key'. */
  upsertKeys?: string[];
  /** Business key columns compared by handle_nk_updates (composite keys allowed). */
  businessKeys?: string[];
  /** Staged dimensions: record-level rules (driverField + checkFields) evaluated by the "set error" step. */
  validationRules?: ValidationRule[];
  /** Staged dimensions: truncate / attribute keys / EPT hooks. */
  extensions?: DimensionExtensions;
  /** Copies of each output step (default 4). */
  insertCopies?: number;
  /** Parallel lookup chains in <dim>_sync.ktr (default 1). */
  lanes?: number;
}

export type DimensionLoadStrategy = 'insert_new' | 'upsert_by_key';

export type FactType = 'transaction' | 'snapshot' | 'weekly_aggregation';

export interface Fact extends BaseEntity {
  kind: 'fact';
  factType: FactType;
  primaryNcTable?: string;
  secondaryNcTables?: string[];
  stagingTable?: string;
  errorTable?: string;
  dimensionLookups?: DimensionLookup[];
  geoEnrichment?: GeoEnrichment[];
  currencyConversions?: CurrencyConversion[];
  validationRules?: ValidationRule[];
  reconciles?: ReconcileDef[];
}

export interface ProjectMeta {
  name: string;
  version: string;
  targetDatabase: SqlDialect;
  createdAt: string;
}

export interface DesignModel {
  schemaVersion: string;
  project: ProjectMeta;
  auditProfiles: AuditFieldProfile[];
  enumerations: Enumeration[];
  dimensions: Dimension[];
  facts: Fact[];
}

export type AnyEntity = Enumeration | Dimension | Fact;
