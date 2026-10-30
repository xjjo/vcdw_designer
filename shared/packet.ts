/**
 * Deployment packet bundler.
 *
 * Assembles everything an ETL developer needs to deploy a single entity into
 * the VCDW DataWarehouse repo, reusing the existing generators:
 *   - `generator.json`             — the narrow ETL-generator contract.
 *   - `ddl/<entity>.sql`           — target + NC + staging (+ fact update-delta) DDL.
 *   - `control/<entity>_inserts.sql` — control-table population INSERTs.
 *   - `mapping/*.csv`              — field-mapping CSVs (dimensions/facts only).
 *   - `INSTALL.md`                 — ordered, human-readable deploy guide naming
 *                                    the real repo files to edit.
 */
import type { AnyEntity, Dimension, Enumeration, EntityKind, Fact, NetChangeSource, SqlDialect } from './types';
import { entityToGenerator } from './generatorMap';
import { entityDdl, ncTableDdl, stagingDdl, updateDeltaDdl } from './sqlGenerator';
import { dimensionControlInserts, enumControlInserts, factControlInserts } from './configInserts';
import { enableMappingCsv, ncMappingCsv } from './mappingCsv';

export interface PacketFile {
  path: string;
  content: string;
}

export interface DeploymentPacket {
  entity: string;
  kind: EntityKind;
  files: PacketFile[];
}

/**
 * Net-change sources that drive NC DDL, mapping CSVs and field mapping:
 * declared non-support sources, or — when none are declared — synthetic sources
 * derived from `primaryNcTable` / `secondaryNcTables` (facts) or `sourceNcTables`
 * (dimensions), mirroring the control-insert generators.
 */
function netChangeSourcesFor(e: AnyEntity): NetChangeSource[] {
  const declared = (e.netChange ?? []).filter((s) => (s.role ?? 'netchange') !== 'support');
  if (declared.length > 0) return declared;
  if (e.kind === 'fact') {
    const f = e as Fact;
    const synthetic: NetChangeSource[] = [];
    if (f.primaryNcTable) synthetic.push({ id: 'primary_nc', ncTable: f.primaryNcTable, isPrimary: true });
    for (const t of f.secondaryNcTables ?? []) synthetic.push({ id: t, ncTable: t });
    return synthetic;
  }
  if (e.kind === 'dimension') {
    const d = e as Dimension;
    return (d.sourceNcTables ?? []).map((nc) => ({ id: nc, ncTable: nc } as NetChangeSource));
  }
  return [];
}

/** Concatenate the entity's DDL block: target, then (dim/fact) NC + staging (+ fact delta). */
function buildDdl(e: AnyEntity, dialect: SqlDialect, sources: NetChangeSource[]): string {
  const parts: string[] = [entityDdl(e, dialect)];
  if (e.kind !== 'enumeration') {
    for (const s of sources) parts.push(ncTableDdl(s, dialect));
    parts.push(...stagingDdl(e, dialect));
    if (e.kind === 'fact') parts.push(updateDeltaDdl(e as Fact, dialect));
  }
  return parts.join('\n\n');
}

/** The control-table INSERTs matching the entity kind. */
function buildControlInserts(e: AnyEntity): string {
  switch (e.kind) {
    case 'enumeration':
      return enumControlInserts(e as Enumeration);
    case 'dimension':
      return dimensionControlInserts(e as Dimension);
    case 'fact':
      return factControlInserts(e as Fact);
    default:
      return '';
  }
}

/** The real `populate_*.sql` scripts that receive the control INSERTs, per kind. */
function populateTargets(kind: EntityKind): string[] {
  const requireNc = [
    'populate_require_nc.sql',
    'populate_initial_load_require_nc.sql',
    'populate_incremental_load_require_nc.sql',
  ];
  switch (kind) {
    case 'fact':
      return [
        'populate_dw_fact_enabler_config.sql',
        'populate_dw_table_and_fact_mapping.sql',
        'populate_job_task_mapping.sql',
        ...requireNc,
      ];
    case 'dimension':
      return [
        'populate_dw_table_and_dimension_mapping.sql',
        'populate_dw_dimension_enabler_config.sql',
        'populate_dw_oltp_tables_mapping.sql',
        ...requireNc,
      ];
    case 'enumeration':
      return ['populate_dw_table_and_dimension_mapping.sql', 'populate_dw_dimension_enabler_config.sql'];
    default:
      return [];
  }
}

/** Ordered, human-readable deployment guide naming the real repo files to edit. */
function buildInstallMd(e: AnyEntity, mappingFiles: string[]): string {
  const name = e.name;
  const isMapped = e.kind !== 'enumeration';
  const lines: string[] = [];
  lines.push(`# Deployment packet — ${name} (${e.kind})`);
  lines.push('');
  lines.push(`Deploy this ${e.kind} into the VCDW DataWarehouse repo by applying the files`);
  lines.push('in this packet to the real sources below, in order.');
  lines.push('');

  lines.push('## 1. Create tables');
  lines.push('Target: `services/neo-analytics-db/vcdw/ddl/memsql/create_tables.sql`');
  lines.push(`Paste the statements from \`ddl/${name}.sql\`.`);
  lines.push('');

  lines.push('## 2. Control-table inserts');
  lines.push(`Paste the statements from \`control/${name}_inserts.sql\` into the matching`);
  lines.push('populate scripts (same directory as `create_tables.sql`):');
  for (const f of populateTargets(e.kind)) lines.push(`- \`${f}\``);
  if (e.kind === 'enumeration') {
    lines.push('');
    lines.push('> NOTE: common fan-out enumerations share the `enumeration_nc` source and');
    lines.push('> may already be registered — these rows are often unnecessary. Only add them');
    lines.push('> when this reference table is not already enabled.');
  }
  lines.push('');

  lines.push('## 3. ETL jobs');
  lines.push('Target: `cfg/etl/**`');
  lines.push(`Add the Kettle jobs the Java ETL generator produces for this ${e.kind}, plus the`);
  lines.push('correct wrapper job.');
  lines.push('');

  if (isMapped) {
    lines.push('## 4. Field-mapping CSVs');
    lines.push('Copy the mapping CSVs from this packet into the ETL mapping resources:');
    for (const f of mappingFiles) lines.push(`- \`${f}\``);
    lines.push('');
  }

  return lines.join('\n');
}

/** Assemble the full per-entity deployment packet. */
export function buildDeploymentPacket(e: AnyEntity, dialect: SqlDialect): DeploymentPacket {
  const sources = netChangeSourcesFor(e);
  const files: PacketFile[] = [];

  files.push({ path: 'generator.json', content: JSON.stringify(entityToGenerator(e), null, 2) });
  files.push({ path: `ddl/${e.name}.sql`, content: buildDdl(e, dialect, sources) });
  files.push({ path: `control/${e.name}_inserts.sql`, content: buildControlInserts(e) });

  const mappingFiles: string[] = [];
  if (e.kind !== 'enumeration') {
    for (const s of sources) {
      const csv = ncMappingCsv(s, e.columns);
      const path = `mapping/${csv.fileName}`;
      files.push({ path, content: csv.content });
      mappingFiles.push(path);
    }
    const enable = enableMappingCsv(sources);
    const enablePath = `mapping/${enable.fileName}`;
    files.push({ path: enablePath, content: enable.content });
    mappingFiles.push(enablePath);
  }

  files.push({ path: 'INSTALL.md', content: buildInstallMd(e, mappingFiles) });

  return { entity: e.name, kind: e.kind, files };
}
