import { describe, it, expect } from 'vitest';
import { dimensionStreamFields, dimensionToGenerator, entityToGenerator } from '../generatorMap';
import { stagingDdl } from '../sqlGenerator';
import { col, newDimension, newFact } from '../templates';
import { validateGeneratorDoc } from '../contract/validate';
import type { Dimension } from '../types';

/** A compact item-like staged dimension (mirrors vcdw-etl-builder resources/examples/dimension_staged.json). */
function itemLike(): Dimension {
  const d = newDimension('demo_item');
  d.requiresStaging = true;
  d.dimensionType = 'staged';
  d.stgTable = 'demo_item_stg';
  d.stgErrorTable = 'demo_item_stg_error';
  d.netChange = [
    { id: 'nc', role: 'netchange', isPrimary: true, ncTable: 'demo_item_nc', alias: 'i', oltpTable: 'demo_item', oltpTableSysId: 'SYS_ITEM_ID' },
    {
      id: 'cte',
      role: 'support',
      ncTable: 'item_pgrp_level_assoc',
      alias: 'dw2',
      sql: ' select sys_item_id, max(SYS_PGRP_LEVEL_ID) as SYS_PGRP_LEVEL_ID from dw_item_pgrp_level_assoc group by sys_item_id ',
    },
  ];
  d.columns = [
    col({ name: 'DEMO_ITEM_KEY', type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, mappingKind: 'generated' }),
    col({ name: 'OLTP_ID', type: 'BIGINT', mappingKind: 'direct', sourceColumn: 'sys_item_id', sourceTable: 'i' }),
    col({ name: 'WEIGHT_UOM', type: 'BIGINT', mappingKind: 'direct', sourceColumn: 'weight_uom', sourceTable: 'i', coalesce: true }),
    col({ name: 'SYS_HAZARD_CLASS_ID', type: 'BIGINT', mappingKind: 'direct', sourceColumn: 'sys_hazard_class_id', sourceTable: 'i', isTransient: true }),
    col({ name: 'MODEL_LEVEL', type: 'VARCHAR(32)', mappingKind: 'constant', constantValue: "'Item'", isTransient: true }),
    col({ name: 'PRICE_WITH_TAX', type: 'DOUBLE', mappingKind: 'calculated', formula: 'coalesce(i.price, 0) * 1.21' }),
  ];
  d.lookups = [
    {
      id: 'l1',
      name: 'Database lookup hazard class',
      tableName: 'hazard_class',
      streamKeyFields: ['sys_hazard_class_id', 'is_deleted'],
      tableKeyFields: ['OLTP_ID', 'DELETED'],
      returnFields: [{ field: 'HAZARD_CLASS_NAME', newName: 'HAZARD_CLASS_NAME', default: '', defaultType: 2 }],
      errorOnMiss: { code: 15, message: 'HAZARD_CLASS Lookup Failed', checkFields: ['HAZARD_CLASS_NAME'] },
    },
  ];
  d.validationRules = [
    {
      id: 'v1',
      ruleName: 'PGRP level',
      condition: '',
      errorCode: '1',
      errorMessage: 'PGRP_LEVEL Lookup Failed',
      driverField: 'sys_pgrp_level_id',
      checkFields: ['PGRP_LEVEL_LEVEL1_NAME', 'PGRP_LEVEL_LEVEL2_NAME'],
      checkMode: 'any',
    },
  ];
  d.parameters = [{ name: 'product.group.type.name', default: '' }];
  d.extensions = { truncateStg: true, attributeKeys: { modelLevel: 'item' }, ept: { transPath: 'compute_demo_item.ktr' } };
  d.insertCopies = 3;
  d.lanes = 2;
  return d;
}

