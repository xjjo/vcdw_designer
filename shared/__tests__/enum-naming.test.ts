import { it, expect } from 'vitest';
import {
  isStandardEnumCondition,
  enumTypeCondition,
  enumNetChangeCondition,
  withEnumTypeFilter,
  stripLegacyEnumOverrides,
} from '../enumNaming';
import { newEnumerationFromCatalog } from '../templates';
import type { Enumeration } from '../types';

function sampleEnum(): Enumeration {
  const e = newEnumerationFromCatalog('purchase_contract_type', 'OMS.PurchaseContractType');
  e.enumTable = 'contract_type';
  e.fieldKey = 'CONTRACT_TYPE_KEY';
  e.fieldName = 'CONTRACT_TYPE_NAME';
  return e;
}

it('recognizes only the plain enum_type=\'...\' condition as standard', () => {
  expect(isStandardEnumCondition("enum_type='OMS.ContractType'")).toBe(true);
  expect(isStandardEnumCondition("  ENUM_TYPE = 'x'  ")).toBe(true);
  expect(isStandardEnumCondition("enum_type='x' AND hidden=0")).toBe(false);
  expect(isStandardEnumCondition('1=1')).toBe(false);
  expect(isStandardEnumCondition(undefined)).toBe(false);
  expect(isStandardEnumCondition('')).toBe(false);
});

it('builds the condition from the filter, falling back to the name when the filter is empty', () => {
  expect(enumTypeCondition({ name: 'n', enumTypeFilter: 'OMS.X' })).toBe("enum_type='OMS.X'");
  expect(enumTypeCondition({ name: 'n', enumTypeFilter: '' })).toBe("enum_type='n'");
  expect(enumTypeCondition({ name: 'n' })).toBe("enum_type='n'");
});

it('enumNetChangeCondition replaces a stale standard condition and keeps custom ones', () => {
  const e = sampleEnum();
  const nc = e.netChange![0];
  expect(enumNetChangeCondition(e, { ...nc, condition: "enum_type='OMS.ContractType'" })).toBe(
    "enum_type='OMS.PurchaseContractType'",
  );
  expect(enumNetChangeCondition(e, { ...nc, condition: '1=1' })).toBe('1=1');
  expect(enumNetChangeCondition(e, { ...nc, condition: undefined })).toBe('');
});

it('withEnumTypeFilter sets the filter, rewrites standard conditions only, and does not mutate', () => {
  const e = sampleEnum();
  e.netChange = [
    { ...e.netChange![0], id: 'a', condition: "enum_type='OMS.ContractType'" },
    { ...e.netChange![0], id: 'b', condition: "enum_type='OMS.ContractType' AND hidden=0" },
  ];
  const next = withEnumTypeFilter(e, 'OMS.Other');
  expect(next.enumTypeFilter).toBe('OMS.Other');
  expect(next.netChange!.map((n) => n.condition)).toEqual([
    "enum_type='OMS.Other'",
    "enum_type='OMS.ContractType' AND hidden=0",
  ]);
  expect(e.enumTypeFilter).toBe('OMS.PurchaseContractType');
  expect(e.netChange![0].condition).toBe("enum_type='OMS.ContractType'");
});

it('stripLegacyEnumOverrides removes enumTable/fieldKey/fieldName and keeps the rest', () => {
  const e = sampleEnum();
  const clean = stripLegacyEnumOverrides(e);
  expect('enumTable' in clean).toBe(false);
  expect('fieldKey' in clean).toBe(false);
  expect('fieldName' in clean).toBe(false);
  expect(clean.name).toBe('purchase_contract_type');
  expect(clean.enumTypeFilter).toBe('OMS.PurchaseContractType');
  expect(e.enumTable).toBe('contract_type');
});
