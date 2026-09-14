import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import type { ViewId } from './store';
import { checkHealth, saveModel } from './api';
import { downloadFile } from './ui';
import type { DesignModel } from '@shared/types';
import Dashboard from './pages/Dashboard';
import EntityList from './pages/EntityList';
import EntityEditor from './pages/EntityEditor';
import CanvasView from './pages/CanvasView';
import AuditProfiles from './pages/AuditProfiles';
import JsonExplorer from './pages/JsonExplorer';

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'enumerations', label: 'Enumerations', icon: '#' },
  { id: 'dimensions', label: 'Dimensions', icon: '◆' },
  { id: 'facts', label: 'Facts', icon: '⚡' },
  { id: 'canvas', label: 'Star-Schema Canvas', icon: '🕸' },
  { id: 'audit', label: 'Audit Profiles', icon: '🛡' },
  { id: 'json', label: 'JSON & SQL', icon: '{ }' },
];

export default function App() {
  const { model, view, selectedEntityId, setView, select, loadSeed, importModel } = useStore();
  const [online, setOnline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkHealth().then(setOnline);
  }, []);

  const counts = {
    enumerations: model.enumerations.length,
    dimensions: model.dimensions.length,
    facts: model.facts.length,
  };

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as DesignModel;
        importModel(parsed);
        setView('dashboard');
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleExport() {
    downloadFile('vcdw-model.json', JSON.stringify(model, null, 2), 'application/json');
  }

  async function handleSaveServer() {
    try {
      await saveModel(model);
      alert('Model saved on the server.');
    } catch {
      alert('Server not reachable. The model is still saved locally in your browser.');
    }
  }

  function goEntity(id: string) {
    select(id);
    const kind = useStore.getState().getEntity(id)?.kind;
    if (kind === 'enumeration') setView('enumerations');
    else if (kind === 'dimension') setView('dimensions');
    else if (kind === 'fact') setView('facts');
  }

  const showingEditor =
    (view === 'enumerations' || view === 'dimensions' || view === 'facts') && selectedEntityId;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          VC<span>DW</span> Designer
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={loadSeed}>
          Load Example
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <button className="btn sm" onClick={handleExport}>
          Export JSON
        </button>
        <button className="btn sm" onClick={handleSaveServer}>
          Save to Server
        </button>
        <div className="health">
          <span className={`dot ${online ? 'ok' : ''}`} />
          {online ? 'API online' : 'API offline'}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </header>

      <aside className="sidebar">
        <div className="proj">
          <div className="name">{model.project.name}</div>
          <div className="ver">
            v{model.project.version} · {model.project.targetDatabase}
          </div>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? 'active' : ''}`}
            onClick={() => {
              select(null);
              setView(n.id);
            }}
          >
            <span className="ico">{n.icon}</span>
            {n.label}
            {n.id in counts && <span className="count">{(counts as Record<string, number>)[n.id]}</span>}
          </button>
        ))}
      </aside>

      <main className="main">
        {view === 'dashboard' && <Dashboard onOpen={goEntity} />}
        {view === 'enumerations' && !showingEditor && <EntityList kind="enumeration" />}
        {view === 'dimensions' && !showingEditor && <EntityList kind="dimension" />}
        {view === 'facts' && !showingEditor && <EntityList kind="fact" />}
        {showingEditor && <EntityEditor entityId={selectedEntityId!} />}
        {view === 'canvas' && <CanvasView />}
        {view === 'audit' && <AuditProfiles />}
        {view === 'json' && <JsonExplorer />}
      </main>
    </div>
  );
}
