import { describe, it, expect } from 'vitest';
import { dimensionToGenerator, entityToGenerator } from '../generatorMap';
import { newDimension } from '../templates';
import { validateGeneratorDoc } from '../contract/validate';

describe('dimension generator contract extras', () => {
  it('emits dimension_type + nk_updates + has_unknown_row and stays valid', () => {
    const d = newDimension('site');
    d.dimensionType = 'staged';
    d.nkUpdates = true;
    const doc: any = dimensionToGenerator(d);
    expect(doc.dimension_type).toBe('staged');
    expect(doc.nk_updates).toBe(true);
    expect(doc).toHaveProperty('default_row');
    expect(Array.isArray(doc.source_tables)).toBe(true);
    expect(validateGeneratorDoc(entityToGenerator(d)).valid).toBe(true);
  });
});
