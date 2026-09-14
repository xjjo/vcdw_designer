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
  sourceColumn?: string;

  // --- audit ---
  /** Non-empty when this column comes from an audit profile. */
  auditRole?: string;
}

/** Reusable, fully customizable set of audit columns applied to any entity. */
export interface AuditFieldProfile {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
}

/** A net-change (CDC) source feeding an entity. */
export interface NetChangeSource {
  id: string;
  isPrimary?: boolean;
  oltpTable: string;
  oltpTableSysId?: string;
  oltpTableLmd?: string;
  ncTable: string;
  dwOltpCopyTable?: string;
  condition?: string;
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
  rightTable: string;
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

/** Generic lookup (maps 1:1 onto the ETL generator lookup contract). */
export interface LookupDef {
  id: string;
  /** Optional link to a dimension/enum entity for the diagram. */
  targetEntityId?: string;
  tableName: string;
  cache?: boolean;
  streamKeyFields: string[];
  tableKeyFields: string[];
  keyConditions?: string[];
  returnFields: LookupReturnField[];
}

/** Fact → dimension surrogate-key resolution. */
export interface DimensionLookup {
  id: string;
  dimensionId: string;
  dimensionTable: string;
  sourceIdColumn: string;
  targetSkColumn: string;
  defaultFallbackSk: number;
  isMandatory: boolean;
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
  ui?: UiState;
}

export interface Enumeration extends BaseEntity {
  kind: 'enumeration';
  isReferenceTable?: boolean;
  sourceNcTable?: string;
  enumTypeFilter?: string;
}

export interface Dimension extends BaseEntity {
  kind: 'dimension';
  requiresStaging?: boolean;
  sourceNcTables?: string[];
  hasDefaultUnknownRow?: boolean;
  surrogateKey?: string;
  naturalKey?: string;
  stgTable?: string;
  stgErrorTable?: string;
}

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
