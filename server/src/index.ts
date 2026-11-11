import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, relative } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import cors from 'cors';
import express from 'express';
import YAML from 'yaml';

import type { AnyEntity, DesignModel } from '../../shared/types.js';
import type { Column, Enumeration } from '../../shared/types.js';
import { buildSeedModel } from '../../shared/seed.js';
import { generateModelSql, generateEntitySql } from '../../shared/sqlGenerator.js';
import { entityToGenerator } from '../../shared/generatorMap.js';
import { buildDeploymentPacket } from '../../shared/packet.js';
import { validateGeneratorDoc, contractSchema } from '../../shared/contract/validate.js';
import { newEnumerationFromCatalog } from '../../shared/templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const MODEL_FILE = join(DATA_DIR, 'model.json');
const CONFIG_FILE = join(DATA_DIR, 'config.yaml');
/** File-based design library: one YAML design per entity + a _catalog.yaml index, per kind. */
const STORE_DIRS = {
  enumeration: join(DATA_DIR, 'enumerations'),
  dimension: join(DATA_DIR, 'dimensions'),
  fact: join(DATA_DIR, 'facts'),
} as const;
const STORE_DIR = STORE_DIRS.enumeration;
const CATALOG_YAML = join(STORE_DIR, '_catalog.yaml');

/** Walk up from the server folder to the workspace root (the dir holding `knowledge/`). */
function resolveWorkspaceRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'knowledge'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const WORKSPACE_ROOT = resolveWorkspaceRoot();

interface AppConfig {
  db: { host: string; name: string; user: string; password: string; port: number };
  etl: { root: string; enumerationsDir: string };
  catalog: { enumCatalogPath: string };
  etlBuilder: { appDir: string; pdiHome: string; enabled: boolean };
}

const DEFAULT_CONFIG: AppConfig = {
  db: { host: '', name: '', user: '', password: '', port: 3306 },
  etl: { root: '', enumerationsDir: '' },
  catalog: { enumCatalogPath: 'knowledge/graph/etl/enum/enum_catalog.md' },
  etlBuilder: {
    appDir: 'C:\\Users\\1039971\\Desktop\\workspace\\workspace-eclipse\\workspace-by\\dw\\vcdw-etl-builder',
    pdiHome: '',
    enabled: true,
  },
};

