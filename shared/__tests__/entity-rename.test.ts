import { it, expect } from 'vitest';
import { renameEntity } from '../entityRename';
import { buildDeploymentPacket } from '../packet';
import {
  newDimension,
  newEnumerationFromCatalog,
  newFact,
  standardDimensionColumns,
  standardEnumColumns,
  standardFactColumns,
} from '../templates';
import type { AnyEntity, Dimension, Enumeration, Fact } from '../types';

function site(): Dimension {
  const d = newDimension('site');
  d.columns = standardDimensionColumns('site');
  d.requiresStaging = true;
  d.stgTable = 'site_stg';
  d.stgErrorTable = 'site_stg_error';
  d.sortKeys = ['SITE_KEY', 'OLTP_ID'];
  d.defaultRow = { SITE_KEY: '-1', OLTP_ID: '-1' };
  return d;
}

function assetFact(): Fact {
  const f = newFact('dw_asset_fact');
  f.columns = standardFactColumns('dw_asset_fact');
  f.primaryNcTable = 'asset_header_nc';
  return f;
}

it('enumeration: renames the name-derived key/name columns and keeps the ENUM_TYPE filter', () => {
  const e = newEnumerationFromCatalog('contract_type', 'OMS.ContractType');
  e.columns = standardEnumColumns('contract_type');
  const r = renameEntity(e, 'purchase_contract_type') as Enumeration;
  expect(r.name).toBe('purchase_contract_type');
  expect(r.columns.map((c) => c.name)).toEqual([
    'PURCHASE_CONTRACT_TYPE_KEY',
    'OLTP_ID',
    'PURCHASE_CONTRACT_TYPE_NAME',
    'ENUM_ENTRY_VALUE',
    'ENT_NAME',
  ]);
  expect(r.enumTypeFilter).toBe('OMS.ContractType');
  expect(e.name).toBe('contract_type');
  expect(e.columns[0].name).toBe('CONTRACT_TYPE_KEY');
});

it('dimension: renames SK column, surrogate key, staging tables, sort keys and default-row keys', () => {
  const r = renameEntity(site(), 'warehouse_site') as Dimension;
  expect(r.columns.map((c) => c.name)).toEqual(['WAREHOUSE_SITE_KEY', 'OLTP_ID']);
  expect(r.surrogateKey).toBe('WAREHOUSE_SITE_KEY');
  expect(r.naturalKey).toBe('OLTP_ID');
  expect(r.stgTable).toBe('warehouse_site_stg');
  expect(r.stgErrorTable).toBe('warehouse_site_stg_error');
  expect(r.sortKeys).toEqual(['WAREHOUSE_SITE_KEY', 'OLTP_ID']);
  expect(r.defaultRow).toEqual({ WAREHOUSE_SITE_KEY: '-1', OLTP_ID: '-1' });
  expect(r.sourceNcTables).toEqual(['site_nc']);
});

it('dimension: keeps custom values that do not follow the old name', () => {
  const d = site();
  d.surrogateKey = 'MY_KEY';
  d.stgTable = 'custom_stage';
  const r = renameEntity(d, 'warehouse_site') as Dimension;
  expect(r.surrogateKey).toBe('MY_KEY');
  expect(r.stgTable).toBe('custom_stage');
});

it('fact: renames staging/error tables and SK column using the base name without dw_', () => {
  const r = renameEntity(assetFact(), 'dw_asset_move_fact') as Fact;
  expect(r.stagingTable).toBe('asset_move_fact_stg');
  expect(r.errorTable).toBe('asset_move_fact_stg_error');
  expect(r.columns[0].name).toBe('ASSET_MOVE_FACT_KEY');
  expect(r.primaryNcTable).toBe('asset_header_nc');
});

it('renaming keystroke by keystroke (through an empty name) gives the same result', () => {
  let d: AnyEntity = site();
  for (const n of ['sit', 'si', 's', '', 'w', 'wh']) d = renameEntity(d, n);
  const r = d as Dimension;
  expect(r.surrogateKey).toBe('WH_KEY');
  expect(r.stgTable).toBe('wh_stg');
  expect(r.columns[0].name).toBe('WH_KEY');
});

it('deployment packets of renamed dimension and fact carry no old names', () => {
  const dimAll = buildDeploymentPacket(renameEntity(site(), 'warehouse_site'), 'MemSQL')
    .files.map((f) => `${f.path}\n${f.content}`)
    .join('\n');
  expect(dimAll).not.toMatch(/\bsite_stg|\bSITE_KEY\b|"dim_table": "site"|ddl\/site\.sql/);

  const factAll = buildDeploymentPacket(renameEntity(assetFact(), 'dw_asset_move_fact'), 'MemSQL')
    .files.map((f) => `${f.path}\n${f.content}`)
    .join('\n');
  expect(factAll).not.toMatch(/\basset_fact_stg|\bASSET_FACT_KEY\b|"fact_table": "dw_asset_fact"|ddl\/dw_asset_fact\.sql/);
});
