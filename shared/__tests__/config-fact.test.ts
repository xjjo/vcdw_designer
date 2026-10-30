import { describe, it, expect } from 'vitest';
import { factControlInserts } from '../configInserts';
import { newFact } from '../templates';

it('emits fact enabler/mapping/job_task_mapping + require_nc per NC source', () => {
  const f = newFact('dw_asset_fact');
  f.primaryNcTable = 'asset_header_nc';
  f.secondaryNcTables = ['asset_line_nc'];
  const sql = factControlInserts(f);
  expect(sql).toMatch(/INSERT INTO dw_fact_enabler_config/);
  expect(sql).toMatch(/INSERT INTO dw_table_and_fact_mapping/);
  expect(sql).toMatch(/INSERT INTO job_task_mapping/);
  expect((sql.match(/INSERT INTO require_nc/g) ?? []).length).toBe(2);
});