function loadConfig(): AppConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return DEFAULT_CONFIG;
    const parsed = (YAML.parse(readFileSync(CONFIG_FILE, 'utf-8')) ?? {}) as Partial<AppConfig>;
    return {
      db: { ...DEFAULT_CONFIG.db, ...parsed.db },
      etl: { ...DEFAULT_CONFIG.etl, ...parsed.etl },
      catalog: { ...DEFAULT_CONFIG.catalog, ...parsed.catalog },
      etlBuilder: { ...DEFAULT_CONFIG.etlBuilder, ...parsed.etlBuilder },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeConfig(cfg: AppConfig): void {
  ensureDataDir();
  writeFileSync(CONFIG_FILE, YAML.stringify(cfg), 'utf-8');
}

/** Parse the CSV-style enum catalog (`enum_type,kjb,enumeration`). */
function parseEnumCatalog(text: string): { enumType: string; kjb: string; enumeration: string }[] {
  const out: { enumType: string; kjb: string; enumeration: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(',');
    if (cols[0] === 'enum_type') continue; // header
    out.push({
      enumType: (cols[0] ?? '').trim(),
      kjb: (cols[1] ?? '').trim(),
      enumeration: (cols[2] ?? '').trim(),
    });
  }
  return out;
}

type CatalogRow = { enumType: string; kjb: string; enumeration: string; yaml?: string };

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

/** Sanitize an entity name into a safe YAML filename (leaf only, no directory). */
function safeYamlName(name: string): string {
  return `${name.replace(/[^A-Za-z0-9_.-]/g, '_')}.yaml`;
}

/** Sanitize an enumeration name into a safe YAML filename. */
function enumFile(name: string): string {
  return join(STORE_DIR, safeYamlName(name));
}

/** Read catalog rows: prefer the trained _catalog.yaml, else the configured source file. */
function readCatalogRows(): { rows: CatalogRow[]; source: string } {
  if (existsSync(CATALOG_YAML)) {
    try {
      const doc = (YAML.parse(readFileSync(CATALOG_YAML, 'utf-8')) ?? {}) as { enumerations?: CatalogRow[] };
      if (Array.isArray(doc.enumerations)) {
        const rows = doc.enumerations.map((r) => ({
          ...r,
          yaml: r.yaml || (r.enumeration ? safeYamlName(r.enumeration) : ''),
        }));
        return { rows, source: 'data/enumerations/_catalog.yaml' };
      }
    } catch {
      /* fall through to source file */
    }
  }
  const cfg = loadConfig();
  const rel = cfg.catalog.enumCatalogPath || DEFAULT_CONFIG.catalog.enumCatalogPath;
  const file = isAbsolute(rel) ? rel : join(WORKSPACE_ROOT, rel);
  if (!existsSync(file)) return { rows: [], source: rel };
  const text = readFileSync(file, 'utf-8');
  const rows = /\.ya?ml$/i.test(file)
    ? ((YAML.parse(text) ?? {}) as { enumerations?: CatalogRow[] }).enumerations ?? []
    : parseEnumCatalog(text);
  return { rows, source: rel };
}

function writeCatalogYaml(rows: CatalogRow[]): void {
  ensureStoreDir();
  const normalized = rows.map((r) => ({
    enumType: r.enumType,
    kjb: r.kjb,
    enumeration: r.enumeration,
    yaml: r.yaml || (r.enumeration ? safeYamlName(r.enumeration) : ''),
  }));
  writeFileSync(CATALOG_YAML, YAML.stringify({ enumerations: normalized }), 'utf-8');
}

/** Insert or update a single enum catalog row (matched by enumeration name). */
function upsertEnumCatalog(row: CatalogRow): void {
  const { rows } = readCatalogRows();
  const idx = rows.findIndex(
    (r) => r.enumeration.toLowerCase() === row.enumeration.toLowerCase(),
  );
  const merged: CatalogRow = { ...(idx >= 0 ? rows[idx] : {}), ...row };
  merged.yaml = merged.yaml || safeYamlName(row.enumeration);
  const next = idx >= 0 ? rows.map((r, i) => (i === idx ? merged : r)) : [...rows, merged];
  writeCatalogYaml(next);
}

// ---------------------------------------------------------------------------
// Generic entity catalog store (dimensions & facts) — mirrors the enum library.
// ---------------------------------------------------------------------------

type EntityKind = 'dimension' | 'fact';
type EntityCatalogRow = { name: string; displayName?: string; table?: string; yaml: string };

function isEntityKind(value: string): value is EntityKind {
  return value === 'dimension' || value === 'fact';
}

function entityStoreDir(kind: EntityKind): string {
  return STORE_DIRS[kind];
}

function ensureEntityStoreDir(kind: EntityKind): void {
  const dir = entityStoreDir(kind);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function entityDesignFile(kind: EntityKind, name: string): string {
  return join(entityStoreDir(kind), safeYamlName(name));
}

function entityCatalogFile(kind: EntityKind): string {
  return join(entityStoreDir(kind), '_catalog.yaml');
}

function readEntityCatalog(kind: EntityKind): EntityCatalogRow[] {
  const file = entityCatalogFile(kind);
  if (!existsSync(file)) return [];
  try {
    const doc = (YAML.parse(readFileSync(file, 'utf-8')) ?? {}) as { entities?: EntityCatalogRow[] };
    if (!Array.isArray(doc.entities)) return [];
    return doc.entities.map((r) => ({ ...r, yaml: r.yaml || safeYamlName(r.name) }));
  } catch {
    return [];
  }
}

function writeEntityCatalog(kind: EntityKind, rows: EntityCatalogRow[]): void {
  ensureEntityStoreDir(kind);
  const normalized = rows.map((r) => ({
    name: r.name,
    displayName: r.displayName,
    table: r.table,
    yaml: r.yaml || safeYamlName(r.name),
  }));
  writeFileSync(entityCatalogFile(kind), YAML.stringify({ entities: normalized }), 'utf-8');
}

function upsertEntityCatalog(kind: EntityKind, row: EntityCatalogRow): void {
  const rows = readEntityCatalog(kind);
  const idx = rows.findIndex((r) => r.name.toLowerCase() === row.name.toLowerCase());
  const merged: EntityCatalogRow = { ...(idx >= 0 ? rows[idx] : {}), ...row };
  merged.yaml = merged.yaml || safeYamlName(row.name);
  const next = idx >= 0 ? rows.map((r, i) => (i === idx ? merged : r)) : [...rows, merged];
  writeEntityCatalog(kind, next);
}

// ---------------------------------------------------------------------------
// Support-table library (dw_* / *_nc) — file-backed YAML store + DB introspection.
// ---------------------------------------------------------------------------

const SUPPORT_DIR = join(DATA_DIR, 'support');
const SUPPORT_CATALOG = join(SUPPORT_DIR, '_catalog.yaml');

type SupportCatalogRow = { name: string; displayName?: string; tableKind?: string; yaml: string };

function ensureSupportDir(): void {
  if (!existsSync(SUPPORT_DIR)) mkdirSync(SUPPORT_DIR, { recursive: true });
}

function supportDesignFile(name: string): string {
  return join(SUPPORT_DIR, safeYamlName(name));
}

/** Classify a table name into a support kind by naming convention. */
function classifySupportKind(name: string): 'nc' | 'dw' | 'other' {
  const n = name.toLowerCase();
  if (n.endsWith('_nc')) return 'nc';
  if (n.startsWith('dw_')) return 'dw';
  return 'other';
}

/** True when a table name is a VCDW support table (dw_ prefix or _nc suffix). */
function isSupportTableName(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('dw_') || n.endsWith('_nc');
}

function readSupportCatalog(): SupportCatalogRow[] {
  if (!existsSync(SUPPORT_CATALOG)) return [];
  try {
    const doc = (YAML.parse(readFileSync(SUPPORT_CATALOG, 'utf-8')) ?? {}) as { tables?: SupportCatalogRow[] };
    if (!Array.isArray(doc.tables)) return [];
    return doc.tables.map((r) => ({ ...r, yaml: r.yaml || safeYamlName(r.name) }));
  } catch {
    return [];
  }
}

function writeSupportCatalog(rows: SupportCatalogRow[]): void {
  ensureSupportDir();
  const normalized = rows.map((r) => ({
    name: r.name,
    displayName: r.displayName,
    tableKind: r.tableKind ?? classifySupportKind(r.name),
    yaml: r.yaml || safeYamlName(r.name),
  }));
  writeFileSync(SUPPORT_CATALOG, YAML.stringify({ tables: normalized }), 'utf-8');
}

function upsertSupportCatalog(row: SupportCatalogRow): void {
  const rows = readSupportCatalog();
  const idx = rows.findIndex((r) => r.name.toLowerCase() === row.name.toLowerCase());
  const merged: SupportCatalogRow = { ...(idx >= 0 ? rows[idx] : {}), ...row };
  merged.yaml = merged.yaml || safeYamlName(row.name);
  const next = idx >= 0 ? rows.map((r, i) => (i === idx ? merged : r)) : [...rows, merged];
  writeSupportCatalog(next);
}

/** Map information_schema.columns rows into lightweight source columns. */
function sourceColumnsFromInformationSchema(rows: Record<string, unknown>[]): {
  id: string;
  name: string;
  type?: string;
  comment?: string;
}[] {
  let idc = 0;
  return rows.map((r) => ({
    id: `sc_is_${idc++}`,
    name: String(r.COLUMN_NAME ?? ''),
    type: String(r.COLUMN_TYPE ?? '').toUpperCase() || undefined,
    comment: r.COLUMN_COMMENT ? String(r.COLUMN_COMMENT) : undefined,
  }));
}

/** Map information_schema.columns rows into design columns. */
function columnsFromInformationSchema(rows: Record<string, unknown>[]): Column[] {
  let idc = 0;
  return rows.map((r) => {
    const name = String(r.COLUMN_NAME ?? '');
    const extra = String(r.EXTRA ?? '').toLowerCase();
    const key = String(r.COLUMN_KEY ?? '');
    const upper = name.toUpperCase();
    return {
      id: `col_is_${idc++}`,
      name: upper,
      type: String(r.COLUMN_TYPE ?? 'VARCHAR(255)').toUpperCase(),
      nullable: String(r.IS_NULLABLE ?? 'YES') === 'YES',
      default: r.COLUMN_DEFAULT != null ? String(r.COLUMN_DEFAULT) : undefined,
      isPk: key === 'PRI' || upper.endsWith('_KEY'),
      isSk: upper.endsWith('_KEY'),
      autoIncrement: extra.includes('auto_increment'),
      isNaturalKey: upper === 'OLTP_ID',
    } as Column;
  });
}

/** Build a full enumeration design for a catalog row (DB columns override the template). */
function buildEnumerationDesign(row: CatalogRow, dbColumns?: Column[]): Enumeration {
  const design = newEnumerationFromCatalog(row.enumeration, row.enumType, row.kjb);
  if (dbColumns && dbColumns.length) design.columns = dbColumns;
  return design;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vcdw-designer', time: new Date().toISOString() });
});

app.get('/api/seed', (_req, res) => {
  res.json(buildSeedModel());
});

app.get('/api/model', (_req, res) => {
  if (!existsSync(MODEL_FILE)) {
    res.status(404).json({ error: 'No saved model found.' });
    return;
  }
  res.json(JSON.parse(readFileSync(MODEL_FILE, 'utf-8')));
});

app.post('/api/model', (req, res) => {
  const model = req.body as DesignModel;
  if (!model || !model.project) {
    res.status(400).json({ error: 'Invalid model payload.' });
    return;
  }
  ensureDataDir();
  writeFileSync(MODEL_FILE, JSON.stringify(model, null, 2), 'utf-8');
  res.json({ saved: true, path: MODEL_FILE });
});

app.post('/api/sql', (req, res) => {
  const { model, rows } = req.body as { model: DesignModel; rows?: number };
  if (!model) {
    res.status(400).json({ error: 'model is required.' });
    return;
  }
  res.json({ sql: generateModelSql(model, rows ?? 3) });
});

app.post('/api/sql/entity', (req, res) => {
  const { entity, dialect, rows } = req.body as {
    entity: AnyEntity;
    dialect?: DesignModel['project']['targetDatabase'];
    rows?: number;
  };
  if (!entity) {
    res.status(400).json({ error: 'entity is required.' });
    return;
  }
  res.json(generateEntitySql(entity, dialect ?? 'MemSQL', rows ?? 3));
});

/**
 * Forward-compatibility bridge: transform a design entity into the JSON the
 * vcdw-etl-builder generator consumes (type=fact/dimension/enumeration).
 */
app.post('/api/generator-map', (req, res) => {
  const { entity } = req.body as { entity: AnyEntity };
  if (!entity) {
    res.status(400).json({ error: 'entity is required.' });
    return;
  }
  const mapped = entityToGenerator(entity);
  if (!mapped) {
    res.status(422).json({ error: `Cannot map entity of kind "${entity.kind}".` });
    return;
  }
  const check = validateGeneratorDoc(mapped);
  res.json({ ...mapped, _valid: check.valid, _errors: check.errors });
});

/**
 * Bundle a single entity into a full deployment packet (generator.json, DDL,
 * control inserts, mapping CSVs, INSTALL.md) ready to drop into the VCDW repo.
 */
app.post('/api/packet', (req, res) => {
  const { entity, dialect } = req.body as {
    entity: AnyEntity;
    dialect?: DesignModel['project']['targetDatabase'];
  };
  if (!entity) {
    res.status(400).json({ error: 'entity is required.' });
    return;
  }
  res.json(buildDeploymentPacket(entity, dialect ?? 'MemSQL'));
});

/**
 * Generate the Pentaho Kettle ETL code (.ktr / .kjb) for a single design entity
 * by invoking the Java vcdw-etl-builder app (generate-one.bat). The entity is
 * mapped to the generator JSON, written to a throwaway work dir together with a
 * per-request generator.properties (pointing output.root at that dir), the bat
 * is run, and the emitted Kettle files are read back and returned to the client.
 */
app.post('/api/generate-etl', (req, res) => {
  const { entity } = req.body as { entity: AnyEntity };
  if (!entity) { res.status(400).json({ error: 'entity is required.' }); return; }
  const doc = entityToGenerator(entity);
  if (!doc) { res.status(422).json({ error: `Cannot map entity of kind "${entity.kind}".` }); return; }
  const cfg = loadConfig();
  const eb = cfg.etlBuilder;
  if (!eb.enabled) { res.status(400).json({ error: 'ETL builder is disabled in config.' }); return; }
  if (!eb.appDir || !existsSync(eb.appDir)) { res.status(400).json({ error: `etlBuilder.appDir not found: ${eb.appDir || '(empty)'} — set it in Train/Settings.` }); return; }
  const bat = join(eb.appDir, 'generate-one.bat');
  if (!existsSync(bat)) { res.status(400).json({ error: `generate-one.bat not found in ${eb.appDir}. Update the vcdw-etl-builder app.` }); return; }

  const fwd = (p: string) => p.replace(/\\/g, '/');
  const work = mkdtempSync(join(tmpdir(), 'vcdw-etl-'));
  const outDir = join(work, 'out');
  const inputJson = join(work, 'input.json');
  const propsPath = join(work, 'generator.properties');
  try {
    writeFileSync(inputJson, JSON.stringify(doc, null, 2), 'utf-8');
    const props = [
      `output.root=${fwd(outDir)}`,
      `input.json=${fwd(inputJson)}`,
      'fact.dir=fact', 'dim.dir=dim', 'enum.dir=enumeration',
      `template.enum.sync=${fwd(join(eb.appDir, 'resources/templates/enumeration/time_uom_sync.ktr'))}`,
      `template.enum.insert.default=${fwd(join(eb.appDir, 'resources/templates/enumeration/time_uom_insert_default_row.ktr'))}`,
      '',
    ].join('\n');
    writeFileSync(propsPath, props, 'utf-8');

    const args = ['/c', bat, propsPath, inputJson];
    if (eb.pdiHome) args.push(eb.pdiHome);
    const child = spawn('cmd', args, { cwd: eb.appDir, windowsHide: true });
    let log = '';
    child.stdout.on('data', (d) => { log += d.toString(); });
    child.stderr.on('data', (d) => { log += d.toString(); });
    const timer = setTimeout(() => child.kill(), 180000);
    child.on('error', (err) => {
      clearTimeout(timer);
      try { rmSync(work, { recursive: true, force: true }); } catch {}
      res.status(500).json({ ok: false, files: [], log, error: `Failed to launch generator: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const files: { path: string; content: string }[] = [];
      try {
        const walk = (dir: string) => {
          for (const e of readdirSync(dir)) {
            const full = join(dir, e);
            const s = statSync(full);
            if (s.isDirectory()) walk(full);
            else if (/\.(ktr|kjb)$/i.test(e)) files.push({ path: fwd(relative(outDir, full)), content: readFileSync(full, 'utf-8') });
          }
        };
        if (existsSync(outDir)) walk(outDir);
      } catch (e) { log += `\n[collect] ${(e as Error).message}`; }
      try { rmSync(work, { recursive: true, force: true }); } catch {}
      const ok = code === 0;
      res.json({ ok, files, log, ...(ok ? {} : { error: `Generator exited with code ${code}.` }) });
    });
  } catch (e) {
    try { rmSync(work, { recursive: true, force: true }); } catch {}
    res.status(500).json({ ok: false, files: [], log: '', error: (e as Error).message });
  }
});

app.get('/api/contract/schema', (_req, res) => {
  res.json(contractSchema);
});

// ---------------------------------------------------------------------------
// Enumeration catalog + training sources
// ---------------------------------------------------------------------------

app.get('/api/enum-catalog', (_req, res) => {
  const { rows, source } = readCatalogRows();
  const withDesigned = rows.map((r) => ({ ...r, designed: existsSync(enumFile(r.enumeration)) }));
  res.json({ rows: withDesigned, source });
});

app.get('/api/enumerations/:name', (req, res) => {
  const file = enumFile(req.params.name);
  if (!existsSync(file)) {
    res.status(404).json({ error: `No design for "${req.params.name}".` });
    return;
  }
  try {
    const design = YAML.parse(readFileSync(file, 'utf-8'));
    res.json(design);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/enumerations/:name', (req, res) => {
  const design = req.body as Enumeration;
  if (!design || design.kind !== 'enumeration') {
    res.status(400).json({ error: 'Body must be an enumeration design.' });
    return;
  }
  ensureStoreDir();
  const name = design.name || req.params.name;
  const file = enumFile(name);
  writeFileSync(file, YAML.stringify(design), 'utf-8');
  // Keep the catalog in sync so freshly designed enums appear in the list.
  upsertEnumCatalog({
    enumType: design.enumTypeFilter || name,
    kjb: '',
    enumeration: name,
    yaml: safeYamlName(name),
  });
  res.json({ saved: true, file });
});

/** Remove an enumeration row from _catalog.yaml (keeps the design file on disk). */
app.delete('/api/enum-catalog/:enumeration', (req, res) => {
  const target = req.params.enumeration.toLowerCase();
  const { rows } = readCatalogRows();
  const next = rows.filter((r) => r.enumeration.toLowerCase() !== target);
  if (next.length === rows.length) {
    res.status(404).json({ error: `No catalog row for "${req.params.enumeration}".` });
    return;
  }
  writeCatalogYaml(next);
  res.json({ deleted: true, remaining: next.length });
});

// ---------------------------------------------------------------------------
// Generic dimension / fact catalog + design library
// ---------------------------------------------------------------------------

app.get('/api/catalog/:kind', (req, res) => {
  const { kind } = req.params;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unsupported kind "${kind}".` });
    return;
  }
  const rows = readEntityCatalog(kind).map((r) => ({
    ...r,
    designed: existsSync(entityDesignFile(kind, r.name)),
  }));
  res.json({ rows, source: `data/${kind === 'dimension' ? 'dimensions' : 'facts'}/_catalog.yaml` });
});

app.get('/api/entities/:kind/:name', (req, res) => {
  const { kind, name } = req.params;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unsupported kind "${kind}".` });
    return;
  }
  const file = entityDesignFile(kind, name);
  if (!existsSync(file)) {
    res.status(404).json({ error: `No ${kind} design for "${name}".` });
    return;
  }
  try {
    res.json(YAML.parse(readFileSync(file, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/entities/:kind/:name', (req, res) => {
  const { kind } = req.params;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unsupported kind "${kind}".` });
    return;
  }
  const design = req.body as AnyEntity;
  if (!design || design.kind !== kind) {
    res.status(400).json({ error: `Body must be a ${kind} design.` });
    return;
  }
  ensureEntityStoreDir(kind);
  const name = design.name || req.params.name;
  const file = entityDesignFile(kind, name);
  writeFileSync(file, YAML.stringify(design), 'utf-8');
  upsertEntityCatalog(kind, {
    name,
    displayName: design.displayName,
    table: name,
    yaml: safeYamlName(name),
  });
  res.json({ saved: true, file });
});

