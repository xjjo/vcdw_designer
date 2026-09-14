import type { AnyEntity, LookupDef } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  lookups: LookupDef[];
  entities: AnyEntity[];
  onChange: (l: LookupDef[]) => void;
}

/** Generic, fully customizable lookups (maps 1:1 to the ETL generator lookup contract). */
export default function LookupsEditor({ lookups, entities, onChange }: Props) {
  function update(id: string, patch: Partial<LookupDef>) {
    onChange(lookups.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function csvToArr(v: string): string[] {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return (
    <div className="panel">
      <h3>Custom lookups</h3>
      <p className="hint">
        Comma-separate multiple fields. Return fields use the same order across the return columns.
      </p>
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...lookups,
              {
                id: uid('lk'),
                tableName: 'lookup_table',
                cache: true,
                streamKeyFields: ['SOURCE_ID'],
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
      {lookups.map((l) => (
        <div key={l.id} className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="field">
              <label>Lookup table</label>
              <input value={l.tableName} onChange={(e) => update(l.id, { tableName: e.target.value })} />
            </div>
            <div className="field">
              <label>Linked entity (diagram)</label>
              <select
                value={l.targetEntityId ?? ''}
                onChange={(e) => update(l.id, { targetEntityId: e.target.value || undefined })}
              >
                <option value="">— none —</option>
                {entities.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
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
                value={l.streamKeyFields.join(', ')}
                onChange={(e) => update(l.id, { streamKeyFields: csvToArr(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Lookup table key fields</label>
              <input
                value={l.tableKeyFields.join(', ')}
                onChange={(e) => update(l.id, { tableKeyFields: csvToArr(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Key conditions</label>
              <input
                value={(l.keyConditions ?? []).join(', ')}
                onChange={(e) => update(l.id, { keyConditions: csvToArr(e.target.value) })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Return fields</label>
              <input
                value={l.returnFields.map((r) => r.field).join(', ')}
                onChange={(e) =>
                  update(l.id, {
                    returnFields: csvToArr(e.target.value).map((f, i) => ({
                      field: f,
                      newName: l.returnFields[i]?.newName ?? f,
                      default: l.returnFields[i]?.default ?? '-1',
                      defaultType: l.returnFields[i]?.defaultType ?? 5,
                    })),
                  })
                }
              />
            </div>
            <div className="field">
              <label>Return defaults</label>
              <input
                value={l.returnFields.map((r) => r.default ?? '').join(', ')}
                onChange={(e) => {
                  const defs = csvToArr(e.target.value);
                  update(l.id, {
                    returnFields: l.returnFields.map((r, i) => ({ ...r, default: defs[i] ?? r.default })),
                  });
                }}
              />
            </div>
            <div className="field" style={{ maxWidth: 80, alignSelf: 'flex-end' }}>
              <button className="btn sm danger" onClick={() => onChange(lookups.filter((x) => x.id !== l.id))}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
