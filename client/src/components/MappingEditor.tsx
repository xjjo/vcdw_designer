import type { Column, JoinDef, LookupDef, MappingKind } from '@shared/types';
import type { DesignerTable } from '../tableOptions';
import { columnsForTable } from '../tableOptions';

interface Props {
  columns: Column[];
  tables: DesignerTable[];
  lookups: LookupDef[];
  joins: JoinDef[];
  onChange: (columns: Column[]) => void;
}

const KINDS: { id: MappingKind; label: string }[] = [
  { id: 'direct', label: '1 to 1' },
  { id: 'lookup', label: 'Lookup' },
  { id: 'join', label: 'Join' },
  { id: 'audit', label: 'Audit' },
  { id: 'generated', label: 'Surrogate key' },
  { id: 'constant', label: 'Constant' },
  { id: 'calculated', label: 'Calculated' },
];

/** Infer the mapping kind of a legacy column that has no explicit `mappingKind`. */
function effectiveKind(c: Column): MappingKind {
  if (c.mappingKind) return c.mappingKind;
  if (c.auditRole) return 'audit';
  if (c.autoIncrement || c.isSk) return 'generated';
  if (c.isCalculated) return 'calculated';
  if (c.joinId) return 'join';
  if (c.lookupId) return 'lookup';
  return 'direct';
}

const lookupLabel = (l: LookupDef) => l.name?.trim() || l.tableName;
const joinLabel = (j: JoinDef) =>
  j.name?.trim() || `${j.leftTable || '?'} ⋈ ${j.rightTable || '?'}`;

