import { describe, it, expect } from 'vitest';
import { factToGenerator } from '../generatorMap';
import { newFact } from '../templates';

describe('fact extras', () => {
  it('emits dimension_links with DELETED guard and fallback -1', () => {
    const f = newFact('dw_asset_fact');
    f.dimensionLookups = [{ id: 'd1', dimensionId: 'org', dimensionTable: 'organization',
      sourceIdColumn: 'owning_org_id', targetSkColumn: 'OWNING_ORG_KEY', defaultFallbackSk: -1, isMandatory: true }];
    const doc: any = factToGenerator(f);
    expect(doc.dimension_links[0]).toMatchObject({ dim_table: 'organization', target_sk_column: 'OWNING_ORG_KEY',
      default_fallback_sk: -1, mandatory: true, active_condition: 'DELETED = 0' });
  });
  it('emits validations and keeps legacy lookups populated', () => {
    const f = newFact('dw_asset_fact');
    f.validationRules = [{ id: 'v1', ruleName: 'org_required', condition: 'OWNING_ORG_KEY <> -1', errorCode: 'E_ORG', errorMessage: 'Missing org' }];
    const doc: any = factToGenerator(f);
    expect(doc.validations[0]).toMatchObject({ rule_name: 'org_required', error_code: 'E_ORG' });
    expect(Array.isArray(doc.lookups)).toBe(true);
  });
});
