import { describe, it, expect } from 'vitest';
import { designToYaml, designFromYaml, designToGeneratorJson } from '../contract/io';
import { newEnumeration } from '../templates';

describe('design IO', () => {
  it('round-trips a design through YAML', () => {
    const e = newEnumeration('load_type');
    expect(designFromYaml(designToYaml(e))).toEqual(e);
  });
  it('emits generator JSON with the mapped type', () => {
    const doc = JSON.parse(designToGeneratorJson(newEnumeration('load_type')));
    expect(doc.type).toBe('enumeration');
  });
});
