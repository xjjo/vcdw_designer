import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import {
  deleteSupportTable,
  fetchDbColumns,
  fetchSupportCatalog,
  getSupportTableDesign,
  listDbTables,
  saveSupportTableDesign,
} from '../api';
import type { SupportCatalogRow, DbTableRow } from '../api';
import type { SourceColumn, SupportTable, SupportTableKind } from '@shared/types';
import { uid } from '@shared/templates';
import Collapsible from '../components/Collapsible';

function colsToText(cols: SourceColumn[] = []): string {
  return cols.map((c) => (c.type ? `${c.name}:${c.type}` : c.name)).join('\n');
}
function textToCols(text: string): SourceColumn[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(':');
      const name = (idx >= 0 ? l.slice(0, idx) : l).trim();
      const type = idx >= 0 ? l.slice(idx + 1).trim() : '';
      return { id: uid('sc'), name, type: type || undefined };
    });
}

function classify(name: string): SupportTableKind {
  const n = name.toLowerCase();
  if (n.endsWith('_nc')) return 'nc';
  if (n.startsWith('dw_')) return 'dw';
  return 'other';
}

const KIND_LABEL: Record<SupportTableKind, string> = {
  nc: 'Net-change',
  dw: 'DW copy',
  other: 'Other',
};

export default function SupportTablesCatalog() {
  const addWorkingTable = useStore((s) => s.addWorkingTable);
  const workingSet = useStore((s) => s.workingSet);

  const [catalog, setCatalog] = useState<SupportCatalogRow[]>([]);
  const [source, setSource] = useState('');
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState('');

  // DB browse
  const [dbFilter, setDbFilter] = useState('');
  const [dbTables, setDbTables] = useState<DbTableRow[]>([]);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbError, setDbError] = useState('');

  // inline editor
  const [editing, setEditing] = useState<SupportTable | null>(null);
  const [colText, setColText] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  // per-row "update from DB" status keyed by table name
  const [rowSync, setRowSync] = useState<Record<string, 'busy' | 'ok' | 'err'>>({});

  function refresh() {
    fetchSupportCatalog()
      .then((c) => {
        setCatalog(c.rows);
        setSource(c.source);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }

  useEffect(refresh, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term));
  }, [catalog, q]);

  const inWorkingSet = (name: string) =>
    workingSet.some((t) => t.name.toLowerCase() === name.toLowerCase());

  async function searchDb() {
    setDbBusy(true);
    setDbError('');
    try {
      const { tables } = await listDbTables({ filter: dbFilter.trim() || undefined });
      setDbTables(tables.slice(0, 200));
    } catch (err) {
      setDbError((err as Error).message);
      setDbTables([]);
    } finally {
      setDbBusy(false);
    }
  }

  function startNew() {
    const t: SupportTable = {
      id: uid('support'),
      kind: 'support',
      name: 'new_table_nc',
      tableKind: 'nc',
      origin: 'manual',
      columns: [],
    };
    setEditing(t);
    setColText('');
  }

  async function editRow(name: string) {
    const design = await getSupportTableDesign(name).catch(() => null);
    const t: SupportTable =
      design ?? {
        id: uid('support'),
        kind: 'support',
        name,
        tableKind: classify(name),
        origin: 'manual',
        columns: [],
      };
    setEditing(t);
    setColText(colsToText(t.columns));
  }

  async function importFromDb(name: string) {
    setEditing({
      id: uid('support'),
      kind: 'support',
      name,
      tableKind: classify(name),
      origin: 'db',
      columns: [],
    });
    setColText('');
    try {
      const { columns } = await fetchDbColumns(name);
      setEditing((e) => (e ? { ...e, columns } : e));
      setColText(colsToText(columns));
    } catch (err) {
      setDbError((err as Error).message);
    }
  }

  async function loadDbColumns() {
    if (!editing) return;
    try {
      const { columns } = await fetchDbColumns(editing.name);
      setColText(colsToText(columns));
      setEditing({ ...editing, columns, origin: 'db' });
    } catch (err) {
      setDbError((err as Error).message);
    }
  }

  async function save() {
    if (!editing) return;
    const design: SupportTable = { ...editing, columns: textToCols(colText) };
    setSaveState('busy');
    try {
      await saveSupportTableDesign(design);
      setSaveState('ok');
      setTimeout(() => setSaveState('idle'), 2000);
      setEditing(null);
      refresh();
    } catch {
      setSaveState('err');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  function addToWorking(name: string, columns: SourceColumn[]) {
    addWorkingTable({
      name,
      origin: 'support',
      columns: columns.map((c) => ({ name: c.name, type: c.type })),
    });
  }

  async function addRowToWorking(name: string) {
    const design = await getSupportTableDesign(name).catch(() => null);
    let cols = design?.columns ?? [];
    if (!cols.length) {
      const res = await fetchDbColumns(name).catch(() => null);
      cols = res?.columns ?? [];
    }
    addToWorking(name, cols);
  }

  async function removeRow(name: string) {
    if (!confirm(`Remove support table "${name}" from the library?`)) return;
    await deleteSupportTable(name).catch(() => {});
    refresh();
  }

  /** Pull fresh columns from the DB and persist them, preserving existing metadata. */
  async function updateFromDb(name: string) {
    setRowSync((s) => ({ ...s, [name]: 'busy' }));
    try {
      const [existing, res] = await Promise.all([
        getSupportTableDesign(name).catch(() => null),
        fetchDbColumns(name),
      ]);
      const design: SupportTable = {
        id: existing?.id ?? uid('support'),
        kind: 'support',
        name,
        displayName: existing?.displayName,
        description: existing?.description,
        tableKind: existing?.tableKind ?? classify(name),
        alias: existing?.alias,
        origin: 'db',
        columns: res.columns,
      };
      await saveSupportTableDesign(design);
      setRowSync((s) => ({ ...s, [name]: 'ok' }));
      setTimeout(() => setRowSync((s) => { const n = { ...s }; delete n[name]; return n; }), 2000);
      refresh();
    } catch {
      setRowSync((s) => ({ ...s, [name]: 'err' }));
      setTimeout(() => setRowSync((s) => { const n = { ...s }; delete n[name]; return n; }), 3000);
    }
  }

  return (
    <div>
      <div className="page-head">
        <span className="kindbar sup" />
        <h1>Support Tables</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {catalog.length} in library · dw_* / *_nc
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={startNew}>
          + New support table
        </button>
      </div>

      <Collapsible
        title="Browse database"
        subtitle="Search the live warehouse for dw_* / *_nc tables and import their structure"
        id="support-browse-db"
        defaultOpen={false}
      >
        <div className="row">
          <div className="field">
            <label>Filter (contains)</label>
            <input
              value={dbFilter}
              placeholder="shipment, order_nc, dw_org…"
              onChange={(e) => setDbFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchDb()}
            />
          </div>
          <div className="field" style={{ maxWidth: 140, alignSelf: 'flex-end' }}>
            <button className="btn primary" onClick={searchDb} disabled={dbBusy}>
              {dbBusy ? 'Searching…' : 'Search DB'}
            </button>
          </div>
        </div>
        {dbError && <p className="hint" style={{ color: 'var(--danger,#c0392b)' }}>{dbError}</p>}
        {dbTables.length > 0 && (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Table</th>
                <th style={{ width: 110 }}>Kind</th>
                <th style={{ width: 200 }} />
              </tr>
            </thead>
            <tbody>
              {dbTables.map((t) => (
                <tr key={t.name}>
                  <td className="mono">{t.name}</td>
                  <td className="muted-txt">{KIND_LABEL[t.tableKind]}</td>
                  <td>
                    <button className="btn sm" onClick={() => importFromDb(t.name)}>
                      Import
                    </button>
                    <button
                      className="btn sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => addRowToWorking(t.name)}
                      disabled={inWorkingSet(t.name)}
                    >
                      {inWorkingSet(t.name) ? 'In working area' : '+ Working area'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Collapsible>

      {editing && (
        <div className="panel">
          <div className="section-actions">
            <h3 style={{ margin: 0, flex: 1 }}>Edit support table</h3>
            <button className="btn sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn sm primary" onClick={save} disabled={saveState === 'busy'}>
              {saveState === 'busy' ? 'Saving…' : saveState === 'ok' ? 'Saved ✓' : 'Save to library'}
            </button>
          </div>
          <div className="row">
            <div className="field">
              <label>Table name</label>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value, tableKind: classify(e.target.value) })
                }
              />
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label>Kind</label>
              <select
                value={editing.tableKind ?? 'other'}
                onChange={(e) => setEditing({ ...editing, tableKind: e.target.value as SupportTableKind })}
              >
                <option value="nc">Net-change (_nc)</option>
                <option value="dw">DW copy (dw_)</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Alias</label>
              <input
                value={editing.alias ?? ''}
                onChange={(e) => setEditing({ ...editing, alias: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: 150, alignSelf: 'flex-end' }}>
              <button className="btn sm" onClick={loadDbColumns}>
                Load columns from DB
              </button>
            </div>
          </div>
          <div className="field">
            <label>Display name</label>
            <input
              value={editing.displayName ?? ''}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Columns (one per line, name:type)</label>
            <textarea
              rows={8}
              value={colText}
              placeholder={'SYS_ID:BIGINT\nNAME:VARCHAR(256)'}
              onChange={(e) => setColText(e.target.value)}
            />
            <span className="hint">{textToCols(colText).length} columns.</span>
          </div>
          <button
            className="btn sm"
            onClick={() => addToWorking(editing.name, textToCols(colText))}
            disabled={inWorkingSet(editing.name)}
          >
            {inWorkingSet(editing.name) ? 'In working area' : '+ Add to working area'}
          </button>
        </div>
      )}

      <div className="segmented">
        <input
          className="search"
          placeholder="Search support tables…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="panel">
        {offline && (
          <p className="hint">Support-table API offline — start the server to browse & persist.</p>
        )}
        {!offline && source && <p className="hint">Source: {source}</p>}
        <table className="grid-table">
          <thead>
            <tr>
              <th>Table</th>
              <th style={{ width: 110 }}>Kind</th>
              <th style={{ width: 90 }}>YAML</th>
              <th style={{ width: 300 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name}>
                <td className="mono">
                  {r.name}
                  {inWorkingSet(r.name) && (
                    <span className="badge sup" style={{ marginLeft: 8 }}>
                      working
                    </span>
                  )}
                </td>
                <td className="muted-txt">{KIND_LABEL[r.tableKind ?? classify(r.name)]}</td>
                <td className="mono muted-txt">{r.designed ? '✓' : '—'}</td>
                <td>
                  <button className="btn sm" onClick={() => editRow(r.name)}>
                    Edit
                  </button>
                  <button
                    className="btn sm"
                    style={{ marginLeft: 6 }}
                    onClick={() => updateFromDb(r.name)}
                    disabled={rowSync[r.name] === 'busy'}
                    title="Refresh columns from the database"
                  >
                    {rowSync[r.name] === 'busy'
                      ? 'Updating…'
                      : rowSync[r.name] === 'ok'
                        ? 'Updated ✓'
                        : rowSync[r.name] === 'err'
                          ? 'Failed'
                          : 'Update from DB'}
                  </button>
                  <button
                    className="btn sm"
                    style={{ marginLeft: 6 }}
                    onClick={() => addRowToWorking(r.name)}
                    disabled={inWorkingSet(r.name)}
                  >
                    + Working area
                  </button>
                  <button className="btn sm danger" style={{ marginLeft: 6 }} onClick={() => removeRow(r.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="muted-txt" style={{ padding: 16 }}>
                  No support tables yet. Browse the database or create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
