/**
 * Factory helpers: standard VCDW column templates and entity constructors.
 * Kept framework-neutral so both client and server (and tests) can reuse them.
 */
import type {
  AuditFieldProfile,
  Column,
  Dimension,
  Enumeration,
  Fact,
  LookupDef,
  NetChangeSource,
  SourceColumn,
} from './types';

let counter = 0;
/** Small, dependency-free unique id generator. */
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function col(partial: Partial<Column> & { name: string; type: string }): Column {
  return {
    id: uid('col'),
    nullable: true,
    ...partial,
  };
}

/** The default, editable audit profile every entity gets on creation. */
export function defaultAuditProfile(): AuditFieldProfile {
  return {
    id: 'audit_default',
    name: 'Standard Audit',
    description: 'Soft-delete flag plus DW create/modify timestamps.',
    columns: [
      col({ name: 'DELETED', type: 'TINYINT(1)', default: '0', nullable: false, auditRole: 'deleted' }),
      col({ name: 'DW_CREATED', type: 'DATETIME(6)', default: 'CURRENT_TIMESTAMP', nullable: false, auditRole: 'created' }),
      col({
        name: 'DW_LAST_MODIFIED',
        type: 'DATETIME(6)',
        default: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
        nullable: false,
        auditRole: 'modified',
      }),
    ],
  };
}

/** Clone a profile's columns with fresh ids so they belong to an entity. */
export function materializeAuditColumns(profile: AuditFieldProfile): Column[] {
  return profile.columns.map((c) => ({ ...c, id: uid('col') }));
}

export function standardEnumColumns(enumName: string, entLookupId?: string): Column[] {
  const base = enumName.toUpperCase();
  // Canonical VCDW enum target shape: surrogate key + OLTP natural key + name + code + scope.
  return [
    col({ name: `${base}_KEY`, type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, nullable: false, mappingKind: 'generated' }),
    col({ name: 'OLTP_ID', type: 'BIGINT', isNaturalKey: true, nullable: false, mappingKind: 'direct', sourceColumn: 'sys_enum_id', sourceTable: 'en' }),
    col({ name: `${base}_NAME`, type: 'VARCHAR(256)', nullable: false, mappingKind: 'direct', sourceColumn: 'enum_entry_name', sourceTable: 'en' }),
    col({ name: 'ENUM_ENTRY_VALUE', type: 'DECIMAL(5,0)', nullable: true, mappingKind: 'direct', sourceColumn: 'enum_entry_value', sourceTable: 'en' }),
    col({ name: 'ENT_NAME', type: 'VARCHAR(64)', nullable: true, mappingKind: 'lookup', lookupId: entLookupId, sourceTable: 'e' }),
  ];
}

/** Physical columns of the shared `enumeration_nc` source table. */
export function standardEnumSourceColumns(): SourceColumn[] {
  return [
    { id: uid('sc'), name: 'sys_enum_id', type: 'BIGINT' },
    { id: uid('sc'), name: 'enum_type', type: 'VARCHAR(64)' },
    { id: uid('sc'), name: 'enum_entry_name', type: 'VARCHAR(256)' },
    { id: uid('sc'), name: 'enum_entry_value', type: 'DECIMAL(5,0)' },
    { id: uid('sc'), name: 'last_modified_date', type: 'DATETIME(6)' },
    { id: uid('sc'), name: 'hidden', type: 'DECIMAL(1,0)' },
    { id: uid('sc'), name: 'sys_ent_id', type: 'BIGINT' },
    { id: uid('sc'), name: 'es_lmd', type: 'DATETIME(6)' },
  ];
}

export function standardDimensionColumns(dimName: string): Column[] {
  const key = `${dimName.toUpperCase()}_KEY`;
  return [
    col({ name: key, type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, nullable: false }),
    col({ name: 'OLTP_ID', type: 'BIGINT', isNaturalKey: true, nullable: false, sourceColumn: 'oltp_id' }),
  ];
}

export function standardFactColumns(factName: string): Column[] {
  const key = `${factName.replace(/^dw_/, '').toUpperCase()}_KEY`;
  return [
    col({ name: key, type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, nullable: false }),
    col({ name: 'OLTP_ID', type: 'BIGINT', isNaturalKey: true, nullable: false, sourceColumn: 'oltp_id' }),
    col({ name: 'REPORT_DATE_KEY', type: 'BIGINT', isDateKey: true, nullable: true }),
    col({ name: 'REPORT_DATE_TS', type: 'DATETIME(6)', nullable: true }),
  ];
}

/**
 * Definable "standard column" presets, filtered by entity category. Each profile
 * builds a fresh set of columns for a given entity name so the UI can offer
 * category-appropriate choices from the "Insert standard columns" control.
 */
export interface StandardColumnProfile {
  id: string;
  label: string;
  description?: string;
  /** Categories where this profile is offered. */
  categories: ('enumeration' | 'dimension' | 'fact' | 'support')[];
  /** Build the columns for an entity with the given physical name. */
  build: (entityName: string) => Column[];
}

