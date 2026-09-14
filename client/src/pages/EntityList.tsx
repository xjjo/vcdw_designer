import { useStore } from '../store';
import { KIND_META } from '../ui';
import type { Dimension, EntityKind, Enumeration, Fact } from '@shared/types';

export default function EntityList({ kind }: { kind: EntityKind }) {
  const model = useStore((s) => s.model);
  const addEntity = useStore((s) => s.addEntity);
  const select = useStore((s) => s.select);
  const deleteEntity = useStore((s) => s.deleteEntity);
  const meta = KIND_META[kind];

  const list =
    kind === 'enumeration' ? model.enumerations : kind === 'dimension' ? model.dimensions : model.facts;

  return (
    <div>
      <div className="page-head">
        <h1>{meta.label}s</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => addEntity(kind)}>
          + New {meta.label}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          No {meta.label.toLowerCase()}s yet. Create one to get started.
        </div>
      ) : (
        <div className="grid">
          {list.map((e) => (
            <div key={e.id} className="card click" onClick={() => select(e.id)}>
              <div className="title">
                <span className={`kindbar ${meta.badge}`} />
                {e.name}
              </div>
              <div className="sub">{e.displayName || meta.label}</div>
              <div className="meta">
                <span className={`badge ${meta.badge}`}>{meta.label}</span>
                {e.domain && <span className="badge muted">{e.domain}</span>}
                {kind === 'fact' && (
                  <span className="badge muted">{(e as Fact).factType}</span>
                )}
                {kind === 'dimension' && (e as Dimension).requiresStaging && (
                  <span className="badge stg">STG</span>
                )}
                {kind === 'enumeration' && (e as Enumeration).isReferenceTable && (
                  <span className="badge enum">REF</span>
                )}
                <span className="badge muted">{e.columns.length} cols</span>
              </div>
              <div className="meta" style={{ marginTop: 12 }}>
                <button
                  className="btn sm"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    select(e.id);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (confirm(`Delete ${e.name}?`)) deleteEntity(e.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
