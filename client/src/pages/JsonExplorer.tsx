import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store';
import { downloadFile } from '../ui';
import { generateModelSql } from '@shared/sqlGenerator';
import { entityToGenerator } from '@shared/generatorMap';
import type { DesignModel } from '@shared/types';

type Tab = 'design' | 'generator' | 'sql';

export default function JsonExplorer() {
  const model = useStore((s) => s.model);
  const setModel = useStore((s) => s.setModel);
  const entities = useStore((s) => s.allEntities)();
  const [tab, setTab] = useState<Tab>('design');
  const [draft, setDraft] = useState<string>(() => JSON.stringify(model, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>(entities[0]?.id ?? '');
  const [rows, setRows] = useState(3);

  // keep the draft in sync when the model changes from elsewhere
  const modelJson = useMemo(() => JSON.stringify(model, null, 2), [model]);

  const generatorJson = useMemo(() => {
    const e = entities.find((x) => x.id === selectedEntity);
    return e ? JSON.stringify(entityToGenerator(e), null, 2) : '// select an entity';
  }, [entities, selectedEntity]);

  const sql = useMemo(() => generateModelSql(model, rows), [model, rows]);

  function applyDraft() {
    try {
      const parsed = JSON.parse(draft) as DesignModel;
      if (!parsed.project) throw new Error('Missing "project" root property.');
      setModel(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>JSON &amp; SQL</h1>
        <div className="spacer" />
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'design' ? 'active' : ''}`} onClick={() => setTab('design')}>
          Design JSON
        </button>
        <button className={`tab ${tab === 'generator' ? 'active' : ''}`} onClick={() => setTab('generator')}>
          ETL Generator JSON
        </button>
        <button className={`tab ${tab === 'sql' ? 'active' : ''}`} onClick={() => setTab('sql')}>
          SQL (DDL + data)
        </button>
      </div>

      {tab === 'design' && (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={applyDraft}>
              Apply changes to model
            </button>
            <button className="btn" onClick={() => setDraft(modelJson)}>
              Reset from model
            </button>
            <button
              className="btn"
              onClick={() => downloadFile('vcdw-model.json', modelJson, 'application/json')}
            >
              Download
            </button>
            {error && <span style={{ color: 'var(--error)', alignSelf: 'center' }}>⚠ {error}</span>}
          </div>
          <div className="code-wrap">
            <Editor
              defaultLanguage="json"
              theme="vs-dark"
              value={draft}
              onChange={(v) => setDraft(v ?? '')}
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        </>
      )}

      {tab === 'generator' && (
        <>
          <div className="toolbar">
            <select value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)}>
              {entities.map((en) => (
                <option key={en.id} value={en.id}>
                  [{en.kind}] {en.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => {
                const e = entities.find((x) => x.id === selectedEntity);
                if (e) downloadFile(`${e.name}.generator.json`, generatorJson, 'application/json');
              }}
            >
              Download
            </button>
            <span className="hint" style={{ alignSelf: 'center' }}>
              Contract consumed by vcdw-etl-builder (type = fact / dimension / enumeration).
            </span>
          </div>
          <div className="code-wrap">
            <Editor
              defaultLanguage="json"
              theme="vs-dark"
              value={generatorJson}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        </>
      )}

      {tab === 'sql' && (
        <>
          <div className="toolbar">
            <label className="check">
              Sample rows:
              <input
                type="number"
                min={0}
                max={50}
                value={rows}
                style={{ width: 70 }}
                onChange={(e) => setRows(Number(e.target.value))}
              />
            </label>
            <button className="btn" onClick={() => downloadFile('vcdw-model.sql', sql, 'text/sql')}>
              Download .sql
            </button>
          </div>
          <div className="code-wrap">
            <Editor
              defaultLanguage="sql"
              theme="vs-dark"
              value={sql}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        </>
      )}
    </div>
  );
}
