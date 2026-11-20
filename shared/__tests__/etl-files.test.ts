import { it, expect } from 'vitest';
import { expectedEtlFiles, missingEtlFiles } from '../etlFiles';

it('expects sync/update/default-row files for an insert_new dimension', () => {
  const doc = { type: 'dimension', dim_table: 'organization', load_strategy: 'insert_new', has_unknown_row: true, nk_updates: false };
  expect(expectedEtlFiles(doc)).toEqual([
    'organization_sync.kjb',
    'organization_sync.ktr',
    'update_organization.ktr',
    'organization_insert_default_row.ktr',
  ]);
});

it('upsert dimensions have no update transform; nk_updates adds handle_nk_updates', () => {
  const doc = { type: 'dimension', dim_table: 'hazmat', load_strategy: 'upsert_by_key', has_unknown_row: false, nk_updates: true };
  expect(expectedEtlFiles(doc)).toEqual(['hazmat_sync.kjb', 'hazmat_sync.ktr', 'hazmat_handle_nk_updates.ktr']);
});

it('reports the files the generator did not write', () => {
  const doc = { type: 'dimension', dim_table: 'hazard_class', has_unknown_row: true };
  const produced = ['dimension/hazard_class_sync.kjb', 'dimension/hazard_class_insert_default_row.ktr'];
  expect(missingEtlFiles(doc, produced)).toEqual(['hazard_class_sync.ktr', 'update_hazard_class.ktr']);
});
