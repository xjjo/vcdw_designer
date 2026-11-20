import type { LookupDef, LookupReturnField } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  lookups: LookupDef[];
  onChange: (l: LookupDef[]) => void;
  /** Field names present in the read stream; used to suggest and validate stream keys (dimensions). */
  streamFields?: string[];
}

/** Kettle value types used by the Database Lookup step for return-field defaults. */
const VALUE_TYPES: { id: number; label: string }[] = [
  { id: 2, label: 'String' },
  { id: 5, label: 'Integer' },
  { id: 1, label: 'Number' },
  { id: 3, label: 'Date' },
  { id: 4, label: 'Boolean' },
];

/** Generic, fully customizable lookups (maps 1:1 to the ETL generator lookup contract). */
export default function LookupsEditor({ lookups, onChange, streamFields }: Props) {
  function update(id: string, patch: Partial<LookupDef>) {
    onChange(lookups.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function updateReturn(l: LookupDef, index: number, patch: Partial<LookupReturnField>) {
    update(l.id, { returnFields: l.returnFields.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }
  function csvToArr(v: string): string[] {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const known = new Set((streamFields ?? []).map((s) => s.toLowerCase()));

  return (
    <div className="panel">
      <h3>Lookups</h3>
      <p className="hint">
        Comma-separate multiple key fields (same order in the three key boxes). Stream keys must be field names of the
        read stream: the generator names every field after its target column in lower case, plus <code>oltp_id</code>{' '}
        and <code>is_deleted</code> (use <code>is_deleted</code> = <code>DELETED</code> for an active-row condition).
      </p>
      {streamFields && (
        <datalist id="lookup-stream-fields">
          {streamFields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...lookups,
              {
                id: uid('lk'),
                name: '',
                tableName: 'lookup_table',
                cache: true,
                orderBy: '',
                streamKeyFields: ['source_id'],
                tableKeyFields: ['OLTP_ID'],
                keyConditions: ['='],
                returnFields: [{ field: 'TARGET_KEY', newName: 'TARGET_KEY', default: '-1', defaultType: 5 }],
              },
            ])
          }
        >
          + Add lookup
        </button>
      </div>
      {lookups.map((l) => {
        const unknownKeys = streamFields ? l.streamKeyFields.filter((k) => !known.has(k.toLowerCase())) : [];
        return (
          <div key={l.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>Step name</label>
                <input value={l.name ?? ''} placeholder="Lookup …" onChange={(e) => update(l.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>Lookup table</label>
                <input value={l.tableName} onChange={(e) => update(l.id, { tableName: e.target.value })} />
              </div>
              <div className="field">
                <label>Order by (when several rows match)</label>
                <input
                  value={l.orderBy ?? ''}
                  placeholder="e.g. LAST_MODIFIED_DATE desc"
                  onChange={(e) => update(l.id, { orderBy: e.target.value })}
                />
              </div>
              <div className="field" style={{ maxWidth: 100 }}>
                <label className="check">
                  <input type="checkbox" checked={!!l.cache} onChange={(e) => update(l.id, { cache: e.target.checked })} />
                  Cache
                </label>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Stream key fields</label>
                <input
                  list={streamFields ? 'lookup-stream-fields' : undefined}
                  value={l.streamKeyFields.join(', ')}
                  onChange={(e) => update(l.id, { streamKeyFields: csvToArr(e.target.value) })}
                />
                {unknownKeys.length > 0 && (
                  <span className="badge error">Not in the stream: {unknownKeys.join(', ')}</span>
                )}
              </div>
              <div className="field">
                <label>Lookup table key fields</label>
                <input
                  value={l.tableKeyFields.join(', ')}
                  onChange={(e) => update(l.id, { tableKeyFields: csvToArr(e.target.value) })}
                />
              </div>
              <div className="field" style={{ maxWidth: 140 }}>
                <label>Key conditions</label>
                <input
                  value={(l.keyConditions ?? []).join(', ')}
                  onChange={(e) => update(l.id, { keyConditions: csvToArr(e.target.value) })}
                />
              </div>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Return field (lookup table)</th>
                  <th>Rename to (target column)</th>
                  <th>Default when not found</th>
                  <th style={{ width: 110 }}>Type</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {l.returnFields.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input value={r.field} onChange={(e) => updateReturn(l, i, { field: e.target.value })} />
                    </td>
                    <td>
                      <input value={r.newName ?? ''} onChange={(e) => updateReturn(l, i, { newName: e.target.value })} />
                    </td>
                    <td>
                      <input value={r.default ?? ''} onChange={(e) => updateReturn(l, i, { default: e.target.value })} />
                    </td>
                    <td>
                      <select
                        value={r.defaultType ?? 5}
                        onChange={(e) => updateReturn(l, i, { defaultType: Number(e.target.value) })}
                      >
                        {VALUE_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="btn sm"
                        title="Remove return field"
                        onClick={() => update(l.id, { returnFields: l.returnFields.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="section-actions" style={{ marginTop: 8 }}>
              <button
                className="btn sm"
                onClick={() =>
                  update(l.id, {
                    returnFields: [...l.returnFields, { field: 'NAME', newName: 'NAME', default: 'No Value', defaultType: 2 }],
                  })
                }
              >
                + Return field
              </button>
              <button className="btn sm danger" onClick={() => onChange(lookups.filter((x) => x.id !== l.id))}>
                Remove lookup
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
