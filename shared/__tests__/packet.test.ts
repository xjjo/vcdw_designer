import { describe, it, expect } from 'vitest';
import { buildDeploymentPacket } from '../packet';
import { newFact, standardFactColumns, newEnumeration, newDimension } from '../templates';

it('bundles a fact packet with ddl, control, mapping, INSTALL', () => {
  const f = newFact('dw_asset_fact');
  f.columns = standardFactColumns('dw_asset_fact');
  f.primaryNcTable = 'asset_header_nc';
  const pkt = buildDeploymentPacket(f, 'MemSQL');
  const paths = pkt.files.map((x) => x.path);
  expect(paths).toContain('generator.json');
  expect(paths).toContain('ddl/dw_asset_fact.sql');
  expect(paths).toContain('control/dw_asset_fact_inserts.sql');
  expect(paths).toContain('INSTALL.md');
  const ddl = pkt.files.find((x) => x.path === 'ddl/dw_asset_fact.sql')!.content;
  expect(ddl).toMatch(/asset_fact_stg_error/);
  expect(ddl).toMatch(/asset_fact_update_delta/);
});
it('an enum packet has no stg/mapping files', () => {
  const pkt = buildDeploymentPacket(newEnumeration('load_type'), 'MemSQL');
  const paths = pkt.files.map((x) => x.path);
  expect(paths).toContain('control/load_type_inserts.sql');
  expect(paths.some((p) => p.startsWith('mapping/'))).toBe(false);
});
it('a dimension using sourceNcTables gets nc DDL + mapping CSV', () => {
  const d = newDimension('organization'); // sourceNcTables=['organization_nc'], no netChange
  const pkt = buildDeploymentPacket(d, 'MemSQL');
  const paths = pkt.files.map((x) => x.path);
  expect(paths).toContain('mapping/organization_nc.csv');
  const ddl = pkt.files.find((x) => x.path === 'ddl/organization.sql')!.content;
  expect(ddl).toMatch(/organization_nc/);
});
