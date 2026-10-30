import { describe, it, expect } from 'vitest';
import { stagingDdl } from '../sqlGenerator';
import { newFact } from '../templates';

describe('stagingDdl quarantine columns', () => {
  it('error table carries quarantine columns; staging does not', () => {
    const f = newFact('dw_asset_fact'); // stagingTable=asset_fact_stg, errorTable=asset_fact_stg_error
    const out = stagingDdl(f, 'MemSQL').join('\n');
    // error table block
    expect(out).toMatch(/asset_fact_stg_error[\s\S]*STG_ERROR_ID/);
    expect(out).toMatch(/ERROR_RESYNC_COUNT/);
    expect(out).toMatch(/ERROR_PENALTY_COUNT/);
    expect(out).toMatch(/ERROR_FEEDBACK_COUNT/);
    expect(out).toMatch(/ERROR_MAP_VALUES/);
  });
});
