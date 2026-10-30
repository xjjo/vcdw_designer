import { describe, it, expect } from 'vitest';
import { dimensionControlInserts } from '../configInserts';
import { newDimension } from '../templates';
import { uid } from '../templates';

it('emits mapping/enabler/oltp + one require_nc per source', () => {
  const d = newDimension('site');
  d.netChange = [
    { id: uid('nc'), role: 'netchange', ncTable: 'site_nc', oltpTable: 'site' } as any,
    { id: uid('nc'), role: 'netchange', ncTable: 'site_addr_nc', oltpTable: 'site_addr' } as any,
  ];
  const sql = dimensionControlInserts(d);
  expect(sql).toMatch(/INSERT INTO dw_table_and_dimension_mapping/);
  expect(sql).toMatch(/INSERT INTO dw_dimension_enabler_config/);
  expect(sql).toMatch(/INSERT INTO dw_oltp_tables_mapping/);
  expect((sql.match(/INSERT INTO require_nc/g) ?? []).length).toBe(2);
  expect((sql.match(/INSERT INTO initial_load_require_nc/g) ?? []).length).toBe(2);
});