export const STANDARD_COLUMN_PROFILES: StandardColumnProfile[] = [
  {
    id: 'enum_core',
    label: 'Enumeration core (KEY · OLTP_ID · NAME · VALUE · ENT_NAME)',
    description: 'Canonical VCDW enumeration target shape.',
    categories: ['enumeration'],
    build: (n) => standardEnumColumns(n),
  },
  {
    id: 'dim_core',
    label: 'Dimension core (KEY · OLTP_ID)',
    description: 'Surrogate key plus OLTP natural key.',
    categories: ['dimension'],
    build: (n) => standardDimensionColumns(n),
  },
  {
    id: 'fact_core',
    label: 'Fact core (KEY · OLTP_ID · REPORT_DATE)',
    description: 'Surrogate key, natural key and report-date columns.',
    categories: ['fact'],
    build: (n) => standardFactColumns(n),
  },
  {
    id: 'audit',
    label: 'Audit (DELETED · DW_CREATED · DW_LAST_MODIFIED)',
    description: 'Soft-delete flag and DW create/modify timestamps.',
    categories: ['enumeration', 'dimension', 'fact'],
    build: () => materializeAuditColumns(defaultAuditProfile()),
  },
];

/** Standard column profiles offered for a given entity category. */
export function standardProfilesFor(
  category: 'enumeration' | 'dimension' | 'fact' | 'support',
): StandardColumnProfile[] {
  return STANDARD_COLUMN_PROFILES.filter((p) => p.categories.includes(category));
}

export function newEnumeration(name = 'new_enum'): Enumeration {
  const audit = defaultAuditProfile();
  const base = name.toUpperCase();
  const entLookup = standardEnterpriseLookup();
  return {
    id: uid('enum'),
    kind: 'enumeration',
    name,
    displayName: `${name} Enumeration`,
    description: '',
    domain: 'General',
    isReferenceTable: true,
    sourceNcTable: 'enumeration_nc',
    enumTypeFilter: name,
    enumTable: name,
    fieldKey: `${base}_KEY`,
    fieldName: `${base}_NAME`,
    entScopeSource: 'sys_ent_id',
    auditProfileId: audit.id,
    columns: [],
    netChange: [standardEnumNetChange(name)],
    lookups: [entLookup],
    etlConfig: { isEnabled: true, priority: 5 },
    ui: { x: 40, y: 40 },
  };
}

/** Standard `enumeration_nc` net-change source shared by (almost) every enum. */
export function standardEnumNetChange(enumType: string): NetChangeSource {
  return {
    id: uid('nc'),
    role: 'netchange',
    isPrimary: true,
    oltpTable: 'enumeration',
    oltpTableSysId: 'SYS_ENUM_ID',
    oltpTableLmd: 'es_lmd',
    ncTable: 'enumeration_nc',
    dwOltpCopyTable: 'dw_enumeration',
    condition: `enum_type='${enumType}'`,
    alias: 'en',
    columns: standardEnumSourceColumns(),
  };
}

/** Standard enterprise-scope lookup that resolves ENT_NAME from `sys_ent_id`. */
export function standardEnterpriseLookup(): LookupDef {
  return {
    id: uid('lkp'),
    name: 'Lookup enterprise scope',
    tableName: 'enterprise',
    cache: true,
    strategy: 'left_join',
    streamKeyFields: ['sys_ent_id'],
    tableKeyFields: ['OLTP_ID'],
    keyConditions: ['='],
    returnFields: [{ field: 'ENT_NAME', newName: 'ENT_NAME' }],
  };
}

/** Titleize a snake/lower identifier for display: `load_type` -> `Load Type`. */
export function titleize(name: string): string {
  return name
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a fully-formed enumeration design from a catalog row so its columns are
 * generated with the correct physical name (no stale placeholder like ENUM_1_KEY).
 */
export function newEnumerationFromCatalog(
  name: string,
  enumType?: string,
  kjb?: string,
): Enumeration {
  const e = newEnumeration(name);
  e.displayName = `${titleize(name)} Enumeration`;
  if (enumType) {
    e.enumTypeFilter = enumType;
    e.netChange = [standardEnumNetChange(enumType)];
  }
  if (kjb) e.description = `ETL sync transform: ${kjb}.ktr`;
  return e;
}

export function newDimension(name = 'new_dim'): Dimension {
  const audit = defaultAuditProfile();
  return {
    id: uid('dim'),
    kind: 'dimension',
    name,
    displayName: `${name} Dimension`,
    description: '',
    domain: 'Logistics',
    requiresStaging: false,
    sourceNcTables: [`${name}_nc`],
    hasDefaultUnknownRow: true,
    surrogateKey: `${name.toUpperCase()}_KEY`,
    naturalKey: 'OLTP_ID',
    shardKey: 'OLTP_ID',
    sortKeys: ['OLTP_ID'],
    auditProfileId: audit.id,
    columns: [],
    etlConfig: { isEnabled: true, priority: 1 },
    ui: { x: 40, y: 40 },
  };
}

export function newFact(name = 'dw_new_fact'): Fact {
  const audit = defaultAuditProfile();
  return {
    id: uid('fact'),
    kind: 'fact',
    name,
    displayName: `${name} Fact`,
    description: '',
    domain: 'Logistics',
    factType: 'transaction',
    primaryNcTable: '',
    secondaryNcTables: [],
    stagingTable: `${name.replace(/^dw_/, '')}_stg`,
    errorTable: `${name.replace(/^dw_/, '')}_stg_error`,
    shardKey: 'OLTP_ID',
    sortKeys: ['OLTP_ID', 'REPORT_DATE_KEY', 'DELETED'],
    auditProfileId: audit.id,
    columns: [],
    dimensionLookups: [],
    geoEnrichment: [],
    currencyConversions: [],
    validationRules: [],
    reconciles: [],
    etlConfig: { isEnabled: true, priority: 2, resourceCost: 2 },
    ui: { x: 360, y: 200 },
  };
}
