import type { AnyEntity, DesignModel, Enumeration, Dimension, Fact, EntityKind, SourceColumn, SupportTable, SupportTableKind, SqlDialect } from '@shared/types';
import type { DeploymentPacket, PacketFile } from '@shared/packet';

export type { DeploymentPacket, PacketFile };

/** Thin client for the optional Node backend. All calls degrade gracefully. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function generateModelSql(model: DesignModel, rows = 3): Promise<string> {
  const data = await post<{ sql: string }>('/api/sql', { model, rows });
  return data.sql;
}

export async function mapToGenerator(entity: AnyEntity): Promise<unknown> {
  return post<unknown>('/api/generator-map', { entity });
}

/** Build the full deployment packet (generator.json, DDL, control inserts, mapping CSVs, INSTALL.md). */
export async function fetchPacket(
  entity: AnyEntity,
  dialect: SqlDialect = 'MemSQL',
): Promise<DeploymentPacket> {
  return post<DeploymentPacket>('/api/packet', { entity, dialect });
}

/** Generate the Pentaho Kettle ETL code (.ktr / .kjb) for an entity via the Java vcdw-etl-builder. */
export interface EtlGenResult { ok: boolean; files: PacketFile[]; log: string; error?: string; missing?: string[] }
export function generateEtl(entity: AnyEntity): Promise<EtlGenResult> {
  return post<EtlGenResult>('/api/generate-etl', { entity });
}

