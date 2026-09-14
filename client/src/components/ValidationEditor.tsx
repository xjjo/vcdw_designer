import type { ValidationRule } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  rules: ValidationRule[];
  onChange: (r: ValidationRule[]) => void;
}

export default function ValidationEditor({ rules, onChange }: Props) {
  function update(id: string, patch: Partial<ValidationRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  return (
    <div className="panel">
      <h3>Validation rules — quarantine to *_stg_error</h3>
      <p className="hint">A record is rejected to the error table when a rule condition is not met.</p>
      <div className="section-actions">
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...rules,
              {
                id: uid('vr'),
                ruleName: 'NewRule',
                condition: 'COLUMN IS NOT NULL',
                errorCode: 'ERR_CODE',
                errorMessage: 'Describe the error',
              },
            ])
          }
        >
          + Add rule
        </button>
      </div>
      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Rule name</th>
              <th>Condition (must be true to pass)</th>
              <th style={{ width: 180 }}>Error code</th>
              <th>Error message</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>
                  <input value={r.ruleName} onChange={(e) => update(r.id, { ruleName: e.target.value })} />
                </td>
                <td>
                  <input value={r.condition} onChange={(e) => update(r.id, { condition: e.target.value })} />
                </td>
                <td>
                  <input value={r.errorCode} onChange={(e) => update(r.id, { errorCode: e.target.value })} />
                </td>
                <td>
                  <input value={r.errorMessage} onChange={(e) => update(r.id, { errorMessage: e.target.value })} />
                </td>
                <td>
                  <button className="btn sm ghost" onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
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
