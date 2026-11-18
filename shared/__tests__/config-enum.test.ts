import { describe, it, expect } from 'vitest';
import { enumControlInserts } from '../configInserts';
import { newEnumeration } from '../templates';

it('emits uppercase mapping + enabler, no require_nc for an enum', () => {
  const sql = enumControlInserts(newEnumeration('load_type'));
  // mapping row carries the uppercase logical name + shared dw copy table.
  expect(sql).toMatch(
    /INSERT INTO dw_table_and_dimension_mapping \(DIMENSION_NAME, DW_TABLE_NAME\) VALUES \('LOAD_TYPE', 'DW_ENUMERATION'\);/,
  );
  expect(sql).toMatch(/'LOAD_TYPE'/);
  expect(sql).toMatch(/'DW_ENUMERATION'/);
  // enabler row is (U(logical), 1).
  expect(sql).toMatch(
    /INSERT INTO dw_dimension_enabler_config \(DIMENSION_NAME, IS_ENABLE\) VALUES \('LOAD_TYPE', 1\);/,
  );
  expect(sql).not.toMatch(/require_nc/);
});