export async function saveModel(model: DesignModel): Promise<void> {
  await post('/api/model', model);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Enumeration catalog + training sources
// ---------------------------------------------------------------------------

export interface CatalogRow {
  enumType: string;
  kjb: string;
  enumeration: string;
  /** Associated design YAML filename recorded in _catalog.yaml. */
  yaml?: string;
  /** true when a per-enumeration design YAML exists in the library. */
  designed?: boolean;
}

export interface EnumCatalog {
  rows: CatalogRow[];
  source: string;
}

export interface AppConfig {
  db: { host: string; name: string; user: string; password: string; port: number };
  etl: { root: string; enumerationsDir: string };
  catalog: { enumCatalogPath: string };
  etlBuilder: { appDir: string; pdiHome: string; enabled: boolean };
}

export interface DbEnumRow {
  oltpTable: string;
  [key: string]: unknown;
}

export interface EtlScanResult {
  scanned: number;
  enumerations: { enumType: string; file: string }[];
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export function fetchEnumCatalog(): Promise<EnumCatalog> {
  return get<EnumCatalog>('/api/enum-catalog');
}

export function fetchConfig(): Promise<AppConfig> {
  return get<AppConfig>('/api/config');
}

export function saveConfig(config: AppConfig): Promise<{ saved: boolean }> {
  return post<{ saved: boolean }>('/api/config', config);
}

export function testDbConnection(db: AppConfig['db']): Promise<{ ok: boolean; message: string }> {
  return post<{ ok: boolean; message: string }>('/api/train/db-test', db);
}

export function fetchDbEnumerations(
  db: AppConfig['db'],
): Promise<{ rows: DbEnumRow[]; count: number }> {
  return post<{ rows: DbEnumRow[]; count: number }>('/api/train/db-enumerations', db);
}

export function scanEtl(path: string): Promise<EtlScanResult> {
  return post<EtlScanResult>('/api/train/etl-scan', { path });
}

// ---------------------------------------------------------------------------
// Enumeration YAML library (file-based store)
// ---------------------------------------------------------------------------

export interface TrainEnumResult {
  generated: number;
  columnsSource: 'db' | 'template';
  catalogFile: string;
  storeDir: string;
  errors: string[];
}

/** Load a single enumeration design from the YAML library, or null if absent. */
export async function getEnumerationDesign(name: string): Promise<Enumeration | null> {
  const res = await fetch(`/api/enumerations/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`enumerations/${name} -> ${res.status}`);
  return (await res.json()) as Enumeration;
}

export function saveEnumerationDesign(design: Enumeration): Promise<{ saved: boolean; file: string }> {
  return post<{ saved: boolean; file: string }>(
    `/api/enumerations/${encodeURIComponent(design.name)}`,
    design,
  );
}

/** Remove an enumeration row from _catalog.yaml (keeps its design file on disk). */
export function deleteEnumCatalogEntry(enumeration: string): Promise<{ deleted: boolean }> {
  return del<{ deleted: boolean }>(`/api/enum-catalog/${encodeURIComponent(enumeration)}`);
}

/** Run training: discover enumerations and (re)generate the YAML library. */
export function trainEnumerations(): Promise<TrainEnumResult> {
  return post<TrainEnumResult>('/api/train/enumerations', {});
}

// ---------------------------------------------------------------------------
// Dimension / Fact catalogs (file-backed, mirror the enumeration library)
// ---------------------------------------------------------------------------

export type CatalogKind = Exclude<EntityKind, 'enumeration'>;

export interface EntityCatalogRow {
  name: string;
  displayName?: string;
  table?: string;
  yaml?: string;
  /** true when a per-entity design YAML exists in the library. */
  designed?: boolean;
}

export function fetchEntityCatalog(
  kind: CatalogKind,
): Promise<{ rows: EntityCatalogRow[]; source: string }> {
  return get<{ rows: EntityCatalogRow[]; source: string }>(`/api/catalog/${kind}`);
}

export async function getEntityDesign(
  kind: CatalogKind,
  name: string,
): Promise<Dimension | Fact | null> {
  const res = await fetch(`/api/entities/${kind}/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`entities/${kind}/${name} -> ${res.status}`);
  return (await res.json()) as Dimension | Fact;
}

export function saveEntityDesign(
  entity: Dimension | Fact,
): Promise<{ saved: boolean; file: string }> {
  return post<{ saved: boolean; file: string }>(
    `/api/entities/${entity.kind}/${encodeURIComponent(entity.name)}`,
    entity,
  );
}

/** Remove a dimension/fact row from its _catalog.yaml (keeps the design file). */
export function deleteEntityCatalogEntry(
  kind: CatalogKind,
  name: string,
): Promise<{ deleted: boolean }> {
  return del<{ deleted: boolean }>(`/api/catalog/${kind}/${encodeURIComponent(name)}`);
}

// ---------------------------------------------------------------------------
// Support-table library (dw_* / *_nc) + DB introspection
// ---------------------------------------------------------------------------

export interface SupportCatalogRow {
  name: string;
  displayName?: string;
  tableKind?: SupportTableKind;
  yaml?: string;
  /** true when a per-table design YAML exists in the library. */
  designed?: boolean;
}

export interface DbTableRow {
  name: string;
  tableKind: SupportTableKind;
}

export function fetchSupportCatalog(): Promise<{ rows: SupportCatalogRow[]; source: string }> {
  return get<{ rows: SupportCatalogRow[]; source: string }>('/api/support-tables');
}

export async function getSupportTableDesign(name: string): Promise<SupportTable | null> {
  const res = await fetch(`/api/support-tables/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`support-tables/${name} -> ${res.status}`);
  return (await res.json()) as SupportTable;
}

export function saveSupportTableDesign(design: SupportTable): Promise<{ saved: boolean; file: string }> {
  return post<{ saved: boolean; file: string }>(
    `/api/support-tables/${encodeURIComponent(design.name)}`,
    design,
  );
}

export function deleteSupportTable(name: string): Promise<{ deleted: boolean }> {
  return del<{ deleted: boolean }>(`/api/support-tables/${encodeURIComponent(name)}`);
}

/** List physical tables from the configured DB (support tables by default). */
export function listDbTables(
  opts: { filter?: string; all?: boolean } = {},
): Promise<{ tables: DbTableRow[]; count: number }> {
  return post<{ tables: DbTableRow[]; count: number }>('/api/db/tables', opts);
}

/** Fetch the physical columns of a single table from the configured DB. */
export function fetchDbColumns(
  table: string,
): Promise<{ table: string; columns: SourceColumn[]; count: number }> {
  return post<{ table: string; columns: SourceColumn[]; count: number }>('/api/db/columns', { table });
}
