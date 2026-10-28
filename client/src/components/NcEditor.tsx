import type { NetChangeSource } from '@shared/types';

interface Props {
  /** The full source-table list; NC tables are the subset flagged as net-change. */
  sources: NetChangeSource[];
  onChange: (s: NetChangeSource[]) => void;
}

const roleOf = (s: NetChangeSource) => s.role ?? 'netchange';
const isNc = (s: NetChangeSource) => roleOf(s) !== 'support';

export default function NcEditor({ sources, onChange }: Props) {
  const ncTables = sources.filter(isNc);
  const supportTables = sources.filter((s) => !isNc(s));

  function update(id: string, patch: Partial<NetChangeSource>) {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addNc() {
    const first = supportTables[0];
    if (!first) return;
    const firstPrimary = !sources.some(isNc);
    update(first.id, { role: 'netchange', isPrimary: firstPrimary });
  }

  function removeNc(id: string) {
    update(id, { role: 'support', isPrimary: false });
  }

  function setPrimary(id: string, primary: boolean) {
    onChange(
      sources.map((s) => {
        if (!isNc(s)) return s;
        if (s.id === id) return { ...s, isPrimary: primary };
        // Enforce a single primary across net-change tables.
        return primary ? { ...s, isPrimary: false } : s;
      }),
    );
  }

  /** Re-point an NC row to a different source table (flips the net-change flag). */
  function reassign(currentId: string, newName: string) {
    const current = sources.find((s) => s.id === currentId);
    const target = sources.find((s) => s.id !== currentId && s.ncTable === newName);
    if (!target) return;
    onChange(
      sources.map((s) => {
        if (s.id === currentId) return { ...s, role: 'support', isPrimary: false };
        if (s.id === target.id) return { ...s, role: 'netchange', isPrimary: current?.isPrimary ?? false };
        return s;
      }),
    );
  }

  return (
    <div className="panel">
      <div className="section-actions">
        <h3 style={{ margin: 0, flex: 1 }}>NC — net-change tables</h3>
        <button className="btn sm primary" onClick={addNc} disabled={supportTables.length === 0}>
          + Add NC
        </button>
      </div>
      <p className="hint">
        Mark which <strong>source tables</strong> drive net-change (CDC) and which one is{' '}
        <strong>primary</strong>. Sys ID and LMD are chosen from the columns declared for the table
        in the <strong>Source Tables</strong> tab.
      </p>

      {sources.length === 0 && (
        <p className="hint">Declare source tables first, then select which ones are net-change here.</p>
      )}
      {sources.length > 0 && ncTables.length === 0 && (
        <p className="hint">No net-change tables yet. Use “+ Add NC” to promote a source table.</p>
      )}

      {ncTables.map((s) => {
        const cols = s.columns ?? [];
        const options = [s, ...supportTables];
        return (
          <div key={s.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>Table name</label>
                <select value={s.ncTable} onChange={(e) => reassign(s.id, e.target.value)}>
                  {options.map((o) => (
                    <option key={o.id} value={o.ncTable}>
                      {o.ncTable || '(unnamed)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ maxWidth: 150 }}>
                <label>Role</label>
                <select
                  value={s.isPrimary ? 'primary' : 'secondary'}
                  onChange={(e) => setPrimary(s.id, e.target.value === 'primary')}
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </div>
              <div className="field" style={{ maxWidth: 70, alignSelf: 'flex-end' }}>
                <button className="btn sm danger" onClick={() => removeNc(s.id)}>
                  Remove
                </button>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>OLTP table</label>
                <input value={s.oltpTable ?? ''} onChange={(e) => update(s.id, { oltpTable: e.target.value })} />
              </div>
              <div className="field">
                <label>Sys ID column</label>
                <select
                  value={s.oltpTableSysId ?? ''}
                  onChange={(e) => update(s.id, { oltpTableSysId: e.target.value })}
                >
                  <option value="">— select —</option>
                  {cols.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>LMD column</label>
                <select
                  value={s.oltpTableLmd ?? ''}
                  onChange={(e) => update(s.id, { oltpTableLmd: e.target.value })}
                >
                  <option value="">— select —</option>
                  {cols.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Condition</label>
                <input value={s.condition ?? ''} onChange={(e) => update(s.id, { condition: e.target.value })} />
              </div>
            </div>
            {cols.length === 0 && (
              <p className="hint">
                No columns declared for this table — add them in the Source Tables tab to pick Sys ID / LMD.
              </p>
            )}
          </div>
        );
      })}

      {ncTables.length > 0 && !ncTables.some((s) => s.isPrimary) && (
        <p className="hint" style={{ color: 'var(--danger, #c0392b)' }}>
          No primary net-change table selected — the source SELECT needs one for its FROM clause.
        </p>
      )}
    </div>
  );
}
