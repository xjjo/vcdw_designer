import type { Fact, ReconcileDef } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  fact: Fact;
  onChange: (next: Fact) => void;
}

export default function ReconcileEditor({ fact, onChange }: Props) {
  const reconciles = fact.reconciles ?? [];

  function setRows(rows: ReconcileDef[]) {
    onChange({ ...fact, reconciles: rows });
  }
  function update(id: string, patch: Partial<ReconcileDef>) {
    setRows(reconciles.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="panel">
      <h3>Reconciliation — net-change reconcile transforms</h3>
      <p className="hint">
        Each row maps a net-change table to the Pentaho <code>.ktr</code> transform that reconciles its loaded rows.
      </p>
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() => setRows([...reconciles, { id: uid('rec'), ncTable: '', ktrFileName: '' }])}
        >
          + Add reconcile
        </button>
      </div>
      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>NC table</th>
              <th>KTR file name</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {reconciles.map((r) => (
              <tr key={r.id}>
                <td>
                  <input value={r.ncTable} onChange={(e) => update(r.id, { ncTable: e.target.value })} />
                </td>
                <td>
                  <input value={r.ktrFileName} onChange={(e) => update(r.id, { ktrFileName: e.target.value })} />
                </td>
                <td>
                  <button className="btn sm ghost" onClick={() => setRows(reconciles.filter((x) => x.id !== r.id))}>
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
