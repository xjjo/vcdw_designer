import { describe, it, expect } from 'vitest';
import { dimensionControlInserts } from '../configInserts';
import { newDimension } from '../templates';
import { uid } from '../templates';

it('emits uppercase mapping/enabler/oltp + one NULL require_nc per source', () => {
  const d = newDimension('site');
  d.netChange = [
    { id: uid('nc'), role: 'netchange', ncTable: 'site_nc', oltpTable: 'site' } as any,
    { id: uid('nc'), role: 'netchange', ncTable: 'site_addr_nc', oltpTable: 'site_addr' } as any,
  ];
  const sql = dimensionControlInserts(d);
  expect(sql).toMatch(/INSERT INTO dw_table_and_dimension_mapping/);
  expect(sql).toMatch(/INSERT INTO dw_dimension_enabler_config/);
  expect(sql).toMatch(/INSERT INTO dw_oltp_tables_mapping/);
  // one mapping row per source, uppercase dw copy tables.
  expect(sql).toMatch(/'DW_SITE'/);
  expect(sql).toMatch(/'DW_SITE_ADDR'/);
  // logical name is uppercase.
  expect(sql).toMatch(/'SITE'/);
  // one require_nc row per source, each with a NULL last_extracted.
  const requireRows = sql.match(/INSERT INTO require_nc [^\n]*/g) ?? [];
  expect(requireRows.length).toBe(2);
  for (const row of requireRows) expect(row).toMatch(/, NULL\);$/);
  expect((sql.match(/INSERT INTO initial_load_require_nc /g) ?? []).length).toBe(2);
  expect((sql.match(/INSERT INTO incremental_load_require_nc /g) ?? []).length).toBe(2);
});
