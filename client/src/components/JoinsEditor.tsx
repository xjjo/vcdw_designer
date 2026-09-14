import type { JoinDef, JoinType } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  joins: JoinDef[];
  onChange: (j: JoinDef[]) => void;
}

const TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL'];

export default function JoinsEditor({ joins, onChange }: Props) {
  function update(id: string, patch: Partial<JoinDef>) {
    onChange(joins.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }
  return (
    <div className="panel">
      <h3>Custom joins between source tables</h3>
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...joins,
              {
                id: uid('jn'),
                leftTable: 'left_table',
                rightTable: 'right_table',
                joinType: 'LEFT',
                onConditions: [{ left: 'l.id', op: '=', right: 'r.id' }],
              },
            ])
          }
        >
          + Add join
        </button>
      </div>
      {joins.map((j) => (
        <div key={j.id} className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="field">
              <label>Left table</label>
              <input value={j.leftTable} onChange={(e) => update(j.id, { leftTable: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Type</label>
              <select value={j.joinType} onChange={(e) => update(j.id, { joinType: e.target.value as JoinType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Right table</label>
              <input value={j.rightTable} onChange={(e) => update(j.id, { rightTable: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 80, alignSelf: 'flex-end' }}>
              <button className="btn sm danger" onClick={() => onChange(joins.filter((x) => x.id !== j.id))}>
                Remove
              </button>
            </div>
          </div>
          <label className="hint">ON conditions</label>
          {j.onConditions.map((c, i) => (
            <div className="row" key={i} style={{ marginTop: 6 }}>
              <input
                value={c.left}
                onChange={(e) => {
                  const next = [...j.onConditions];
                  next[i] = { ...c, left: e.target.value };
                  update(j.id, { onConditions: next });
                }}
              />
              <input
                style={{ maxWidth: 60 }}
                value={c.op}
                onChange={(e) => {
                  const next = [...j.onConditions];
                  next[i] = { ...c, op: e.target.value };
                  update(j.id, { onConditions: next });
                }}
              />
              <input
                value={c.right}
                onChange={(e) => {
                  const next = [...j.onConditions];
                  next[i] = { ...c, right: e.target.value };
                  update(j.id, { onConditions: next });
                }}
              />
              <button
                className="btn sm ghost"
                onClick={() => update(j.id, { onConditions: j.onConditions.filter((_, idx) => idx !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn sm"
            style={{ marginTop: 8 }}
            onClick={() => update(j.id, { onConditions: [...j.onConditions, { left: '', op: '=', right: '' }] })}
          >
            + condition
          </button>
        </div>
      ))}
    </div>
  );
}
