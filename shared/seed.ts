/**
 * Demo model shipped with the app so the tool is useful on first load.
 * Mirrors the SRS example: currencycode enum, customer + location dims,
 * and a rich dw_shipment_fact with lookups, geo, currency, measures & rules.
 */
import type { DesignModel } from './types';
import {
  col,
  defaultAuditProfile,
  materializeAuditColumns,
  newDimension,
  newEnumeration,
  newFact,
  standardDimensionColumns,
  standardEnumColumns,
  standardFactColumns,
  uid,
} from './templates';

export function buildSeedModel(): DesignModel {
  const audit = defaultAuditProfile();

  // --- Enumeration: currencycode ---
  const currency = newEnumeration('currencycode');
  currency.displayName = 'Currency Code Enumeration';
  currency.description = 'ISO currency codes.';
  currency.enumTypeFilter = 'currencycode';

  // --- Dimension: customer (no staging) ---
  const customer = newDimension('customer');
  customer.displayName = 'Customer Dimension';
  customer.description = 'Business customers.';
  customer.columns = [
    ...standardDimensionColumns('customer'),
    col({ name: 'CUSTOMER_NUMBER', type: 'VARCHAR(64)', nullable: false, sourceColumn: 'customer_number' }),
    col({ name: 'CUSTOMER_NAME', type: 'VARCHAR(255)', nullable: true, sourceColumn: 'customer_name' }),
    col({ name: 'STATUS', type: 'VARCHAR(32)', nullable: true, sourceColumn: 'status' }),
    ...materializeAuditColumns(audit),
  ];
  customer.sortKeys = ['OLTP_ID', 'CUSTOMER_NUMBER'];
  customer.netChange = [
    { id: uid('nc'), isPrimary: true, oltpTable: 'customer', ncTable: 'customer_nc', oltpTableSysId: 'sys_customer_id', oltpTableLmd: 'last_modified_date' },
  ];

  // --- Dimension: location (with geo attributes) ---
  const location = newDimension('location');
  location.displayName = 'Location Dimension';
  location.description = 'Facilities / locations with geography.';
  location.columns = [
    ...standardDimensionColumns('location'),
    col({ name: 'LOCATION_NAME', type: 'VARCHAR(255)', nullable: true, sourceColumn: 'location_name' }),
    col({ name: 'COUNTRY_CODE', type: 'VARCHAR(3)', nullable: true, sourceColumn: 'country_code' }),
    col({ name: 'STATE_CODE', type: 'VARCHAR(8)', nullable: true, sourceColumn: 'state_code' }),
    col({ name: 'CITY_NAME', type: 'VARCHAR(128)', nullable: true, sourceColumn: 'city_name' }),
    col({ name: 'GEO_SK', type: 'BIGINT', isFk: true, nullable: true }),
    ...materializeAuditColumns(audit),
  ];
  location.requiresStaging = true;
  location.stgTable = 'location_stg';
  location.stgErrorTable = 'location_stg_error';
  location.netChange = [
    { id: uid('nc'), isPrimary: true, oltpTable: 'location', ncTable: 'location_nc', oltpTableSysId: 'sys_location_id', oltpTableLmd: 'last_modified_date' },
  ];

  // --- Fact: dw_shipment_fact ---
  const shipment = newFact('dw_shipment_fact');
  shipment.displayName = 'Shipment Fact';
  shipment.description = 'One row per shipment header.';
  shipment.primaryNcTable = 'shipment_header_nc';
  shipment.secondaryNcTables = ['shipment_line_nc'];
  shipment.columns = [
    ...standardFactColumns('dw_shipment_fact'),
    col({ name: 'CUSTOMER_KEY', type: 'BIGINT', isFk: true, referencedEntityId: customer.id, nullable: true }),
    col({ name: 'ORIGIN_LOCATION_KEY', type: 'BIGINT', isFk: true, referencedEntityId: location.id, nullable: true }),
    col({ name: 'CURRENCY_KEY', type: 'BIGINT', isFk: true, referencedEntityId: currency.id, nullable: true }),
    col({ name: 'SHIP_FROM_GEO_SK', type: 'BIGINT', isFk: true, nullable: true }),
    col({ name: 'SHIP_TO_GEO_SK', type: 'BIGINT', isFk: true, nullable: true }),
    col({ name: 'TOTAL_WEIGHT', type: 'DECIMAL(18,4)', isMeasure: true, aggregation: 'SUM', nullable: true }),
    col({ name: 'LOCAL_FREIGHT_COST', type: 'DECIMAL(18,4)', isMeasure: true, nullable: true }),
    col({ name: 'FREIGHT_COST_USD', type: 'DECIMAL(18,4)', isMeasure: true, isCalculated: true, nullable: true }),
    col({ name: 'TRANSIT_DAYS', type: 'DOUBLE', isMeasure: true, isCalculated: true, formula: 'DATEDIFF(ACTUAL_DELIVERY_DATE, ACTUAL_PICKUP_DATE)', nullable: true }),
    ...materializeAuditColumns(audit),
  ];
  shipment.dimensionLookups = [
    { id: uid('dl'), dimensionId: customer.id, dimensionTable: 'customer', sourceIdColumn: 'SYS_CUSTOMER_ID', targetSkColumn: 'CUSTOMER_KEY', defaultFallbackSk: -1, isMandatory: true },
    { id: uid('dl'), dimensionId: location.id, dimensionTable: 'location', sourceIdColumn: 'SYS_ORIGIN_LOCATION_ID', targetSkColumn: 'ORIGIN_LOCATION_KEY', defaultFallbackSk: -1, isMandatory: false },
    { id: uid('dl'), dimensionId: currency.id, dimensionTable: 'currencycode', sourceIdColumn: 'CURRENCY_CODE', targetSkColumn: 'CURRENCY_KEY', defaultFallbackSk: -1, isMandatory: false },
  ];
  shipment.geoEnrichment = [
    { id: uid('geo'), type: 'ship_from', targetGeoSk: 'SHIP_FROM_GEO_SK', sourceCountryCol: 'FROM_COUNTRY_CODE', sourceStateCol: 'FROM_STATE_CODE', sourceCityCol: 'FROM_CITY_NAME' },
    { id: uid('geo'), type: 'ship_to', targetGeoSk: 'SHIP_TO_GEO_SK', sourceCountryCol: 'TO_COUNTRY_CODE', sourceStateCol: 'TO_STATE_CODE', sourceCityCol: 'TO_CITY_NAME' },
  ];
  shipment.currencyConversions = [
    { id: uid('cc'), sourceAmountCol: 'LOCAL_FREIGHT_COST', sourceCurrencyCol: 'CURRENCY_CODE', targetBaseAmountCol: 'FREIGHT_COST_USD', baseCurrency: 'USD' },
  ];
  shipment.validationRules = [
    { id: uid('vr'), ruleName: 'CheckValidCustomer', condition: 'CUSTOMER_KEY IS NOT NULL AND CUSTOMER_KEY != -1', errorCode: 'ERR_DIM_CUSTOMER_NOT_FOUND', errorMessage: 'Customer not found in customer dimension' },
    { id: uid('vr'), ruleName: 'CheckPositiveWeight', condition: 'TOTAL_WEIGHT >= 0', errorCode: 'ERR_NEGATIVE_WEIGHT', errorMessage: 'Total weight must not be negative' },
  ];

  // position for the canvas
  currency.ui = { x: 60, y: 380 };
  customer.ui = { x: 60, y: 60 };
  location.ui = { x: 60, y: 210 };
  shipment.ui = { x: 480, y: 200 };

  return {
    schemaVersion: '1.0.0',
    project: {
      name: 'VCDW_Model',
      version: '1.0.0',
      targetDatabase: 'MemSQL',
      createdAt: new Date().toISOString(),
    },
    auditProfiles: [audit],
    enumerations: [currency],
    dimensions: [customer, location],
    facts: [shipment],
  };
}
