import { describe, it, expect } from 'vitest';
import { ncTableDdl } from '../sqlGenerator';

describe('ncTableDdl', () => {
  it('emits an NC table with CDC control columns', () => {
    const sql = ncTableDdl({
      id: '1', ncTable: 'asset_nc', oltpTableSysId: 'SYS_ASSET_ID',
      columns: [{ id: 'c1', name: 'SYS_ASSET_ID', type: 'BIGINT' }, { id: 'c2', name: 'asset_number', type: 'VARCHAR(64)' }],
    } as any, 'MemSQL');
    expect(sql).toMatch(/CREATE TABLE .*asset_nc/);
    expect(sql).toMatch(/ES_LMD/);
    expect(sql).toMatch(/RECONCILED/);
    expect(sql).toMatch(/DIM_OR_FACT_TABLE/);
    expect(sql).toMatch(/SHARD KEY \(`?SYS_ASSET_ID`?\)/);
  });
});
