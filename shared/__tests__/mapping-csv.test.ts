import { describe, it, expect } from 'vitest';
import { ncMappingCsv, enableMappingCsv } from '../mappingCsv';
import type { Column, NetChangeSource } from '../types';

const src: NetChangeSource = { id: '1', ncTable: 'asset_nc', alias: 'a' } as any;
const cols: Column[] = [
  { id: '1', name: 'OLTP_ID', type: 'BIGINT', sourceColumn: 'sys_asset_id', sourceTable: 'a' } as any,
  { id: '2', name: 'ASSET_NUMBER', type: 'VARCHAR(64)', sourceColumn: 'asset_number', sourceTable: 'a' } as any,
];
it('emits DBFieldName,StreamFieldName rows', () => {
  const csv = ncMappingCsv(src, cols);
  expect(csv.fileName).toBe('asset_nc.csv');
  expect(csv.content.split('\n')[0]).toBe('DBFieldName,StreamFieldName');
  expect(csv.content).toMatch(/sys_asset_id,OLTP_ID/);
});
it('enable_mapping marks each NC table Y', () => {
  const csv = enableMappingCsv([src]);
  expect(csv.fileName).toBe('enable_mapping.csv');
  expect(csv.content).toMatch(/asset_nc,Y/);
});
