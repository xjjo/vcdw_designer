import { describe, it, expect } from 'vitest';
import { factToGenerator } from '../generatorMap';
import { newFact } from '../templates';

it('maps reconciles to {nc_table, ktr_file_name}', () => {
  const f = newFact('dw_shipment_fact');
  f.reconciles = [{ id: 'r1', ncTable: 'shipment_line_nc', ktrFileName: 'reconcile_shipment_line' }];
  const doc: any = factToGenerator(f);
  expect(doc.reconciles).toEqual([{ nc_table: 'shipment_line_nc', ktr_file_name: 'reconcile_shipment_line' }]);
});
