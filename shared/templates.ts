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

export function standardEnumColumns(enumName: string): Column[] {
  const key = `${enumName.toUpperCase()}_KEY`;
  return [
    col({ name: key, type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, nullable: false }),
    col({ name: 'ENUM_TYPE', type: 'VARCHAR(64)', nullable: false }),
    col({ name: 'ENUM_ENTRY_NAME', type: 'VARCHAR(128)', isNaturalKey: true, nullable: false }),
    col({ name: 'ENUM_ENTRY_VALUE', type: 'VARCHAR(256)', nullable: true }),
    col({ name: 'OLTP_ID', type: 'BIGINT', nullable: true }),
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

export function newEnumeration(name = 'new_enum'): Enumeration {
  const audit = defaultAuditProfile();
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
    auditProfileId: audit.id,
    columns: [...standardEnumColumns(name), ...materializeAuditColumns(audit)],
    etlConfig: { isEnabled: true, priority: 5 },
    ui: { x: 40, y: 40 },
  };
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
    columns: [...standardDimensionColumns(name), ...materializeAuditColumns(audit)],
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
    columns: [...standardFactColumns(name), ...materializeAuditColumns(audit)],
    dimensionLookups: [],
    geoEnrichment: [],
    currencyConversions: [],
    validationRules: [],
    etlConfig: { isEnabled: true, priority: 2, resourceCost: 2 },
    ui: { x: 360, y: 200 },
  };
}
