import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { deleteEnumCatalogEntry, fetchEnumCatalog, getEnumerationDesign } from '../api';
import type { CatalogRow } from '../api';
import { newEnumerationFromCatalog } from '@shared/templates';
import type { Enumeration } from '@shared/types';
import NameModal from '../components/NameModal';

type ViewMode = 'catalog' | 'favorites' | 'recent' | 'yaml';

/** Minimal YAML round-trip for the flat catalog list (avoids a client dep). */
function toCatalogYaml(rows: CatalogRow[]): string {
  const body = rows
    .map(
      (r) =>
        `  - enumType: ${r.enumType}\n    kjb: ${r.kjb}\n    enumeration: ${r.enumeration}`,
    )
    .join('\n');
  return `enumerations:\n${body}\n`;
}

function parseCatalogYaml(text: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  let cur: Partial<CatalogRow> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'enumerations:') continue;
    const m = line.match(/^-\s*enumType:\s*(.*)$/);
    if (m) {
      if (cur?.enumType) rows.push({ enumType: cur.enumType ?? '', kjb: cur.kjb ?? '', enumeration: cur.enumeration ?? '' });
      cur = { enumType: m[1].trim() };
      continue;
    }
    const kv = line.match(/^(enumType|kjb|enumeration):\s*(.*)$/);
    if (kv && cur) (cur as Record<string, string>)[kv[1]] = kv[2].trim();
  }
  if (cur?.enumType) rows.push({ enumType: cur.enumType ?? '', kjb: cur.kjb ?? '', enumeration: cur.enumeration ?? '' });
  return rows;
}

