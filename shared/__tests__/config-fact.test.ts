import { describe, it, expect } from 'vitest';
import { factControlInserts } from '../configInserts';
import { newFact } from '../templates';

it('emits uppercase fact enabler/mapping/job_task_mapping + require_nc per NC source', () => {
  const f = newFact('dw_asset_fact');
  f.primaryNcTable = 'asset_header_nc';
  f.secondaryNcTables = ['asset_line_nc'];
  const sql = factControlInserts(f);
  expect(sql).toMatch(/INSERT INTO dw_fact_enabler_config/);
  // one fact mapping row per source, uppercase dw copy tables.
  expect(sql).toMatch(/INSERT INTO dw_table_and_fact_mapping/);
  expect(sql).toMatch(/'DW_ASSET_HEADER'/);
  expect(sql).toMatch(/'DW_ASSET_LINE'/);
  // job_task_mapping: uppercase fact_name + NULL id placeholder.
  const jobRow = (sql.match(/INSERT INTO job_task_mapping [^\n]*/) ?? [''])[0];
  expect(jobRow).toMatch(/'ASSET_FACT'/);
  expect(jobRow).toMatch(/NULL/);
  expect((sql.match(/INSERT INTO require_nc /g) ?? []).length).toBe(2);
});
