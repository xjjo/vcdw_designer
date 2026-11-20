import { useState } from 'react';
import type { NetChangeSource, SourceColumn } from '@shared/types';
import { uid } from '@shared/templates';
import { buildSourceTableDdl } from '@shared/sqlGenerator';
import type { DesignerTable } from '../tableOptions';
import Collapsible from './Collapsible';

interface Props {
  sources: NetChangeSource[];
  onChange: (s: NetChangeSource[]) => void;
  /** Known tables (working area + dimensions + facts + enumerations) offered in the picker. */
  tables: DesignerTable[];
  /** Fetch a table's physical columns from the DB. */
  onLoadColumns: (name: string) => Promise<SourceColumn[]>;
  /** Make a source referenceable from other objects' pickers. */
  onAddToWorkingArea: (source: NetChangeSource) => void;
  /** Persist a source table into the reusable support-table library. */
  onSaveToLibrary: (source: NetChangeSource) => Promise<void>;
}

/** Common SingleStore column types offered as a quick-insert helper. */
const SINGLESTORE_TYPES = [
  'BIGINT',
  'INT',
  'SMALLINT',
  'TINYINT',
  'DECIMAL(18,4)',
  'DOUBLE',
  'FLOAT',
  'VARCHAR(256)',
  'CHAR(1)',
  'TEXT',
  'DATE',
  'DATETIME(6)',
  'TIMESTAMP',
  'TIME',
  'JSON',
  'BOOL',
];

/** Serialize source columns to `name:type` lines for compact editing. */
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