/** Remove a dimension/fact row from its _catalog.yaml (keeps the design file). */
app.delete('/api/catalog/:kind/:name', (req, res) => {
  const { kind, name } = req.params;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unsupported kind "${kind}".` });
    return;
  }
  const rows = readEntityCatalog(kind);
  const next = rows.filter((r) => r.name.toLowerCase() !== name.toLowerCase());
  if (next.length === rows.length) {
    res.status(404).json({ error: `No catalog row for "${name}".` });
    return;
  }
  writeEntityCatalog(kind, next);
  res.json({ deleted: true, remaining: next.length });
});

// ---------------------------------------------------------------------------
// Support-table library (dw_* / *_nc) — catalog, YAML store & DB introspection
// ---------------------------------------------------------------------------

app.get('/api/support-tables', (_req, res) => {
  const rows = readSupportCatalog().map((r) => ({
    ...r,
    tableKind: r.tableKind ?? classifySupportKind(r.name),
    designed: existsSync(supportDesignFile(r.name)),
  }));
  res.json({ rows, source: 'data/support/_catalog.yaml' });
});

app.get('/api/support-tables/:name', (req, res) => {
  const file = supportDesignFile(req.params.name);
  if (!existsSync(file)) {
    res.status(404).json({ error: `No support table design for "${req.params.name}".` });
    return;
  }
  try {
    res.json(YAML.parse(readFileSync(file, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/support-tables/:name', (req, res) => {
  const design = req.body as { kind?: string; name?: string; displayName?: string; tableKind?: string };
  if (!design || design.kind !== 'support') {
    res.status(400).json({ error: 'Body must be a support table (kind: "support").' });
    return;
  }
  ensureSupportDir();
  const name = design.name || req.params.name;
  const file = supportDesignFile(name);
  writeFileSync(file, YAML.stringify(design), 'utf-8');
  upsertSupportCatalog({
    name,
    displayName: design.displayName,
    tableKind: design.tableKind ?? classifySupportKind(name),
    yaml: safeYamlName(name),
  });
  res.json({ saved: true, file });
});

app.delete('/api/support-tables/:name', (req, res) => {
  const rows = readSupportCatalog();
  const next = rows.filter((r) => r.name.toLowerCase() !== req.params.name.toLowerCase());
  if (next.length === rows.length) {
    res.status(404).json({ error: `No support table "${req.params.name}".` });
    return;
  }
  writeSupportCatalog(next);
  res.json({ deleted: true, remaining: next.length });
});

/** List physical tables from the configured DB, filtered to support tables by default. */
app.post('/api/db/tables', async (req, res) => {
  const { filter, all } = (req.body ?? {}) as { filter?: string; all?: boolean };
  const db = effectiveDb((req.body?.db as AppConfig['db']) ?? loadConfig().db);
  try {
    const rows = await withConnection(db, async (conn) => {
      const [result] = await conn.query(
        `SELECT TABLE_NAME FROM information_schema.tables
          WHERE table_schema = ? ORDER BY TABLE_NAME`,
        [db.name],
      );
      return result as Record<string, unknown>[];
    });
    let names = rows.map((r) => String(r.TABLE_NAME));
    if (!all) names = names.filter(isSupportTableName);
    if (filter) {
      const f = filter.toLowerCase();
      names = names.filter((n) => n.toLowerCase().includes(f));
    }
    res.json({
      tables: names.map((name) => ({ name, tableKind: classifySupportKind(name) })),
      count: names.length,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, tables: [], count: 0 });
  }
});

/** Return the physical columns of a single table from the configured DB. */
app.post('/api/db/columns', async (req, res) => {
  const { table } = (req.body ?? {}) as { table?: string };
  if (!table) {
    res.status(400).json({ error: 'table is required.', columns: [] });
    return;
  }
  const db = effectiveDb((req.body?.db as AppConfig['db']) ?? loadConfig().db);
  try {
    const rows = await withConnection(db, async (conn) => {
      const [result] = await conn.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT, COLUMN_COMMENT
           FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?
          ORDER BY ORDINAL_POSITION`,
        [db.name, table],
      );
      return result as Record<string, unknown>[];
    });
    res.json({ table, columns: sourceColumnsFromInformationSchema(rows), count: rows.length });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, columns: [] });
  }
});

