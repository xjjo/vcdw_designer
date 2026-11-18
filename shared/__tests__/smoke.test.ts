import { describe, it, expect } from 'vitest';
import { newEnumeration } from '../templates';

describe('shared harness', () => {
  it('constructs an enumeration', () => {
    expect(newEnumeration('load_type').kind).toBe('enumeration');
  });
});
