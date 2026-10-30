import { describe, it, expect } from 'vitest';
import { enumControlInserts } from '../configInserts';
import { newEnumeration } from '../templates';

it('emits mapping + enabler, no require_nc for an enum', () => {
  const sql = enumControlInserts(newEnumeration('load_type'));
  expect(sql).toMatch(/INSERT INTO dw_table_and_dimension_mapping/);
  expect(sql).toMatch(/INSERT INTO dw_dimension_enabler_config/);
  expect(sql).not.toMatch(/require_nc/);
});