/**
 * Training: discover enumerations from the catalog (and, when reachable, the live
 * warehouse) and (re)generate the YAML library — a per-enum design plus _catalog.yaml.
 */
app.post('/api/train/enumerations', async (_req, res) => {
  const { rows } = readCatalogRows();
  if (rows.length === 0) {
    res.status(404).json({ error: 'No catalog rows to train from.', generated: 0 });
    return;
  }

  const errors: string[] = [];
  let columnsSource: 'db' | 'template' = 'template';
  let conn: import('mysql2/promise').Connection | null = null;
  const db = loadConfig().db;
  if (db.host && db.user && db.name) {
    try {
      const mysql = await import('mysql2/promise');
      conn = await mysql.createConnection({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        database: db.name,
        connectTimeout: 8000,
      });
      columnsSource = 'db';
    } catch (err) {
      errors.push(`DB unavailable, using template columns: ${(err as Error).message}`);
    }
  }

  ensureStoreDir();
  let generated = 0;
  for (const row of rows) {
    if (!row.enumeration) continue;
    let dbColumns: Column[] | undefined;
    if (conn) {
      try {
        const [result] = await conn.query(
          `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT
             FROM information_schema.columns
            WHERE table_schema = ? AND table_name = ?
            ORDER BY ORDINAL_POSITION`,
          [db.name, row.enumeration],
        );
        const cols = result as Record<string, unknown>[];
        if (cols.length) dbColumns = columnsFromInformationSchema(cols);
      } catch (err) {
        errors.push(`${row.enumeration}: ${(err as Error).message}`);
      }
    }
    const design = buildEnumerationDesign(row, dbColumns);
    writeFileSync(enumFile(row.enumeration), YAML.stringify(design), 'utf-8');
    generated += 1;
  }

  if (conn) await conn.end();
  writeCatalogYaml(rows);

  res.json({
    generated,
    columnsSource,
    catalogFile: 'data/enumerations/_catalog.yaml',
    storeDir: 'data/enumerations',
    errors,
  });
});

