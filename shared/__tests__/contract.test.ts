import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { validateGeneratorDoc } from '../contract/validate';
import { entityToGenerator } from '../generatorMap';
import { newEnumeration, newFact } from '../templates';

describe('contract schema', () => {
  it('accepts a derived enumeration doc', () => {
    expect(validateGeneratorDoc(entityToGenerator(newEnumeration('load_type'))).valid).toBe(true);
  });
  it('accepts a derived fact doc', () => {
    expect(validateGeneratorDoc(entityToGenerator(newFact('dw_asset_fact'))).valid).toBe(true);
  });
  it('rejects a fact doc missing fact_table', () => {
    const r = validateGeneratorDoc({ type: 'fact', fact_name: 'x' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/fact_table/);
  });

  it('all persisted enumerations still produce valid docs', () => {
    const dir = resolve(__dirname, '../../server/data/enumerations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'));
    expect(files.length).toBeGreaterThan(50); // ~102 expected
    for (const f of files) {
      const e = YAML.parse(readFileSync(resolve(dir, f), 'utf-8'));
      expect(validateGeneratorDoc(entityToGenerator(e)).valid, f).toBe(true);
    }
  });
});
