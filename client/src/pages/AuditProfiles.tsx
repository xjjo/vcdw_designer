import { useStore } from '../store';
import type { AuditFieldProfile, Column } from '@shared/types';
import { col, uid } from '@shared/templates';

export default function AuditProfiles() {
  const profiles = useStore((s) => s.model.auditProfiles);
  const upsert = useStore((s) => s.upsertAuditProfile);
  const remove = useStore((s) => s.deleteAuditProfile);

  function addProfile() {
    upsert({
      id: uid('audit'),
      name: 'New Audit Profile',
      description: '',
      columns: [col({ name: 'DELETED', type: 'TINYINT(1)', default: '0', nullable: false, auditRole: 'deleted' })],
    });
  }

  function updateProfile(p: AuditFieldProfile, patch: Partial<AuditFieldProfile>) {
    upsert({ ...p, ...patch });
  }
  function updateCol(p: AuditFieldProfile, id: string, patch: Partial<Column>) {
    upsert({ ...p, columns: p.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  return (
    <div>
      <div className="page-head">
        <h1>Audit Profiles</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={addProfile}>
          + New Profile
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Reusable sets of audit columns you can apply to any enumeration, dimension or fact from its Columns tab.
      </p>

      {profiles.map((p) => (
        <div key={p.id} className="panel">
          <div className="row">
            <div className="field">
              <label>Profile name</label>
              <input value={p.name} onChange={(e) => updateProfile(p, { name: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Description</label>
              <input value={p.description ?? ''} onChange={(e) => updateProfile(p, { description: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 90, alignSelf: 'flex-end' }}>
              <button className="btn sm danger" onClick={() => remove(p.id)}>
                Delete
              </button>
            </div>
          </div>

          <div className="tbl-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Column</th>
                  <th style={{ width: 160 }}>Type</th>
                  <th style={{ width: 220 }}>Default</th>
                  <th style={{ width: 140 }}>Role</th>
                  <th className="chk">Null</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {p.columns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input value={c.name} onChange={(e) => updateCol(p, c.id, { name: e.target.value })} />
                    </td>
                    <td>
                      <input value={c.type} onChange={(e) => updateCol(p, c.id, { type: e.target.value })} />
                    </td>
                    <td>
                      <input value={c.default ?? ''} onChange={(e) => updateCol(p, c.id, { default: e.target.value })} />
                    </td>
                    <td>
                      <input value={c.auditRole ?? ''} onChange={(e) => updateCol(p, c.id, { auditRole: e.target.value })} />
                    </td>
                    <td className="chk">
                      <input
                        type="checkbox"
                        checked={c.nullable !== false}
                        onChange={(e) => updateCol(p, c.id, { nullable: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        className="btn sm ghost"
                        onClick={() => upsert({ ...p, columns: p.columns.filter((x) => x.id !== c.id) })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            onClick={() => upsert({ ...p, columns: [...p.columns, col({ name: 'NEW_AUDIT_COL', type: 'DATETIME(6)' })] })}
          >
            + Add column
          </button>
        </div>
      ))}
    </div>
  );
}
