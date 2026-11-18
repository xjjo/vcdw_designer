import type { AnyEntity } from '@shared/types';
import type { WorkingTable } from './store';

export type TableGroup = 'Source' | 'Support' | 'Dimension' | 'Enumeration' | 'Fact' | 'Working';

/** A table the editors can offer in pickers, with its (best-effort) columns. */
export interface DesignerTable {
  /** Physical table name. */
  name: string;
  /** Suggested alias. */
  alias?: string;
  group: TableGroup;
  columns: { name: string; type?: string }[];
}

const GROUP_BY_ORIGIN: Record<WorkingTable['origin'], TableGroup> = {
  enumeration: 'Enumeration',
  dimension: 'Dimension',
  fact: 'Fact',
  support: 'Support',
};

/**
 * Build the set of referenceable tables for an entity's pickers: its own declared
 * source tables plus everything the user pulled into the Working Area. Users can
 * always type a free table name; this list just powers the optional selectors.
 */
export function buildDesignerTables(entity: AnyEntity, workingSet: WorkingTable[]): DesignerTable[] {
  const out: DesignerTable[] = [];
  const seen = new Set<string>();

  for (const s of entity.netChange ?? []) {
    const name = s.ncTable?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      alias: s.alias || undefined,
      group: (s.role ?? 'netchange') === 'support' ? 'Support' : 'Source',
      columns: (s.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
    });
  }

  for (const t of workingSet) {
    const key = t.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: t.name,
      alias: t.alias,
      group: GROUP_BY_ORIGIN[t.origin],
      columns: t.columns,
    });
  }

  return out;
}

/** Resolve the columns of a table referenced by physical name or alias. */
export function columnsForTable(
  tables: DesignerTable[],
  nameOrAlias: string | undefined,
): { name: string; type?: string }[] {
  if (!nameOrAlias) return [];
  const key = nameOrAlias.toLowerCase();
  const hit = tables.find((t) => t.name.toLowerCase() === key || (t.alias ?? '').toLowerCase() === key);
  return hit?.columns ?? [];
}

/** Snapshot an entity's target columns for the Working Area. */
export function workingTableFromEntity(entity: AnyEntity): WorkingTable {
  return {
    name: entity.name,
    origin: entity.kind,
    columns: entity.columns.map((c) => ({ name: c.name, type: c.type })),
  };
}