export default function MappingEditor({ columns, tables, lookups, joins, onChange }: Props) {
  function update(id: string, patch: Partial<Column>) {
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <div className="panel">
      <h3>Field mapping</h3>
      <p className="hint">
        Bind every target column to its origin: a <strong>1 to 1</strong> rename from a source column,
        a <strong>lookup</strong> or <strong>join</strong> result, an audit field, the surrogate key, a
        constant, or a calculated expression. You can always type a table or field name — the pickers
        only list tables added to the Working Area and fields declared for them.
      </p>

      <datalist id="map-tables">
        {tables.map((t) => (
          <option key={`${t.group}:${t.name}`} value={t.name}>
            {t.group}
            {t.alias ? ` · ${t.alias}` : ''}
          </option>
        ))}
      </datalist>

      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Target column</th>
              <th style={{ width: 130 }}>Mapping</th>
              <th style={{ width: 180 }}>Source table / step</th>
              <th style={{ width: 200 }}>Source Field</th>
              <th className="chk">Coalesce</th>
              <th style={{ width: 110 }}>Coalesce default</th>
              <th className="chk" title="Read by the ETL (e.g. a lookup driver) but not a column of the table">
                Stream only
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => {
              const kind = effectiveKind(c);
              const fieldListId = `flds-${c.id}`;
              const tableCols = columnsForTable(tables, c.sourceTable);
              const join = joins.find((j) => j.id === c.joinId);
              const joinCols = join ? columnsForTable(tables, join.rightAlias || join.rightTable) : [];
              const lookup = lookups.find((l) => l.id === c.lookupId);
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <span className="hint" style={{ display: 'block' }}>{c.type}</span>
                  </td>
                  <td>
                    <select
                      value={kind}
                      onChange={(e) => {
                        const mk = e.target.value as MappingKind;
                        update(c.id, {
                          mappingKind: mk,
                          isCalculated: mk === 'calculated',
                          autoIncrement: mk === 'generated' ? true : c.autoIncrement,
                        });
                      }}
                    >
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    {kind === 'direct' && (
                      <input
                        list="map-tables"
                        value={c.sourceTable ?? ''}
                        placeholder="table or alias"
                        onChange={(e) => update(c.id, { sourceTable: e.target.value || undefined })}
                      />
                    )}
                    {kind === 'lookup' && (
                      <select
                        value={c.lookupId ?? ''}
                        onChange={(e) => update(c.id, { lookupId: e.target.value || undefined })}
                      >
                        <option value="">— lookup —</option>
                        {lookups.map((l) => (
                          <option key={l.id} value={l.id}>
                            {lookupLabel(l)}
                          </option>
                        ))}
                      </select>
                    )}
                    {kind === 'join' && (
                      <select
                        value={c.joinId ?? ''}
                        onChange={(e) => update(c.id, { joinId: e.target.value || undefined })}
                      >
                        <option value="">— join —</option>
                        {joins.map((j) => (
                          <option key={j.id} value={j.id}>
                            {joinLabel(j)}
                          </option>
                        ))}
                      </select>
                    )}
                    {(kind === 'audit' || kind === 'generated' || kind === 'constant' || kind === 'calculated') && (
                      <span className="hint">—</span>
                    )}
                  </td>

                  <td>
                    {kind === 'direct' && (
                      <>
                        <input
                          list={fieldListId}
                          value={c.sourceColumn ?? ''}
                          placeholder="source field"
                          onChange={(e) => update(c.id, { sourceColumn: e.target.value || undefined })}
                        />
                        <datalist id={fieldListId}>
                          {tableCols.map((tc) => (
                            <option key={tc.name} value={tc.name}>
                              {tc.type ?? ''}
                            </option>
                          ))}
                        </datalist>
                      </>
                    )}
                    {kind === 'lookup' && (
                      <>
                        <input
                          list={fieldListId}
                          value={c.lookupField ?? ''}
                          placeholder="return field"
                          onChange={(e) => update(c.id, { lookupField: e.target.value || undefined })}
                        />
                        <datalist id={fieldListId}>
                          {(lookup?.returnFields ?? []).map((r) => (
                            <option key={r.field} value={r.newName || r.field}>
                              {r.field}
                            </option>
                          ))}
                        </datalist>
                      </>
                    )}
                    {kind === 'join' && (
                      <>
                        <input
                          list={fieldListId}
                          value={c.joinField ?? ''}
                          placeholder="returned field"
                          onChange={(e) => update(c.id, { joinField: e.target.value || undefined })}
                        />
                        <datalist id={fieldListId}>
                          {joinCols.map((jc) => (
                            <option key={jc.name} value={jc.name}>
                              {jc.type ?? ''}
                            </option>
                          ))}
                        </datalist>
                      </>
                    )}
                    {kind === 'constant' && (
                      <input
                        value={c.constantValue ?? ''}
                        placeholder="literal value"
                        onChange={(e) => update(c.id, { constantValue: e.target.value })}
                      />
                    )}
                    {kind === 'calculated' && (
                      <input
                        value={c.formula ?? ''}
                        placeholder="SQL expression"
                        onChange={(e) => update(c.id, { formula: e.target.value })}
                      />
                    )}
                    {(kind === 'audit' || kind === 'generated') && <span className="hint">DW-managed</span>}
                  </td>

                  <td className="chk">
                    {kind === 'direct' || kind === 'join' ? (
                      <input
                        type="checkbox"
                        checked={!!c.coalesce}
                        onChange={(e) => update(c.id, { coalesce: e.target.checked })}
                      />
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td>
                    {kind === 'direct' || kind === 'join' ? (
                      <input
                        value={c.coalesceDefault ?? ''}
                        placeholder="by type"
                        title="SQL literal, e.g. 0, -1 or 'No Value'. Empty = default by type."
                        disabled={!c.coalesce}
                        onChange={(e) => update(c.id, { coalesceDefault: e.target.value || undefined })}
                      />
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td className="chk">
                    {kind === 'direct' || kind === 'join' ? (
                      <input
                        type="checkbox"
                        checked={!!c.isTransient}
                        onChange={(e) => update(c.id, { isTransient: e.target.checked || undefined })}
                      />
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {columns.length === 0 && (
              <tr>
                <td colSpan={7} className="muted-txt" style={{ padding: 16 }}>
                  No columns yet. Add columns in the Columns tab first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
