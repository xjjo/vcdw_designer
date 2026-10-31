import { describe, it, expect } from 'vitest';
import { buildDeploymentPacket } from '../packet';
import { newDimension, newFact, standardDimensionColumns, standardFactColumns } from '../templates';

const fileContent = (pkt: ReturnType<typeof buildDeploymentPacket>, path: string) =>
  pkt.files.find((f) => f.path === path)?.content ?? '';

describe('packet integration — simple dimension', () => {
  const d = newDimension('organization');          // dimensionType 'simple', sourceNcTables ['organization_nc']
  d.columns = standardDimensionColumns('organization');
  const pkt = buildDeploymentPacket(d, 'MemSQL');
  it('has final + nc DDL but NO staging tables', () => {
    const ddl = fileContent(pkt, 'ddl/organization.sql');
    expect(ddl).toMatch(/CREATE TABLE[^;]*organization\b/i);
    expect(ddl).toMatch(/organization_nc/);
    expect(ddl).not.toMatch(/organization_stg\b/);
    expect(ddl).not.toMatch(/_stg_error/);
  });
  it('control inserts are UPPERCASE and include require_nc with NULL watermark', () => {
    const ctl = fileContent(pkt, 'control/organization_inserts.sql');
    expect(ctl).toMatch(/INSERT INTO dw_table_and_dimension_mapping/);
    expect(ctl).toMatch(/INSERT INTO dw_dimension_enabler_config/);
    expect(ctl).toMatch(/INSERT INTO require_nc[^;]*'ORGANIZATION'[^;]*NULL\)/);
  });
  it('ships a mapping CSV and an INSTALL.md', () => {
    expect(pkt.files.map((f) => f.path)).toEqual(expect.arrayContaining(['mapping/organization_nc.csv', 'INSTALL.md']));
  });
});

describe('packet integration — staged dimension', () => {
  const d = newDimension('site');
  d.dimensionType = 'staged';
  d.requiresStaging = true;
  d.stgTable = 'site_stg';
  d.stgErrorTable = 'site_stg_error';
  d.columns = standardDimensionColumns('site');
  const ddl = fileContent(buildDeploymentPacket(d, 'MemSQL'), 'ddl/site.sql');
  it('emits staging + error tables', () => {
    expect(ddl).toMatch(/site_stg\b/);
    expect(ddl).toMatch(/site_stg_error/);
    expect(ddl).toMatch(/STG_ERROR_ID/);
  });
});

describe('packet integration — fact', () => {
  const f = newFact('dw_asset_fact');
  f.columns = standardFactColumns('dw_asset_fact');
  f.primaryNcTable = 'asset_header_nc';
  f.dimensionLookups = [{ id: 'd1', dimensionId: 'org', dimensionTable: 'organization',
    sourceIdColumn: 'owning_org_id', targetSkColumn: 'OWNING_ORG_KEY', defaultFallbackSk: -1, isMandatory: true }];
  f.reconciles = [{ id: 'r1', ncTable: 'asset_line_nc', ktrFileName: 'reconcile_asset_line' }];
  f.validationRules = [{ id: 'v1', ruleName: 'org_req', condition: 'OWNING_ORG_KEY <> -1', errorCode: 'E_ORG', errorMessage: 'no org' }];
  const pkt = buildDeploymentPacket(f, 'MemSQL');
  it('generator.json carries dimension_links, reconciles, validations', () => {
    const doc = JSON.parse(fileContent(pkt, 'generator.json'));
    expect(doc.dimension_links[0].target_sk_column).toBe('OWNING_ORG_KEY');
    expect(doc.reconciles[0].nc_table).toBe('asset_line_nc');
    expect(doc.validations[0].error_code).toBe('E_ORG');
  });
  it('DDL has stg_error + update_delta; control has fact enabler/mapping/job_task_mapping', () => {
    const ddl = fileContent(pkt, 'ddl/dw_asset_fact.sql');
    expect(ddl).toMatch(/asset_fact_stg_error/);
    expect(ddl).toMatch(/asset_fact_update_delta/);
    const ctl = fileContent(pkt, 'control/dw_asset_fact_inserts.sql');
    expect(ctl).toMatch(/INSERT INTO dw_fact_enabler_config/);
    expect(ctl).toMatch(/INSERT INTO dw_table_and_fact_mapping/);
    expect(ctl).toMatch(/INSERT INTO job_task_mapping/);
  });
});
