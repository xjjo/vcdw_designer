import { describe, it, expect } from 'vitest';
import { mapSourceTables, mapJoins } from '../generatorMap';

describe('source tables + joins', () => {
  it('maps a support source table', () => {
    expect(mapSourceTables([{ id: '1', role: 'support', ncTable: 'enterprise', alias: 'e' }]))
      .toEqual([{ name: 'enterprise', alias: 'e', role: 'support', columns: [] }]);
  });
  it('maps a join with ON conditions', () => {
    const [j] = mapJoins([{ id: 'j1', leftTable: 'sh', leftAlias: 'sh', rightTable: 'org', rightAlias: 'o',
      joinType: 'LEFT', onConditions: [{ left: 'sh.org_id', op: '=', right: 'o.OLTP_ID' }] }]);
    expect(j).toMatchObject({ left_table: 'sh', right_alias: 'o', join_type: 'LEFT' });
    expect(j.on).toEqual([{ left: 'sh.org_id', op: '=', right: 'o.OLTP_ID' }]);
  });
});
