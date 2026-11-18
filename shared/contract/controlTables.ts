import type { EntityKind } from '../types';

/**
 * Authoritative VCDW control-table insert signatures, extracted verbatim from the
 * DataWarehouse memsql DDL populate_*.sql files. Column lists are the exact
 * columns (names and casing) used by a representative INSERT in each source file.
 * Later deployment-packet generators reference these so control-inserts reproduce
 * real output rather than fabricated signatures (Constraint 10 — no fabrication).
 */
export interface ControlTable {
  table: string;
  populateFile: string;
  /** The exact column list used by a representative INSERT in populateFile. */
  columns: string[];
  /** Which entity kinds add a row to this control table. */
  forKinds: EntityKind[];
}

export const CONTROL_TABLES: ControlTable[] = [
  {
    table: 'dw_table_and_dimension_mapping',
    populateFile: 'populate_dw_table_and_dimension_mapping.sql',
    columns: ['DIMENSION_NAME', 'DW_TABLE_NAME'],
    forKinds: ['enumeration', 'dimension'],
  },
  {
    table: 'dw_table_and_fact_mapping',
    populateFile: 'populate_dw_table_and_fact_mapping.sql',
    columns: ['FACT_NAME', 'DW_TABLE_NAME'],
    forKinds: ['fact'],
  },
  {
    table: 'dw_dimension_enabler_config',
    populateFile: 'populate_dw_dimension_enabler_config.sql',
    columns: ['DIMENSION_NAME', 'IS_ENABLE'],
    forKinds: ['enumeration', 'dimension'],
  },
  {
    table: 'dw_fact_enabler_config',
    populateFile: 'populate_dw_fact_enabler_config.sql',
    columns: ['FACT_NAME', 'IS_ENABLE'],
    forKinds: ['fact'],
  },
  {
    table: 'dw_oltp_tables_mapping',
    populateFile: 'populate_dw_oltp_tables_mapping.sql',
    columns: ['OLTP_TABLE', 'DW_TABLE'],
    forKinds: ['dimension', 'fact'],
  },
  {
    table: 'require_nc',
    populateFile: 'populate_require_nc.sql',
    columns: ['DIM_OR_FACT_TABLE', 'OLTP_TABLE', 'last_extracted'],
    forKinds: ['dimension', 'fact'],
  },
  {
    table: 'initial_load_require_nc',
    populateFile: 'populate_initial_load_require_nc.sql',
    columns: ['DIM_OR_FACT_TABLE', 'OLTP_TABLE', 'last_extracted'],
    forKinds: ['dimension', 'fact'],
  },
  {
    table: 'incremental_load_require_nc',
    populateFile: 'populate_incremental_load_require_nc.sql',
    columns: ['DIM_OR_FACT_TABLE', 'OLTP_TABLE', 'last_extracted'],
    forKinds: ['dimension', 'fact'],
  },
  {
    table: 'job_task_mapping',
    populateFile: 'populate_job_task_mapping.sql',
    columns: ['job_task_mapping_id', 'priority', 'fact_name', 'resource_cost', 'job_path'],
    forKinds: ['fact'],
  },
  {
    table: 'validation_policy_config',
    populateFile: 'populate_validation_policy_config.sql',
    columns: ['TABLE_NAME', 'COLUMN_NAME', 'PROPERTY_NAME', 'IS_ENABLED'],
    forKinds: ['dimension', 'fact'],
  },
  {
    table: 'error_map',
    populateFile: 'populate_error_map.sql',
    columns: [
      'DIM_OR_FACT_STG_ERROR_TABLE',
      'ERROR_MAP_VALUE',
      'STG_ERROR_KEY_COLUMN_NAME',
      'ERROR_MESSAGE',
      'ERROR_DESCRIPTION',
      'RESOLUTION_PRESCRIPTION',
      'TARGET_DIM_TABLE_NAME',
      'TARGET_DIMENSION_COLUMN',
      'OLTP_TABLE_NAME',
      'OLTP_COLUMN_NAME',
      'STG_ERROR_COLUMN_NAME',
      'IS_COMPUTED',
      'IS_VALIDATION_DELETED',
      'SQL_TO_FETCH_ERROR_COLUMN_DATA',
    ],
    forKinds: ['dimension', 'fact'],
  },
];
