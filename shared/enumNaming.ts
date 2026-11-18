import type { Enumeration, NetChangeSource } from './types';

/** A net-change condition that is exactly `enum_type='<something>'` (no extra predicates). */
const STANDARD_ENUM_CONDITION = /^\s*enum_type\s*=\s*'[^']*'\s*$/i;

export function isStandardEnumCondition(condition: string | undefined): boolean {
  return !!condition && STANDARD_ENUM_CONDITION.test(condition);
}

export function enumTypeCondition(e: Pick<Enumeration, 'enumTypeFilter' | 'name'>): string {
  return `enum_type='${e.enumTypeFilter || e.name}'`;
}

/**
 * The condition to emit for an enumeration net-change source: a standard
 * `enum_type='…'` condition always follows the current ENUM_TYPE filter (so a
 * renamed/duplicated enum never keeps the old filter); custom conditions are kept.
 */
export function enumNetChangeCondition(e: Enumeration, nc: NetChangeSource): string {
  return isStandardEnumCondition(nc.condition) ? enumTypeCondition(e) : nc.condition ?? '';
}

/** Set the ENUM_TYPE filter and re-point every standard `enum_type='…'` net-change condition to it. */
export function withEnumTypeFilter(e: Enumeration, enumTypeFilter: string): Enumeration {
  const next: Enumeration = { ...e, enumTypeFilter };
  next.netChange = e.netChange?.map((nc) =>
    isStandardEnumCondition(nc.condition) ? { ...nc, condition: enumTypeCondition(next) } : nc,
  );
  return next;
}

/** Drop the deprecated physical-name overrides; they are always derived from `name` + columns. */
export function stripLegacyEnumOverrides<T extends Enumeration>(e: T): T {
  const { enumTable: _enumTable, fieldKey: _fieldKey, fieldName: _fieldName, ...rest } = e;
  return rest as T;
}
