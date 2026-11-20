import type { ValidationRule } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  rules: ValidationRule[];
  onChange: (r: ValidationRule[]) => void;
  /**
   * Staged dimensions: a rule is "driver field not null and every checked field null" (evaluated by the generated
   * "set error" step) instead of a SQL condition; the error code must be numeric.
   */
  dimensionMode?: boolean;
}

export default function ValidationEditor({ rules, onChange, dimensionMode }: Props) {
  function update(id: string, patch: Partial<ValidationRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  if (dimensionMode) {
    const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
    return (
      <div className="panel">
        <h3>Validation rules — ERROR / ERROR_MAP_VALUES on *_stg</h3>
        <p className="hint">
          A row goes to the error table when the driver field is not null and the checked fields are null (all of them,
          or any of them) — same rule as "Error if not found" in Lookups. Codes are numeric and unique.
        </p>
        <div className="section-actions">
          <button
            className="btn sm primary"
            onClick={() =>
              onChange([
                ...rules,
                { id: uid('vr'), ruleName: 'NewRule', condition: '', errorCode: '', errorMessage: 'FIELD Lookup Failed', driverField: '', checkFields: [] },
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
                <th>Driver field (not null)</th>
                <th>Checked fields</th>
                <th style={{ width: 120 }}>Error when</th>
                <th style={{ width: 90 }}>Code</th>
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
                    <input value={r.driverField ?? ''} onChange={(e) => update(r.id, { driverField: e.target.value })} />
                  </td>
                  <td>
                    <input value={(r.checkFields ?? []).join(', ')} onChange={(e) => update(r.id, { checkFields: csv(e.target.value) })} />
                  </td>
                  <td>
                    <select
                      value={r.checkMode ?? 'all'}
                      onChange={(e) => update(r.id, { checkMode: e.target.value === 'any' ? 'any' : undefined })}
                    >
                      <option value="all">all are null</option>
                      <option value="any">any is null</option>
                    </select>
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
