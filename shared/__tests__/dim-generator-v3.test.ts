import { describe, it, expect } from 'vitest';
import { cmfParamName, dimensionStreamFields, dimensionToGenerator, entityToGenerator, javaDataType } from '../generatorMap';
import { entityDdl } from '../sqlGenerator';
import { col, newDimension } from '../templates';
import { validateGeneratorDoc } from '../contract/validate';
import type { Dimension } from '../types';

function orgLike(): Dimension {
  const d = newDimension('organization');
  d.isReferenceTable = true;
  d.businessKeys = ['ENT_NAME', 'ORG_NAME'];
  d.netChange = [
    { id: 'nc', role: 'netchange', isPrimary: true, ncTable: 'organization_nc', alias: 'nc', oltpTable: 'organization', oltpTableSysId: 'SYS_ORG_ID' },
  ];
  d.columns = [
    col({ name: 'ORGANIZATION_KEY', type: 'BIGINT', isPk: true, isSk: true, autoIncrement: true, mappingKind: 'generated' }),
    col({ name: 'OLTP_ID', type: 'BIGINT', mappingKind: 'direct', sourceColumn: 'sys_org_id', sourceTable: 'nc' }),
    col({ name: 'DISPLAY_NAME', type: 'VARCHAR(255)', mappingKind: 'direct', sourceColumn: 'display_name', sourceTable: 'nc', coalesce: true }),
    col({ name: 'PRICE', type: 'DOUBLE', mappingKind: 'direct', sourceColumn: 'price', sourceTable: 'nc', coalesce: true, coalesceDefault: '0' }),
    col({
      name: 'OMS_SYS_INVOICEE_MGMT_ORG_ID',
      type: 'BIGINT',
      mappingKind: 'direct',
      sourceColumn: 'oms_sys_invoicee_mgmt_org_id',
      sourceTable: 'nc',
      coalesce: true,
      isTransient: true,
    }),
    col({ name: 'GENERIC_ITEM_NAME', type: 'VARCHAR(256)', mappingKind: 'join', joinId: 'j1', joinField: 'ITEM_NAME', coalesce: true }),
  ];
  d.joins = [
    {
      id: 'j1',
      leftTable: 'organization_nc',
      leftAlias: 'nc',
      rightTable: 'dw_item',
      rightAlias: 'dw1',
      joinType: 'LEFT',
      onConditions: [{ left: 'dw1.SYS_ITEM_ID', op: '=', right: 'nc.scc_sys_generic_item_id' }],
    },
  ];
  d.lookups = [
    {
      id: 'l1',
      name: 'Lookup for scaccode',
      tableName: 'dw_tms_org_profile',
      streamKeyFields: ['oltp_id'],
      tableKeyFields: ['SYS_ORG_ID'],
      returnFields: [{ field: 'SCACCODE', newName: 'SCACCODE', default: 'No Value', defaultType: 2 }],
    },
  ];
  return d;
}

describe('dimension generator contract v3', () => {
  it('maps physical SQL types to the Java generator vocabulary', () => {
    expect(javaDataType('VARCHAR(64)')).toBe('varchar');
    expect(javaDataType('LONGTEXT')).toBe('varchar');
    expect(javaDataType('BIGINT')).toBe('bigint');
    expect(javaDataType('INTEGER')).toBe('bigint');
    expect(javaDataType('TINYINT(1)')).toBe('tinyint');
    expect(javaDataType('DECIMAL(6,0)')).toBe('decimal');
    expect(javaDataType('DOUBLE')).toBe('decimal');
    expect(javaDataType('DATETIME(6)')).toBe('datetime');
  });

  it('emits normalized data_type, sql_type, store and coalesce_default', () => {
    const fields: any[] = (dimensionToGenerator(orgLike()) as any).fields;
    const byTarget = (n: string) => fields.find((f) => (f.new_name || f.name).toUpperCase() === n);
    expect(byTarget('DISPLAY_NAME')).toMatchObject({ data_type: 'varchar', sql_type: 'VARCHAR(255)', store: true, coalesce: true });
    expect(byTarget('DISPLAY_NAME')).not.toHaveProperty('coalesce_default');
    expect(byTarget('PRICE')).toMatchObject({ data_type: 'decimal', coalesce_default: '0' });
    expect(byTarget('OMS_SYS_INVOICEE_MGMT_ORG_ID')).toMatchObject({ store: false, data_type: 'bigint' });
  });

  it('emits join-mapped columns as fields read from the join alias', () => {
    const fields: any[] = (dimensionToGenerator(orgLike()) as any).fields;
    expect(fields.find((f) => f.new_name === 'GENERIC_ITEM_NAME')).toMatchObject({ name: 'ITEM_NAME', alias: 'dw1', coalesce: true });
  });

  it('emits lookup order_by/step_name, business keys, load strategy and the CMF parameter', () => {
    const doc: any = dimensionToGenerator(orgLike());
    expect(doc.lookups[0]).toMatchObject({ order_by: '', step_name: 'Lookup for scaccode', return_value_default: 'No Value' });
    expect(doc.natural_keys).toEqual(['ENT_NAME', 'ORG_NAME']);
    expect(doc.load_strategy).toBe('insert_new');
    expect(doc.upsert_keys).toEqual([]);
    expect(doc.is_reference).toBe(true);
    expect(doc.cmf_param).toBe('organization.nc.cmf.for.organization');
    expect(cmfParamName('scc_hazard_class_nc', 'hazard_class')).toBe('scc.hazard.class.nc.cmf.for.hazard.class');
    expect(validateGeneratorDoc(entityToGenerator(orgLike())).valid).toBe(true);
  });

  it('lists the stream fields a lookup key can use (lower-case targets + oltp_id/is_deleted)', () => {
    const names = dimensionStreamFields(orgLike().columns);
    expect(names).toEqual(
      expect.arrayContaining(['display_name', 'oms_sys_invoicee_mgmt_org_id', 'generic_item_name', 'oltp_id', 'is_deleted']),
    );
    expect(names).not.toContain('organization_key');
  });

  it('DDL: reference dimension, transient columns excluded', () => {
    const ddl = entityDdl(orgLike(), 'MemSQL');
    expect(ddl.startsWith('CREATE REFERENCE TABLE IF NOT EXISTS `organization`')).toBe(true);
    expect(ddl).not.toContain('OMS_SYS_INVOICEE_MGMT_ORG_ID');
    expect(ddl).toContain('`DISPLAY_NAME`');
  });
});
