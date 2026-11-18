import { it, expect } from 'vitest';
import { enumerationToGenerator } from '../generatorMap';
import { enumControlInserts } from '../configInserts';
import { buildDeploymentPacket } from '../packet';
import { newEnumerationFromCatalog } from '../templates';
import type { Column, Enumeration } from '../types';

function enumColumns(prefix: string): Column[] {
  return [
    { id: 'c1', name: `${prefix}_KEY`, type: 'BIGINT', nullable: false, isPk: true, isSk: true, autoIncrement: true, mappingKind: 'generated' },
    { id: 'c2', name: 'OLTP_ID', type: 'BIGINT', nullable: false, isNaturalKey: true, sourceColumn: 'sys_enum_id', mappingKind: 'direct', sourceTable: 'en' },
    { id: 'c3', name: `${prefix}_NAME`, type: 'VARCHAR(256)', nullable: false, sourceColumn: 'enum_entry_name', mappingKind: 'direct', sourceTable: 'en' },
  ];
}

/** contract_type duplicated and renamed in the UI (General + Columns tabs), legacy fields still present. */
function duplicatedPurchaseContractType(): Enumeration {
  const original = newEnumerationFromCatalog('contract_type', 'OMS.ContractType');
  original.columns = enumColumns('CONTRACT_TYPE');
  original.enumTable = 'contract_type';
  original.fieldKey = 'CONTRACT_TYPE_KEY';
  original.fieldName = 'CONTRACT_TYPE_NAME';
  const dup: Enumeration = JSON.parse(JSON.stringify(original));
  dup.name = 'purchase_contract_type';
  dup.enumTypeFilter = 'OMS.PurchaseContractType';
  dup.columns = enumColumns('PURCHASE_CONTRACT_TYPE');
  return dup;
}

const OLD_NAMES = /\bCONTRACT_TYPE_(KEY|NAME)\b|"contract_type"|OMS\.ContractType/;

it('generator JSON follows the renamed physical name, columns and ENUM_TYPE filter', () => {
  const g = enumerationToGenerator(duplicatedPurchaseContractType());
  expect(g.table).toBe('purchase_contract_type');
  expect(g.enum_type).toBe('OMS.PurchaseContractType');
  expect(g.field_key).toBe('PURCHASE_CONTRACT_TYPE_KEY');
  expect(g.field_name).toBe('PURCHASE_CONTRACT_TYPE_NAME');
  expect(g.netchange.map((n) => n.condition)).toEqual(["enum_type='OMS.PurchaseContractType'"]);
  expect(JSON.stringify(g)).not.toMatch(OLD_NAMES);
});

it('keeps a custom (non enum_type) net-change condition untouched', () => {
  const e = duplicatedPurchaseContractType();
  e.netChange![0].condition = '1=1';
  expect(enumerationToGenerator(e).netchange[0].condition).toBe('1=1');
});

it('control inserts register the renamed table', () => {
  const sql = enumControlInserts(duplicatedPurchaseContractType());
  expect(sql).toMatch(/'PURCHASE_CONTRACT_TYPE'/);
  expect(sql).not.toMatch(/'CONTRACT_TYPE'/);
});

it('deployment packet file names and contents use the new name', () => {
  const pkt = buildDeploymentPacket(duplicatedPurchaseContractType(), 'MemSQL');
  const paths = pkt.files.map((f) => f.path);
  expect(paths).toContain('ddl/purchase_contract_type.sql');
  expect(paths).toContain('control/purchase_contract_type_inserts.sql');
  const all = pkt.files.map((f) => f.content).join('\n');
  expect(all).not.toMatch(OLD_NAMES);
});