app.get('/api/config', (_req, res) => {
  const cfg = loadConfig();
  // Never expose the stored password to the client.
  res.json({ ...cfg, db: { ...cfg.db, password: '' } });
});

app.post('/api/config', (req, res) => {
  const incoming = req.body as AppConfig;
  if (!incoming || !incoming.db) {
    res.status(400).json({ error: 'Invalid config payload.' });
    return;
  }
  const current = loadConfig();
  const merged: AppConfig = {
    db: {
      ...current.db,
      ...incoming.db,
      // keep the saved password when the client sends an empty one
      password: incoming.db.password ? incoming.db.password : current.db.password,
    },
    etl: { ...current.etl, ...incoming.etl },
    catalog: { ...current.catalog, ...incoming.catalog },
    etlBuilder: { ...current.etlBuilder, ...incoming.etlBuilder },
  };
  writeConfig(merged);
  res.json({ saved: true });
});

/** Merge an incoming db payload with the stored config (password fallback). */
function effectiveDb(incoming: AppConfig['db']): AppConfig['db'] {
  const stored = loadConfig().db;
  return {
    host: incoming.host || stored.host,
    name: incoming.name || stored.name,
    user: incoming.user || stored.user,
    port: incoming.port || stored.port,
    password: incoming.password ? incoming.password : stored.password,
  };
}

