import { describe, it, expect } from 'vitest';
import { buildDeploymentPacket } from '../packet';
import { entityToGenerator } from '../generatorMap';
import { col, newDimension, newEnumeration, newFact, standardDimensionColumns, standardFactColumns } from '../templates';
import type { NetChangeSource } from '../types';

type Packet = ReturnType<typeof buildDeploymentPacket>;
const fileContent = (pkt: Packet, path: string) => pkt.files.find((f) => f.path === path)?.content ?? '';

/** The per-source NC tables the packet actually ships a mapping CSV for (excludes enable_mapping.csv). */
const mappingNcTables = (pkt: Packet): string[] =>
  pkt.files
    .filter((f) => f.path.startsWith('mapping/') && f.path.endsWith('.csv') && f.path !== 'mapping/enable_mapping.csv')
    .map((f) => f.path.replace(/^mapping\//, '').replace(/\.csv$/, ''))
    .sort();

/**
 * Cross-artifact agreement: the net-change sources resolved for generator.json
 * must match the sources the packet materializes as DDL blocks and mapping CSVs.
 * These lock the three fix spots that previously diverged.
 */
describe('packet consistency — net-change sources agree across artifacts', () => {
  it('simple dimension: generator.json netchange[] is non-empty and matches ddl + mapping CSVs', () => {
    const d = newDimension('organization'); // dimensionType 'simple', sourceNcTables ['organization_nc'], no netChange
    d.columns = standardDimensionColumns('organization');
    const gen = entityToGenerator(d) as { netchange: Array<{ nc_table: string; oltp_table: string }> };
    const pkt = buildDeploymentPacket(d, 'MemSQL');

    // Fix #1: a simple dimension must emit a non-empty netchange[] (not the old empty array).
    expect(gen.netchange.length).toBeGreaterThan(0);
    const org = gen.netchange.find((n) => n.nc_table === 'organization_nc');
    expect(org, 'organization_nc missing from generator.json netchange[]').toBeDefined();
    expect(org!.oltp_table).toBe('organization');

    const genNcTables = gen.netchange.map((n) => n.nc_table).sort();
    // generator.json nc tables are present in the packet DDL ...
    const ddl = fileContent(pkt, 'ddl/organization.sql');
    for (const nc of genNcTables) expect(ddl, `ddl missing ${nc}`).toContain(nc);
    // ... and equal the set of per-source mapping CSVs the packet ships.
    expect(genNcTables).toEqual(mappingNcTables(pkt));
  });

  it('fact with primaryNcTable AND declared netChange: ddl + mapping cover both nc sources', () => {
    const f = newFact('dw_asset_fact');
    f.columns = standardFactColumns('dw_asset_fact');
    f.primaryNcTable = 'asset_header_nc';
    f.netChange = [
      { id: 'nc_line', role: 'netchange', ncTable: 'asset_line_nc', oltpTable: 'asset_line' } as NetChangeSource,
    ];
    const pkt = buildDeploymentPacket(f, 'MemSQL');

    // Fix #2: the packet DDL covers BOTH the primary and the declared net-change source.
    const ddl = fileContent(pkt, 'ddl/dw_asset_fact.sql');
    expect(ddl).toContain('asset_header_nc');
    expect(ddl).toContain('asset_line_nc');

    // ... and ships a mapping CSV for each.
    const paths = pkt.files.map((p) => p.path);
    expect(paths).toContain('mapping/asset_header_nc.csv');
    expect(paths).toContain('mapping/asset_line_nc.csv');

    // generator.json, control inserts and ddl/csv all reference the same nc sources.
    const gen = entityToGenerator(f) as { netchange: Array<{ nc_table: string }> };
    const genNcTables = gen.netchange.map((n) => n.nc_table).sort();
    expect(genNcTables).toEqual(['asset_header_nc', 'asset_line_nc']);
    expect(mappingNcTables(pkt)).toEqual(['asset_header_nc', 'asset_line_nc']);
    const ctl = fileContent(pkt, 'control/dw_asset_fact_inserts.sql');
    expect(ctl).toContain('ASSET_HEADER'); // require_nc + fact mapping rows for the primary source
    expect(ctl).toContain('ASSET_LINE'); //  ... and for the declared net-change source
  });

  it('enum with a direct column missing sourceColumn: entityToGenerator does not throw', () => {
    // Fix #3: a direct column without sourceColumn previously produced name=undefined -> .toLowerCase() NPE.
    const e = newEnumeration('load_type');
    e.columns = [
      col({ name: 'LOAD_TYPE_KEY', type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, mappingKind: 'generated' }),
      col({ name: 'LOAD_TYPE_NAME', type: 'VARCHAR(256)', mappingKind: 'direct' }), // direct, but no sourceColumn
    ];
    expect(() => entityToGenerator(e)).not.toThrow();
  });
});