describe('dimension generator contract v4 (phase C/D)', () => {
  it('a design without v4 settings emits none of the v4 keys (A/B document unchanged)', () => {
    const doc: any = dimensionToGenerator(newDimension('plain'));
    for (const k of ['parameters', 'extensions', 'validations', 'insert_copies', 'lanes']) expect(doc).not.toHaveProperty(k);
    expect(doc.source_tables.every((s: any) => !('sql' in s))).toBe(true);
    expect(doc.lookups.every((l: any) => !('error_on_miss' in l))).toBe(true);
  });

  it('M16: lookups[].error_on_miss and dimension validations[] with driver_field/check_fields', () => {
    const doc: any = dimensionToGenerator(itemLike());
    expect(doc.lookups[0].error_on_miss).toEqual({ code: 15, message: 'HAZARD_CLASS Lookup Failed', check_fields: ['HAZARD_CLASS_NAME'] });
    expect(doc.validations).toEqual([
      {
        rule_name: 'PGRP level',
        condition: '',
        error_code: '1',
        error_message: 'PGRP_LEVEL Lookup Failed',
        driver_field: 'sys_pgrp_level_id',
        check_fields: ['PGRP_LEVEL_LEVEL1_NAME', 'PGRP_LEVEL_LEVEL2_NAME'],
        check_mode: 'any',
      },
    ]);
  });

  it('M12: derived support source -> source_tables[].sql (trimmed)', () => {
    const doc: any = dimensionToGenerator(itemLike());
    expect(doc.source_tables[1]).toMatchObject({ name: 'item_pgrp_level_assoc', alias: 'dw2', role: 'support' });
    expect(doc.source_tables[1].sql.startsWith('select sys_item_id')).toBe(true);
    expect(doc.source_tables[0]).not.toHaveProperty('sql');
  });

  it('M27: constant and calculated columns become fields with role', () => {
    const fields: any[] = (dimensionToGenerator(itemLike()) as any).fields;
    expect(fields.find((f) => f.new_name === 'MODEL_LEVEL')).toMatchObject({ role: 'constant', constant_value: "'Item'", store: false, alias: '' });
    expect(fields.find((f) => f.new_name === 'PRICE_WITH_TAX')).toMatchObject({ role: 'calculated', formula: 'coalesce(i.price, 0) * 1.21', store: true });
    expect(dimensionStreamFields(itemLike().columns)).toEqual(expect.arrayContaining(['model_level', 'price_with_tax']));
  });

  it('M15/M18/M30/M31: dimension_type, parameters, extensions, insert_copies, lanes', () => {
    const doc: any = dimensionToGenerator(itemLike());
    expect(doc.dimension_type).toBe('staged');
    expect(doc.stg_table).toBe('demo_item_stg');
    expect(doc.parameters).toEqual([{ name: 'product.group.type.name', default: '' }]);
    expect(doc.extensions).toEqual({
      truncate_stg: true,
      attribute_keys: { model_level: 'item', associated_model_level: 'item' },
      ept: { trans_path: 'compute_demo_item.ktr' },
    });
    expect(doc.insert_copies).toBe(3);
    expect(doc.lanes).toBe(2);
    expect(validateGeneratorDoc(entityToGenerator(itemLike())).valid).toBe(true);
  });

  it('M33: staging DDL of a staged dimension', () => {
    const [stg, err] = stagingDdl(itemLike(), 'MemSQL');
    expect(stg).toMatch(/`ERROR`\s+LONGTEXT/);
    expect(stg).toMatch(/`ERROR_MAP_VALUES`\s+LONGTEXT/);
    expect(stg).toContain('`SYS_HAZARD_CLASS_ID`'); // stream-only driver lives in _stg
    expect(stg).not.toContain('`MODEL_LEVEL`'); // stream-only constant does not
    expect(stg).not.toContain('`DEMO_ITEM_KEY`');
    expect(err.match(/ERROR_MAP_VALUES/g)?.length).toBe(1);
    expect(err).toMatch(/PRIMARY KEY \(`STG_ERROR_ID`\)/);
  });

  it('M33: fact staging DDL is unchanged', () => {
    const f = newFact('dw_asset_fact');
    f.stagingTable = 'asset_fact_stg';
    expect(stagingDdl(f, 'MemSQL')[0]).toMatch(/`ERROR`\s+VARCHAR\(512\)/);
  });
});
