import type { NetChangeSource } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  sources: NetChangeSource[];
  onChange: (s: NetChangeSource[]) => void;
}

export default function NetChangeEditor({ sources, onChange }: Props) {
  function update(id: string, patch: Partial<NetChangeSource>) {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  return (
    <div className="panel">
      <h3>Net-change (CDC) sources</h3>
      <p className="hint">OLTP tables and their _nc mirrors that feed this entity.</p>
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...sources,
              {
                id: uid('nc'),
                isPrimary: sources.length === 0,
                oltpTable: 'source_table',
                ncTable: 'source_table_nc',
                oltpTableSysId: 'sys_id',
                oltpTableLmd: 'last_modified_date',
              },
            ])
          }
        >
          + Add source
        </button>
      </div>
      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th className="chk">Primary</th>
              <th>OLTP table</th>
              <th>NC table</th>
              <th>Sys ID col</th>
              <th>LMD col</th>
              <th>Condition</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td className="chk">
                  <input
                    type="checkbox"
                    checked={!!s.isPrimary}
                    onChange={(e) => update(s.id, { isPrimary: e.target.checked })}
                  />
                </td>
                <td>
                  <input value={s.oltpTable} onChange={(e) => update(s.id, { oltpTable: e.target.value })} />
                </td>
                <td>
                  <input value={s.ncTable} onChange={(e) => update(s.id, { ncTable: e.target.value })} />
                </td>
                <td>
                  <input value={s.oltpTableSysId ?? ''} onChange={(e) => update(s.id, { oltpTableSysId: e.target.value })} />
                </td>
                <td>
                  <input value={s.oltpTableLmd ?? ''} onChange={(e) => update(s.id, { oltpTableLmd: e.target.value })} />
                </td>
                <td>
                  <input value={s.condition ?? ''} onChange={(e) => update(s.id, { condition: e.target.value })} />
                </td>
                <td>
                  <button className="btn sm ghost" onClick={() => onChange(sources.filter((x) => x.id !== s.id))}>
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
