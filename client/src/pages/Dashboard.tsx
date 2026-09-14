import { useStore } from '../store';
import { KIND_META } from '../ui';
import type { AnyEntity } from '@shared/types';

export default function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const model = useStore((s) => s.model);
  const setView = useStore((s) => s.setView);

  const all: AnyEntity[] = [...model.enumerations, ...model.dimensions, ...model.facts];
  const totalColumns = all.reduce((n, e) => n + e.columns.length, 0);
  const totalLookups = model.facts.reduce((n, f) => n + (f.dimensionLookups?.length ?? 0), 0);

  const stats = [
    { n: model.facts.length, l: 'Facts', color: KIND_META.fact.color },
    { n: model.dimensions.length, l: 'Dimensions', color: KIND_META.dimension.color },
    { n: model.enumerations.length, l: 'Enumerations', color: KIND_META.enumeration.color },
    { n: totalColumns, l: 'Total columns', color: '#38bdf8' },
    { n: totalLookups, l: 'Dimension lookups', color: '#f59e0b' },
    { n: model.auditProfiles.length, l: 'Audit profiles', color: '#e2e8f0' },
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setView('canvas')}>
          Open Canvas
        </button>
        <button className="btn primary" onClick={() => setView('json')}>
          View JSON / SQL
        </button>
      </div>

      <div className="grid" style={{ marginBottom: 22 }}>
        {stats.map((s) => (
          <div key={s.l} className="card">
            <div className="stat">
              <div className="n" style={{ color: s.color }}>
                {s.n}
              </div>
              <div className="l">{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginBottom: 10 }}>Model entities</h3>
      <div className="grid">
        {all.map((e) => {
          const meta = KIND_META[e.kind];
          return (
            <div key={e.id} className="card click" onClick={() => onOpen(e.id)}>
              <div className="title">
                <span className={`kindbar ${meta.badge}`} />
                {e.name}
              </div>
              <div className="sub">{e.displayName || meta.label}</div>
              <div className="meta">
                <span className={`badge ${meta.badge}`}>{meta.label}</span>
                {e.domain && <span className="badge muted">{e.domain}</span>}
                <span className="badge muted">{e.columns.length} cols</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