async function withConnection<T>(
  db: AppConfig['db'],
  fn: (conn: import('mysql2/promise').Connection) => Promise<T>,
): Promise<T> {
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
    connectTimeout: 8000,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

app.post('/api/train/db-test', async (req, res) => {
  const db = effectiveDb(req.body as AppConfig['db']);
  try {
    await withConnection(db, async (conn) => conn.query('SELECT 1'));
    res.json({ ok: true, message: `Connected to ${db.name}@${db.host}.` });
  } catch (err) {
    res.json({ ok: false, message: `Connection failed: ${(err as Error).message}` });
  }
});

app.post('/api/train/db-enumerations', async (req, res) => {
  const db = effectiveDb(req.body as AppConfig['db']);
  try {
    const rows = await withConnection(db, async (conn) => {
      const [result] = await conn.query(
        "SELECT * FROM initial_load_require_nc WHERE OLTP_TABLE = 'ENUMERATION'",
      );
      return result as Record<string, unknown>[];
    });
    res.json({ rows, count: rows.length });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, rows: [], count: 0 });
  }
});

app.post('/api/train/etl-scan', (req, res) => {
  const { path } = req.body as { path?: string };
  if (!path) {
    res.status(400).json({ error: 'path is required.', scanned: 0, enumerations: [] });
    return;
  }
  if (!existsSync(path)) {
    res.status(404).json({ error: `Path not found: ${path}`, scanned: 0, enumerations: [] });
    return;
  }
  try {
    const ktrFiles: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 6) return;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        let s;
        try {
          s = statSync(full);
        } catch {
          continue;
        }
        if (s.isDirectory()) walk(full, depth + 1);
        else if (entry.toLowerCase().endsWith('.ktr')) ktrFiles.push(full);
      }
    };
    walk(path, 0);

    const enumerations: { enumType: string; file: string }[] = [];
    const rx = /enum_type\s*(?:=|like|in)?\s*[=']?\s*'?([A-Za-z0-9_.]+)'?/i;
    for (const file of ktrFiles) {
      let content = '';
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      if (!/enum_type/i.test(content)) continue;
      const m = content.match(rx);
      enumerations.push({ enumType: m ? m[1] : '(unknown)', file });
    }
    res.json({ scanned: ktrFiles.length, enumerations });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, scanned: 0, enumerations: [] });
  }
});

const PORT = Number(process.env.PORT ?? 5177);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`vcdw-designer server listening on http://localhost:${PORT}`);
});
