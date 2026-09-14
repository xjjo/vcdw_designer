import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import cors from 'cors';
import express from 'express';

import type { AnyEntity, DesignModel } from '../../shared/types.js';
import { buildSeedModel } from '../../shared/seed.js';
import { generateModelSql, generateEntitySql } from '../../shared/sqlGenerator.js';
import { entityToGenerator } from '../../shared/generatorMap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const MODEL_FILE = join(DATA_DIR, 'model.json');

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
  res.json(mapped);
});

const PORT = Number(process.env.PORT ?? 5177);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`vcdw-designer server listening on http://localhost:${PORT}`);
});
