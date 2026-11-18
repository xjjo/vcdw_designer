import { describe, it, expect } from 'vitest';
import { CONTROL_TABLES } from '../contract/controlTables';

describe('control-table fixtures', () => {
  it('encodes the dimension mapping signature verbatim', () => {
    const t = CONTROL_TABLES.find((c) => c.table === 'dw_table_and_dimension_mapping');
    expect(t?.columns).toEqual(['DIMENSION_NAME', 'DW_TABLE_NAME']);
    expect(t?.populateFile).toBe('populate_dw_table_and_dimension_mapping.sql');
    expect(t?.forKinds).toContain('enumeration');
    expect(t?.forKinds).toContain('dimension');
  });

  it('registers every control table with a non-empty column list', () => {
    expect(CONTROL_TABLES.length).toBeGreaterThanOrEqual(10);
    for (const t of CONTROL_TABLES) expect(t.columns.length, t.table).toBeGreaterThan(0);
  });
});
