import { useState } from 'react';
import type { AnyEntity, Column, EntityKind } from '@shared/types';
import { col, type StandardColumnProfile } from '@shared/templates';

interface Props {
  kind: EntityKind;
  columns: Column[];
  entities: AnyEntity[];
  profiles: StandardColumnProfile[];
  onChange: (columns: Column[]) => void;
  onInsertProfile: (profile: StandardColumnProfile) => void;
  onApplyAudit: () => void;
}

const AGGS = ['NONE', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];

export default function ColumnsEditor({
  kind,
  columns,
  entities,
  profiles,
  onChange,
  onInsertProfile,
  onApplyAudit,
}: Props) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');

  function update(id: string, patch: Partial<Column>) {
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    onChange(columns.filter((c) => c.id !== id));
  }
  function add() {
    onChange([...columns, col({ name: 'NEW_COLUMN', type: 'VARCHAR(255)' })]);
  }
  function move(id: string, dir: -1 | 1) {
    const idx = columns.findIndex((c) => c.id === id);
    const to = idx + dir;
    if (to < 0 || to >= columns.length) return;
    const next = [...columns];
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange(next);
  }

  const dims = entities.filter((e) => e.kind === 'dimension' || e.kind === 'enumeration');
  const isFact = kind === 'fact';
  const selectedProfile = profiles.find((p) => p.id === profileId);

  return (
    <div className="panel">
      <div className="section-actions">
        <button className="btn sm primary" onClick={add}>
          + Add column
        </button>
        {profiles.length > 0 && (
          <>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              style={{ maxWidth: 320 }}
              title="Standard column preset"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              onClick={() => selectedProfile && onInsertProfile(selectedProfile)}
              title={selectedProfile?.description}
            >
              Insert standard columns
            </button>
          </>
        )}
        <button className="btn sm" onClick={onApplyAudit}>
          Apply audit profile
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          {columns.length} columns
        </span>
      </div>

      {columns.length === 0 && (
        <p className="hint">
          No columns yet. Use <strong>Insert standard columns</strong> to add the standard set for this
          object, or add columns manually. Source mapping is set in the Mapping tab.
        </p>
      )}

      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Name</th>
              <th style={{ width: 150 }}>SQL Type</th>
              <th className="chk">PK</th>
              <th className="chk">SK</th>
              <th className="chk">NK</th>
              <th className="chk">FK</th>
              {isFact && <th className="chk">Msr</th>}
              {isFact && <th style={{ width: 90 }}>Agg</th>}
              <th className="chk">Null</th>
              <th style={{ width: 130 }}>Default</th>
              <th style={{ width: 150 }}>FK / Formula</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.id}>
                <td>
                  <input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
                </td>
                <td>
                  <input value={c.type} onChange={(e) => update(c.id, { type: e.target.value })} />
                </td>
                <td className="chk">
                  <input type="checkbox" checked={!!c.isPk} onChange={(e) => update(c.id, { isPk: e.target.checked })} />
                </td>
                <td className="chk">
                  <input
                    type="checkbox"
                    checked={!!c.isSk}
                    onChange={(e) => update(c.id, { isSk: e.target.checked, autoIncrement: e.target.checked || c.autoIncrement })}
                  />
                </td>
                <td className="chk">
                  <input
                    type="checkbox"
                    checked={!!c.isNaturalKey}
                    onChange={(e) => update(c.id, { isNaturalKey: e.target.checked })}
                  />
                </td>
                <td className="chk">
                  <input type="checkbox" checked={!!c.isFk} onChange={(e) => update(c.id, { isFk: e.target.checked })} />
                </td>
                {isFact && (
                  <td className="chk">
                    <input
                      type="checkbox"
                      checked={!!c.isMeasure}
                      onChange={(e) => update(c.id, { isMeasure: e.target.checked })}
                    />
                  </td>
                )}
                {isFact && (
                  <td>
                    <select
                      value={c.aggregation ?? 'NONE'}
                      onChange={(e) => update(c.id, { aggregation: e.target.value as Column['aggregation'] })}
                    >
                      {AGGS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="chk">
                  <input
                    type="checkbox"
                    checked={c.nullable !== false}
                    onChange={(e) => update(c.id, { nullable: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={c.default ?? ''}
                    onChange={(e) => update(c.id, { default: e.target.value })}
                  />
                </td>
                <td>
                  {c.isFk ? (
                    <select
                      value={c.referencedEntityId ?? ''}
                      onChange={(e) => update(c.id, { referencedEntityId: e.target.value })}
                    >
                      <option value="">— ref —</option>
                      {dims.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : isFact && c.isMeasure ? (
                    <input
                      placeholder="formula (optional)"
                      value={c.formula ?? ''}
                      onChange={(e) => update(c.id, { formula: e.target.value, isCalculated: !!e.target.value })}
                    />
                  ) : (
                    <span className="hint">—</span>
                  )}
                </td>
                <td>
                  <button className="btn sm ghost" title="up" onClick={() => move(c.id, -1)}>
                    ↑
                  </button>
                  <button className="btn sm ghost" title="down" onClick={() => move(c.id, 1)}>
                    ↓
                  </button>
                  <button className="btn sm ghost" title="delete" onClick={() => remove(c.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