export default function EnumerationsCatalog() {
  const model = useStore((s) => s.model);
  const addEntity = useStore((s) => s.addEntity);
  const addEnumerationDesign = useStore((s) => s.addEnumerationDesign);
  const deleteEntity = useStore((s) => s.deleteEntity);
  const openEntity = useStore((s) => s.openEntity);
  const addToWorking = useStore((s) => s.addToWorking);
  const duplicateDesign = useStore((s) => s.duplicateDesign);
  const workingIds = useStore((s) => s.workingIds);
  const favoriteEnums = useStore((s) => s.favoriteEnums);
  const toggleFavoriteEnum = useStore((s) => s.toggleFavoriteEnum);
  const recentEnums = useStore((s) => s.recentEnums);
  const noteEnumUsed = useStore((s) => s.noteEnumUsed);
  const refreshCatalogCounts = useStore((s) => s.refreshCatalogCounts);

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('catalog');
  const [q, setQ] = useState('');
  const [yaml, setYaml] = useState('');
  const [dupRow, setDupRow] = useState<CatalogRow | null>(null);

  useEffect(() => {
    let live = true;
    fetchEnumCatalog()
      .then((c) => {
        if (!live) return;
        setRows(c.rows);
        setSource(c.source);
        setYaml(toCatalogYaml(c.rows));
      })
      .catch(() => live && setError('Catalog API unavailable — start the server or load configs in Train / Sources.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  /** Map an enumeration name -> model entity (name or enumTypeFilter match). */
  const designedByKey = useMemo(() => {
    const map = new Map<string, Enumeration>();
    for (const e of model.enumerations) {
      map.set(e.name.toLowerCase(), e);
      if (e.enumTypeFilter) map.set(e.enumTypeFilter.toLowerCase(), e);
    }
    return map;
  }, [model.enumerations]);

  function designedFor(row: CatalogRow): Enumeration | undefined {
    return designedByKey.get(row.enumeration.toLowerCase()) ?? designedByKey.get(row.enumType.toLowerCase());
  }

  const isFavorite = (row: CatalogRow) =>
    favoriteEnums.some((n) => n.toLowerCase() === (row.enumeration || row.enumType).toLowerCase());

  const inWorking = (row: CatalogRow) => {
    const e = designedFor(row);
    return !!e && workingIds.includes(e.id);
  };

  const baseFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let base = rows;
    if (mode === 'favorites') {
      const favs = new Set(favoriteEnums.map((n) => n.toLowerCase()));
      base = rows.filter((r) => favs.has((r.enumeration || r.enumType).toLowerCase()));
    } else if (mode === 'recent') {
      const order = new Map(recentEnums.map((n, i) => [n.toLowerCase(), i]));
      base = rows
        .filter((r) => order.has((r.enumeration || r.enumType).toLowerCase()))
        .sort(
          (a, b) =>
            (order.get((a.enumeration || a.enumType).toLowerCase()) ?? 0) -
            (order.get((b.enumeration || b.enumType).toLowerCase()) ?? 0),
        );
    }
    if (!term) return base;
    return base.filter(
      (r) =>
        r.enumeration.toLowerCase().includes(term) ||
        r.enumType.toLowerCase().includes(term) ||
        r.kjb.toLowerCase().includes(term),
    );
  }, [rows, q, mode, favoriteEnums, recentEnums]);

  /** Resolve a full design for a catalog row (library YAML preferred). */
  async function resolveDesign(row: CatalogRow): Promise<Enumeration> {
    const design = await getEnumerationDesign(row.enumeration).catch(() => null);
    return design ?? newEnumerationFromCatalog(row.enumeration, row.enumType, row.kjb);
  }

  function openRow(row: CatalogRow) {
    noteEnumUsed(row.enumeration || row.enumType);
    const existing = designedFor(row);
    if (existing) {
      openEntity(existing.id);
      return;
    }
    resolveDesign(row).then((design) => addEnumerationDesign(design));
  }

  function addRowToWorking(row: CatalogRow) {
    noteEnumUsed(row.enumeration || row.enumType);
    const existing = designedFor(row);
    if (existing) {
      addToWorking(existing.id);
      openEntity(existing.id);
      return;
    }
    resolveDesign(row).then((design) => addEnumerationDesign(design, { working: true }));
  }

  async function doDuplicate(name: string) {
    if (!dupRow) return;
    const design = await resolveDesign(dupRow);
    duplicateDesign({ ...design, kind: 'enumeration' }, name);
    setDupRow(null);
  }

  function applyYaml() {
    try {
      const parsed = parseCatalogYaml(yaml);
      setRows(parsed);
      setMode('catalog');
    } catch {
      alert('Could not parse the YAML. Check the indentation.');
    }
  }

  async function removeRow(row: CatalogRow) {
    if (!confirm(`Remove ${row.enumeration || row.enumType} from the catalog?`)) return;
    const existing = designedFor(row);
    if (existing) deleteEntity(existing.id);
    try {
      await deleteEnumCatalogEntry(row.enumeration);
    } catch {
      /* server offline: still drop it from the in-session list */
    }
    setRows((prev) => prev.filter((r) => r.enumeration !== row.enumeration));
    void refreshCatalogCounts();
  }

  const inCatalog = rows.length;
  const favCount = favoriteEnums.length;
  const recentCount = recentEnums.length;

  return (
    <div>
      <div className="page-head">
        <h1>Enumerations</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {inCatalog} in catalog · {favCount} favorites
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => addEntity('enumeration')}>
          + New Enumeration
        </button>
      </div>

      <div className="segmented">
        <button className={mode === 'catalog' ? 'active' : ''} onClick={() => setMode('catalog')}>
          Catalog ({inCatalog})
        </button>
        <button className={mode === 'favorites' ? 'active' : ''} onClick={() => setMode('favorites')}>
          ★ Favorites ({favCount})
        </button>
        <button className={mode === 'recent' ? 'active' : ''} onClick={() => setMode('recent')}>
          Recent ({recentCount})
        </button>
        <button
          className={mode === 'yaml' ? 'active' : ''}
          onClick={() => {
            setYaml(toCatalogYaml(rows));
            setMode('yaml');
          }}
        >
          YAML
        </button>
        {mode !== 'yaml' && (
          <input
            className="search"
            placeholder="Search enumerations…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
      </div>

      {mode !== 'yaml' && (
        <div className="panel">
          {loading && <div className="empty">Loading catalog…</div>}
          {error && !loading && <div className="empty">{error}</div>}
          {!loading && !error && (
            <>
              {mode === 'catalog' && source && <p className="hint">Source: {source}</p>}
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th style={{ width: 34 }} />
                    <th>Enumeration</th>
                    <th>ENUM_TYPE</th>
                    <th>KJB (transform)</th>
                    <th style={{ width: 260 }} />
                  </tr>
                </thead>
                <tbody>
                  {baseFiltered.map((r, i) => {
                    const working = inWorking(r);
                    const fav = isFavorite(r);
                    return (
                      <tr key={`${r.enumType}-${i}`}>
                        <td>
                          <span
                            className={`statusdot ${working ? 'ok' : ''}`}
                            title={working ? 'In working area' : 'In catalog'}
                          />
                        </td>
                        <td>
                          <button
                            className="iconbtn"
                            title={fav ? 'Remove from favorites' : 'Add to favorites'}
                            onClick={() => toggleFavoriteEnum(r.enumeration || r.enumType)}
                            style={{
                              color: fav ? '#f5b301' : 'var(--muted, #64748b)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 16,
                            }}
                          >
                            {fav ? '★' : '☆'}
                          </button>
                        </td>
                        <td className="mono">
                          {r.enumeration || <span className="muted-txt">—</span>}
                        </td>
                        <td className="mono">{r.enumType}</td>
                        <td className="mono muted-txt">{r.kjb || '—'}</td>
                        <td>
                          <button className="btn sm" onClick={() => openRow(r)}>
                            Open
                          </button>
                          <button
                            className="btn sm primary"
                            style={{ marginLeft: 6 }}
                            onClick={() => addRowToWorking(r)}
                            disabled={working}
                          >
                            {working ? 'In working area' : '+ Working area'}
                          </button>
                          <button
                            className="btn sm"
                            style={{ marginLeft: 6 }}
                            onClick={() => setDupRow(r)}
                            title="Duplicate under a new name"
                          >
                            Duplicate
                          </button>
                          <button
                            className="btn sm danger"
                            style={{ marginLeft: 6 }}
                            onClick={() => removeRow(r)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {baseFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted-txt" style={{ padding: 16 }}>
                        {mode === 'favorites'
                          ? 'No favorites yet. Star an enumeration to add it here.'
                          : mode === 'recent'
                            ? 'No recently used enumerations yet.'
                            : `No catalog rows match “${q}”.`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {mode === 'yaml' && (
        <div className="panel">
          <p className="hint">
            Editable YAML view of the enumeration catalog. “Apply” updates the in-session list
            (persisting back to the source file will be wired via Train / Sources).
          </p>
          <textarea
            className="yaml-editor"
            value={yaml}
            spellCheck={false}
            onChange={(e) => setYaml(e.target.value)}
            rows={22}
          />
          <div className="section-actions" style={{ marginTop: 10 }}>
            <button className="btn primary sm" onClick={applyYaml}>
              Apply
            </button>
            <button className="btn sm" onClick={() => setYaml(toCatalogYaml(rows))}>
              Reset
            </button>
          </div>
        </div>
      )}

      {dupRow && (
        <NameModal
          title={`Duplicate ${dupRow.enumeration || dupRow.enumType}`}
          label="New enumeration name"
          initial={`${dupRow.enumeration || dupRow.enumType}_copy`}
          confirmLabel="Duplicate"
          onSubmit={doDuplicate}
          onClose={() => setDupRow(null)}
        />
      )}
    </div>
  );
}
