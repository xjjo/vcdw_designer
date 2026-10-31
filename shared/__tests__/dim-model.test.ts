import { describe, it, expect } from 'vitest';
import { newDimension } from '../templates';

describe('dimension type model', () => {
  it('newDimension defaults to simple type with nkUpdates off', () => {
    const d = newDimension('organization');
    expect(d.dimensionType).toBe('simple');
    expect(d.nkUpdates).toBe(false);
  });
});
