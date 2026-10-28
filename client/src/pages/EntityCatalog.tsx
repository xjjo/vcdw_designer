import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { KIND_META } from '../ui';
import {
  deleteEntityCatalogEntry,
  fetchEntityCatalog,
  getEntityDesign,
} from '../api';
import type { CatalogKind, EntityCatalogRow } from '../api';
import type { AnyEntity, Dimension, Fact } from '@shared/types';
import NameModal from '../components/NameModal';

/** A unified row combining the file-backed catalog with in-session designs. */
interface Row {
  name: string;
  displayName?: string;
  table?: string;
  yaml?: string;
  /** present when the entity currently lives in the working model. */
  entity?: AnyEntity;
  /** present when a design YAML exists on the server. */
  inLibrary: boolean;
}

export default function EntityCatalog({ kind }: { kind: CatalogKind }) {
  const model = useStore((s) => s.model);
  const addEntity = useStore((s) => s.addEntity);
  const addDesign = useStore((s) => s.addDesign);
  const deleteEntity = useStore((s) => s.deleteEntity);
  const openEntity = useStore((s) => s.openEntity);
  const addToWorking = useStore((s) => s.addToWorking);
  const duplicateDesign = useStore((s) => s.duplicateDesign);
  const workingIds = useStore((s) => s.workingIds);
  const refreshCatalogCounts = useStore((s) => s.refreshCatalogCounts);
  const meta = KIND_META[kind];

  const localList = kind === 'dimension' ? model.dimensions : model.facts;

  const [catalog, setCatalog] = useState<EntityCatalogRow[]>([]);
  const [source, setSource] = useState('');
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState('');
  const [dupRow, setDupRow] = useState<Row | null>(null);

  function refresh() {
    fetchEntityCatalog(kind)
      .then((c) => {
        setCatalog(c.rows);
        setSource(c.source);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /** Catalog rows from the server, annotated with the matching working entity. */
  const rows = useMemo<Row[]>(() => {
    const byName = new Map<string, Row>();
    for (const r of catalog) {
      byName.set(r.name.toLowerCase(), {
        name: r.name,
        displayName: r.displayName,
        table: r.table,
        yaml: r.yaml,
        inLibrary: !!r.designed,
      });
    }
    // Attach the in-session entity only when it corresponds to a catalogued
    // object. New, unsaved objects stay in the Working Area — not the catalog.
    for (const e of localList) {
      const key = e.name.toLowerCase();
      const prev = byName.get(key);
      if (!prev) continue;
      byName.set(key, { ...prev, displayName: e.displayName || prev.displayName, entity: e });
    }
    const all = [...byName.values()];
    all.sort((a, b) => a.name.localeCompare(b.name));
    return all;
  }, [catalog, localList]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.displayName ?? '').toLowerCase().includes(term) ||
        (r.table ?? '').toLowerCase().includes(term),
    );
  }, [rows, q]);

  function openRow(row: Row) {
    if (row.entity) {
      openEntity(row.entity.id);
      return;
    }
    getEntityDesign(kind, row.name)
      .then((design) => {
        if (design) addDesign(design as Dimension | Fact);
      })
      .catch(() => {
        /* row exists only in catalog and library is unreachable */
      });
  }

  function addRowToWorking(row: Row) {
    if (row.entity) {
      addToWorking(row.entity.id);
      openEntity(row.entity.id);
      return;
    }
    getEntityDesign(kind, row.name)
      .then((design) => {
        if (design) addDesign(design as Dimension | Fact, { working: true });
      })
      .catch(() => {
        /* library unreachable */
      });
  }

  async function resolveDesign(row: Row): Promise<AnyEntity | null> {
    if (row.entity) return row.entity;
    return (await getEntityDesign(kind, row.name).catch(() => null)) as AnyEntity | null;
  }

  async function doDuplicate(name: string) {
    if (!dupRow) return;
    const design = await resolveDesign(dupRow);
    if (design) duplicateDesign(design, name);
    setDupRow(null);
  }

  async function removeRow(row: Row) {
    if (!confirm(`Remove ${row.name} from the ${meta.label.toLowerCase()} catalog?`)) return;
    if (row.entity) deleteEntity(row.entity.id);
    try {
      await deleteEntityCatalogEntry(kind, row.name);
    } catch {
      /* ignore when server is offline */
    }
    refresh();
    void refreshCatalogCounts();
  }

  const designedCount = rows.filter((r) => r.entity).length;

  return (
    <div>
      <div className="page-head">
        <span className={`kindbar ${meta.badge}`} />
        <h1>{meta.label}s</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {rows.length} in catalog · {designedCount} in model
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => addEntity(kind)}>
          + New {meta.label}
        </button>
      </div>

      <div className="segmented">
        <input
          className="search"
          placeholder={`Search ${meta.label.toLowerCase()}s…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="panel">
        {offline && (
          <p className="hint">
            Catalog API offline — showing in-session designs only. Start the server to persist.
          </p>
        )}
        {!offline && source && <p className="hint">Source: {source}</p>}
        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th>{meta.label}</th>
              <th>Table</th>
              <th>YAML</th>
              <th style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const inModel = !!r.entity;
              const working = !!r.entity && workingIds.includes(r.entity.id);
              return (
                <tr key={r.name}>
                  <td>
                    <span
                      className={`statusdot ${working ? 'ok' : ''}`}
                      title={working ? 'In working area' : r.inLibrary ? 'In YAML library' : 'Catalog only'}
                    />
                  </td>
                  <td className="mono">
                    {r.name}
                    {!inModel && r.inLibrary && (
                      <span className={`badge ${meta.badge}`} style={{ marginLeft: 8 }}>
                        YAML
                      </span>
                    )}
                  </td>
                  <td className="mono muted-txt">{r.table || '—'}</td>
                  <td className="mono muted-txt">{r.yaml || '—'}</td>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="muted-txt" style={{ padding: 16 }}>
                  No {meta.label.toLowerCase()}s yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dupRow && (
        <NameModal
          title={`Duplicate ${dupRow.name}`}
          label={`New ${meta.label.toLowerCase()} name`}
          initial={`${dupRow.name}_copy`}
          confirmLabel="Duplicate"
          onSubmit={doDuplicate}
          onClose={() => setDupRow(null)}
        />
      )}
    </div>
  );
}