export default function SourceTablesEditor({
  sources,
  onChange,
  tables,
  onLoadColumns,
  onAddToWorkingArea,
  onSaveToLibrary,
}: Props) {
  const [colText, setColText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, 'idle' | 'load' | 'lib'>>({});
  const textFor = (s: NetChangeSource) => colText[s.id] ?? colsToText(s.columns);

  function update(id: string, patch: Partial<NetChangeSource>) {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function setColumns(id: string, text: string) {
    setColText((m) => ({ ...m, [id]: text }));
    update(id, { columns: textToCols(text) });
  }

  function insertType(s: NetChangeSource, type: string) {
    const current = textFor(s);
    const next = current.trim() ? `${current.replace(/\s*$/, '')}\nnew_column:${type}` : `new_column:${type}`;
    setColumns(s.id, next);
  }

  /** Picking a known table prefills its columns (when we have them). */
  function pickTable(id: string, name: string) {
    const known = tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (known && known.columns.length) {
      const cols: SourceColumn[] = known.columns.map((c) => ({ id: uid('sc'), name: c.name, type: c.type }));
      setColText((m) => ({ ...m, [id]: colsToText(cols) }));
      update(id, { ncTable: name, alias: known.alias || undefined, columns: cols });
    } else {
      update(id, { ncTable: name });
    }
  }

  async function loadFromDb(s: NetChangeSource) {
    setBusy((m) => ({ ...m, [s.id]: 'load' }));
    try {
      const cols = await onLoadColumns(s.ncTable);
      if (cols.length) {
        setColText((m) => ({ ...m, [s.id]: colsToText(cols) }));
        update(s.id, { columns: cols });
      }
    } finally {
      setBusy((m) => ({ ...m, [s.id]: 'idle' }));
    }
  }

  async function saveToLib(s: NetChangeSource) {
    setBusy((m) => ({ ...m, [s.id]: 'lib' }));
    try {
      await onSaveToLibrary({ ...s, columns: textToCols(textFor(s)) });
    } finally {
      setBusy((m) => ({ ...m, [s.id]: 'idle' }));
    }
  }

  return (
    <div className="panel">
      <div className="section-actions">
        <h3 style={{ margin: 0, flex: 1 }}>Source tables</h3>
        <button
          className="btn sm primary"
          onClick={() =>
            onChange([
              ...sources,
              {
                id: uid('src'),
                role: 'support',
                ncTable: 'source_table',
                alias: '',
                columns: [],
                createDdl: false,
                storageType: 'columnstore',
              },
            ])
          }
        >
          + Add source table
        </button>
      </div>
      <p className="hint">
        The tables available in the context of this design. Pick an existing object (Working Area,
        dimensions, facts, enumerations) or type any name to declare a new table. Net-change tables
        are selected in the <strong>NC</strong> tab.
      </p>

      <datalist id="src-tables">
        {tables.map((t) => (
          <option key={`${t.group}:${t.name}`} value={t.name}>
            {t.group}
            {t.alias ? ` · ${t.alias}` : ''}
          </option>
        ))}
      </datalist>

      {sources.length === 0 && <p className="hint">No source tables yet.</p>}

      {sources.map((s) => {
        const b = busy[s.id] ?? 'idle';
        const title = s.ncTable || '(unnamed)';
        const sub = `${s.alias ? `alias ${s.alias} · ` : ''}${(s.columns ?? []).length} columns${
          s.createDdl ? ` · DDL (${s.storageType ?? 'columnstore'})` : ''
        }`;
        const ddl = buildSourceTableDdl({
          name: s.ncTable,
          columns: textToCols(textFor(s)),
          storageType: s.storageType,
        });
        return (
          <Collapsible
            key={s.id}
            title={title}
            subtitle={sub}
            defaultOpen={false}
            right={
              <button className="btn sm danger" onClick={() => onChange(sources.filter((x) => x.id !== s.id))}>
                ✕
              </button>
            }
          >
            <div className="row">
              <div className="field">
                <label>Table name</label>
                <input list="src-tables" value={s.ncTable} onChange={(e) => pickTable(s.id, e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 90 }}>
                <label>Alias</label>
                <input
                  value={s.alias ?? ''}
                  placeholder="en"
                  onChange={(e) => update(s.id, { alias: e.target.value })}
                />
              </div>
            </div>

            {(s.role ?? 'netchange') === 'support' && (
              <div className="field">
                <label>Derived SQL (optional) — emitted as WITH {s.ncTable || '<table>'} AS (…)</label>
                <textarea
                  rows={4}
                  value={s.sql ?? ''}
                  placeholder={'select sys_item_id, max(SYS_PGRP_LEVEL_ID) as SYS_PGRP_LEVEL_ID\nfrom dw_item_pgrp_level_assoc group by sys_item_id'}
                  onChange={(e) => update(s.id, { sql: e.target.value })}
                />
                <span className="hint">Leave empty for a physical table. Joins reference the table name above.</span>
              </div>
            )}

            <div className="field">
              <label>Columns (one per line, name:type)</label>
              <textarea
                rows={5}
                value={textFor(s)}
                placeholder={'sys_enum_id:BIGINT\nenum_entry_name:VARCHAR(256)'}
                onChange={(e) => setColumns(s.id, e.target.value)}
              />
              <span className="hint">{(s.columns ?? []).length} columns declared.</span>
              <div className="type-palette">
                <span className="hint">Insert column with type:</span>
                {SINGLESTORE_TYPES.map((t) => (
                  <button key={t} type="button" className="btn sm ghost" onClick={() => insertType(s, t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <div className="field" style={{ maxWidth: 240 }}>
                <label className="check" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!s.createDdl}
                    onChange={(e) => update(s.id, { createDdl: e.target.checked })}
                  />
                  Generate CREATE TABLE DDL
                </label>
              </div>
              {s.createDdl && (
                <div className="field" style={{ maxWidth: 220 }}>
                  <label>Storage</label>
                  <select
                    value={s.storageType ?? 'columnstore'}
                    onChange={(e) =>
                      update(s.id, { storageType: e.target.value as NetChangeSource['storageType'] })
                    }
                  >
                    <option value="columnstore">Columnstore</option>
                    <option value="rowstore">In-memory rowstore</option>
                  </select>
                </div>
              )}
            </div>

            {s.createDdl && (
              <Collapsible title="CREATE TABLE (SingleStore)" subtitle="Preview of the generated DDL" defaultOpen={false}>
                <pre className="code-preview">{ddl}</pre>
              </Collapsible>
            )}

            <div className="section-actions">
              <button className="btn sm" onClick={() => loadFromDb(s)} disabled={b !== 'idle' || !s.ncTable}>
                {b === 'load' ? 'Loading…' : 'Load columns from DB'}
              </button>
              <button
                className="btn sm"
                onClick={() => onAddToWorkingArea({ ...s, columns: textToCols(textFor(s)) })}
              >
                + Working area
              </button>
              <button className="btn sm" onClick={() => saveToLib(s)} disabled={b !== 'idle' || !s.ncTable}>
                {b === 'lib' ? 'Saving…' : 'Save to library'}
              </button>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
