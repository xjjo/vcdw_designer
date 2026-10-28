import type { Column, JoinDef, JoinType, NetChangeSource } from '@shared/types';
import { uid } from '@shared/templates';
import { buildSourceSelectPreview } from '@shared/sqlGenerator';
import type { DesignerTable } from '../tableOptions';
import { columnsForTable } from '../tableOptions';
import Collapsible from './Collapsible';

interface Props {
  joins: JoinDef[];
  onChange: (j: JoinDef[]) => void;
  sources: NetChangeSource[];
  columns: Column[];
  tables: DesignerTable[];
}

const TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL'];

export default function JoinsEditor({ joins, onChange, sources, columns, tables }: Props) {
  function update(id: string, patch: Partial<JoinDef>) {
    onChange(joins.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  /** When a table is picked from the datalist, prefill its suggested alias. */
  function pickTable(id: string, side: 'left' | 'right', value: string) {
    const opt = tables.find((o) => o.name === value);
    if (side === 'left') update(id, { leftTable: value, leftAlias: opt?.alias ?? undefined });
    else update(id, { rightTable: value, rightAlias: opt?.alias ?? undefined });
  }

  const preview = buildSourceSelectPreview({ sources, joins, columns });

  return (
    <div>
      <div className="panel">
        <div className="section-actions">
          <h3 style={{ margin: 0, flex: 1 }}>Joins between tables</h3>
          <button
            className="btn sm primary"
            onClick={() =>
              onChange([
                ...joins,
                {
                  id: uid('jn'),
                  leftTable: '',
                  rightTable: '',
                  joinType: 'LEFT',
                  onConditions: [{ left: '', op: '=', right: '' }],
                },
              ])
            }
          >
            + Add join
          </button>
        </div>
        <p className="hint">
          Join the source tables to dimensions, enumerations and support tables you added to the
          Working Area. Pick a table from the list or type any name; the alias is prefilled but
          editable.
        </p>
        <datalist id="jn-tables">
          {tables.map((o) => (
            <option key={`${o.group}:${o.name}`} value={o.name}>
              {o.group}
              {o.alias ? ` · ${o.alias}` : ''}
            </option>
          ))}
        </datalist>

        {joins.length === 0 && <p className="hint">No joins yet.</p>}

        {joins.map((j) => {
          const leftCols = columnsForTable(tables, j.leftAlias || j.leftTable);
          const rightCols = columnsForTable(tables, j.rightAlias || j.rightTable);
          const leftListId = `jl-${j.id}`;
          const rightListId = `jr-${j.id}`;
          const title = `${j.joinType} · ${j.leftTable || '?'} ⋈ ${j.rightTable || '?'}`;
          const sub = `${j.onConditions.length} condition${j.onConditions.length === 1 ? '' : 's'}`;
          return (
            <Collapsible
              key={j.id}
              title={title}
              subtitle={sub}
              id={`join-${j.id}`}
              defaultOpen={false}
              right={
                <button className="btn sm danger" onClick={() => onChange(joins.filter((x) => x.id !== j.id))}>
                  Remove
                </button>
              }
            >
              <datalist id={leftListId}>
                {leftCols.map((c) => (
                  <option key={c.name} value={`${j.leftAlias || j.leftTable}.${c.name}`} />
                ))}
              </datalist>
              <datalist id={rightListId}>
                {rightCols.map((c) => (
                  <option key={c.name} value={`${j.rightAlias || j.rightTable}.${c.name}`} />
                ))}
              </datalist>
              <div className="row">
                <div className="field">
                  <label>Left table</label>
                  <input
                    list="jn-tables"
                    value={j.leftTable}
                    placeholder="table or alias source"
                    onChange={(e) => pickTable(j.id, 'left', e.target.value)}
                  />
                </div>
                <div className="field" style={{ maxWidth: 80 }}>
                  <label>Alias</label>
                  <input value={j.leftAlias ?? ''} onChange={(e) => update(j.id, { leftAlias: e.target.value })} />
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
                  <input
                    list="jn-tables"
                    value={j.rightTable}
                    placeholder="dimension / enumeration / table"
                    onChange={(e) => pickTable(j.id, 'right', e.target.value)}
                  />
                </div>
                <div className="field" style={{ maxWidth: 80 }}>
                  <label>Alias</label>
                  <input value={j.rightAlias ?? ''} onChange={(e) => update(j.id, { rightAlias: e.target.value })} />
                </div>
              </div>
              <label className="hint">ON conditions</label>
              {j.onConditions.map((c, i) => (
                <div className="row" key={i} style={{ marginTop: 6 }}>
                  <input
                    list={leftListId}
                    value={c.left}
                    placeholder={j.leftAlias ? `${j.leftAlias}.col` : 'left.col'}
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
                    list={rightListId}
                    value={c.right}
                    placeholder={j.rightAlias ? `${j.rightAlias}.col` : 'right.col'}
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
            </Collapsible>
          );
        })}
      </div>

      <Collapsible title="SELECT preview" subtitle="Generated FROM + JOIN clause" id="joins-select-preview" defaultOpen>
        <pre className="code-preview">{preview}</pre>
      </Collapsible>
    </div>
  );
}
