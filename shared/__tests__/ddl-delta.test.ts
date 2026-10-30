import { describe, it, expect } from 'vitest';
import { updateDeltaDdl } from '../sqlGenerator';
import { newFact } from '../templates';
import { standardFactColumns } from '../templates';

describe('updateDeltaDdl', () => {
  it('emits an update_delta table with OLTP_ID and shard key', () => {
    const f = newFact('dw_asset_fact');
    f.columns = standardFactColumns('dw_asset_fact');
    const sql = updateDeltaDdl(f, 'MemSQL');
    expect(sql).toMatch(/asset_fact_update_delta/);
    expect(sql).toMatch(/OLTP_ID/);
    expect(sql).toMatch(/SHARD KEY \(`?OLTP_ID`?\)/);
  });
});
