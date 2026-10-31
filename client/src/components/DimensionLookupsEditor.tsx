import type { AnyEntity, DimensionLookup } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  lookups: DimensionLookup[];
  entities: AnyEntity[];
  onChange: (l: DimensionLookup[]) => void;
}

export default function DimensionLookupsEditor({ lookups, entities, onChange }: Props) {
  const dims = entities.filter((e) => e.kind === 'dimension' || e.kind === 'enumeration');

  function update(id: string, patch: Partial<DimensionLookup>) {
    onChange(lookups.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function add() {
    const first = dims[0];
    onChange([
      ...lookups,
      {
        id: uid('dl'),
        dimensionId: first?.id ?? '',
        dimensionTable: first?.name ?? '',
        sourceIdColumn: 'SYS_ID',
        targetSkColumn: 'DIM_KEY',
        defaultFallbackSk: -1,
        isMandatory: false,
      },
    ]);
  }
  function remove(id: string) {
    onChange(lookups.filter((l) => l.id !== id));
  }

  return (
    <div className="panel">
      <h3>Dimension lookups — surrogate-key resolution</h3>
      <div className="section-actions">
        <button className="btn sm primary" onClick={add} disabled={dims.length === 0}>
          + Add lookup
        </button>
        {dims.length === 0 && <span className="hint">Create a dimension first.</span>}
      </div>
      <div className="tbl-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Source ID column (stream)</th>
              <th>Target SK column (fact)</th>
              <th style={{ width: 90 }}>Fallback</th>
              <th className="chk">Mandatory</th>
              <th style={{ width: 140 }}>Role alias</th>
              <th style={{ width: 160 }}>Active condition</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lookups.map((l) => (
              <tr key={l.id}>
                <td>
                  <select
                    value={l.dimensionId}
                    onChange={(e) => {
                      const d = dims.find((x) => x.id === e.target.value);
                      update(l.id, { dimensionId: e.target.value, dimensionTable: d?.name ?? '' });
                    }}
                  >
                    {dims.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={l.sourceIdColumn} onChange={(e) => update(l.id, { sourceIdColumn: e.target.value })} />
                </td>
                <td>
                  <input value={l.targetSkColumn} onChange={(e) => update(l.id, { targetSkColumn: e.target.value })} />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.defaultFallbackSk}
                    onChange={(e) => update(l.id, { defaultFallbackSk: Number(e.target.value) })}
                  />
                </td>
                <td className="chk">
                  <input
                    type="checkbox"
                    checked={l.isMandatory}
                    onChange={(e) => update(l.id, { isMandatory: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={l.roleAlias ?? ''}
                    placeholder="invoicer"
                    onChange={(e) => update(l.id, { roleAlias: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={l.activeCondition ?? ''}
                    placeholder="DELETED = 0"
                    onChange={(e) => update(l.id, { activeCondition: e.target.value })}
                  />
                </td>
                <td>
                  <button className="btn sm ghost" onClick={() => remove(l.id)}>
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
