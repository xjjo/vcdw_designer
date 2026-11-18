import { describe, it, expect } from 'vitest';
import { mapAllFields } from '../generatorMap';
import type { Column } from '../types';

const col = (p: Partial<Column> & { name: string; type: string }): Column =>
  ({ id: p.name, nullable: true, ...p });

describe('mapAllFields', () => {
  it('marks a direct column as role=attribute', () => {
    const [f] = mapAllFields([col({ name: 'STATUS', type: 'VARCHAR(64)', sourceColumn: 'status' })]);
    expect(f).toMatchObject({ name: 'status', new_name: '', role: 'attribute' });
  });
  it('emits calculated columns with a formula', () => {
    const out = mapAllFields([col({ name: 'TRANSIT_DAYS', type: 'DECIMAL(10,2)', isCalculated: true, mappingKind: 'calculated', formula: 'DATEDIFF(day, a, b)' })]);
    expect(out[0]).toMatchObject({ role: 'calculated', formula: 'DATEDIFF(day, a, b)' });
  });
  it('emits constant columns with constant_value', () => {
    const out = mapAllFields([col({ name: 'SRC', type: 'VARCHAR(8)', mappingKind: 'constant', constantValue: 'VCDW' })]);
    expect(out[0]).toMatchObject({ role: 'constant', constant_value: 'VCDW' });
  });
  it('marks measures as role=measure', () => {
    const out = mapAllFields([col({ name: 'WEIGHT', type: 'DOUBLE', isMeasure: true, sourceColumn: 'weight' })]);
    expect(out[0].role).toBe('measure');
  });
  it('excludes audit columns', () => {
    const out = mapAllFields([col({ name: 'DW_CREATED', type: 'DATETIME(6)', auditRole: 'created' })]);
    expect(out).toHaveLength(0);
  });
  it('excludes a non-derived column with no sourceColumn', () => {
    const out = mapAllFields([col({ name: 'NOTE', type: 'VARCHAR(64)' })]);
    expect(out).toHaveLength(0);
  });
});
