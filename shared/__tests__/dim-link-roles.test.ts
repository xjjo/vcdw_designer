import { describe, it, expect } from 'vitest';
import { factToGenerator } from '../generatorMap';
import { newFact } from '../templates';

it('emits role_alias and a custom active_condition when set', () => {
  const f = newFact('dw_shipment_fact');
  f.dimensionLookups = [
    { id: 'o1', dimensionId: 'org', dimensionTable: 'organization', sourceIdColumn: 'invoicer_org_id',
      targetSkColumn: 'INVOICER_ORG_KEY', defaultFallbackSk: -1, isMandatory: false,
      roleAlias: 'invoicer', activeCondition: 'DELETED = 0 AND ACTIVE = 1' },
    { id: 'o2', dimensionId: 'org', dimensionTable: 'organization', sourceIdColumn: 'carrier_org_id',
      targetSkColumn: 'CARRIER_ORG_KEY', defaultFallbackSk: -1, isMandatory: false },
  ];
  const doc: any = factToGenerator(f);
  expect(doc.dimension_links).toHaveLength(2);
  expect(doc.dimension_links[0]).toMatchObject({ role_alias: 'invoicer', active_condition: 'DELETED = 0 AND ACTIVE = 1' });
  expect(doc.dimension_links[1]).toMatchObject({ role_alias: '', active_condition: 'DELETED = 0' }); // defaults preserved
});
