import { useEffect, useRef, useState } from 'react';
import { useStore, VIEW_TITLES } from './store';
import type { Tab, ViewId } from './store';
import { checkHealth, saveModel } from './api';
import { downloadFile } from './ui';
import type { DesignModel } from '@shared/types';
import Dashboard from './pages/Dashboard';
import EntityCatalog from './pages/EntityCatalog';
import EntityEditor from './pages/EntityEditor';
import AuditProfiles from './pages/AuditProfiles';
import JsonExplorer from './pages/JsonExplorer';
import EnumerationsCatalog from './pages/EnumerationsCatalog';
import SupportTablesCatalog from './pages/SupportTablesCatalog';
import WorkingArea from './pages/WorkingArea';
import TrainView from './pages/TrainView';

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'working', label: 'Working Area', icon: '◳' },
  { id: 'enumerations', label: 'Enumerations', icon: '#' },
  { id: 'dimensions', label: 'Dimensions', icon: '◆' },
  { id: 'facts', label: 'Facts', icon: '⚡' },
  { id: 'support', label: 'Support Tables', icon: '▤' },
  { id: 'audit', label: 'Audit Profiles', icon: '🛡' },
  { id: 'train', label: 'Train / Sources', icon: '⟳' },
  { id: 'json', label: 'JSON & SQL', icon: '{ }' },
];

function tabIcon(tab: Tab): string {
  if (tab.kind === 'entity') return '▤';
  return NAV.find((n) => n.id === tab.kind)?.icon ?? '•';
}

export default function App() {
  const {
    model,
    tabs,
    activeTabId,
    openView,
    openEntity,
    closeTab,
    activateTab,
    getEntity,
    loadSeed,
    importModel,
    catalogCounts,
    refreshCatalogCounts,
  } = useStore();
  const [online, setOnline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkHealth().then(setOnline);
    void refreshCatalogCounts();
  }, [refreshCatalogCounts]);

  const counts: Record<string, number> = {
    enumerations: catalogCounts.enumerations,
    dimensions: catalogCounts.dimensions,
    facts: catalogCounts.facts,
  };

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as DesignModel;
        importModel(parsed);
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

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  function tabTitle(tab: Tab): string {
    if (tab.kind === 'entity' && tab.entityId) {
      return getEntity(tab.entityId)?.name ?? tab.title;
    }
    return VIEW_TITLES[tab.kind as ViewId] ?? tab.title;
  }

  function renderActive() {
    if (!activeTab) return null;
    if (activeTab.kind === 'entity' && activeTab.entityId) {
      const entity = getEntity(activeTab.entityId);
      if (!entity) return <div className="empty">Entity not found. It may have been deleted.</div>;
      return <EntityEditor entityId={activeTab.entityId} />;
    }
    switch (activeTab.kind) {
      case 'dashboard':
        return <Dashboard onOpen={openEntity} />;
      case 'working':
        return <WorkingArea />;
      case 'enumerations':
        return <EnumerationsCatalog />;
      case 'dimensions':
        return <EntityCatalog kind="dimension" />;
      case 'facts':
        return <EntityCatalog kind="fact" />;
      case 'support':
        return <SupportTablesCatalog />;
      case 'audit':
        return <AuditProfiles />;
      case 'train':
        return <TrainView />;
      case 'json':
        return <JsonExplorer />;
      default:
        return null;
    }
  }

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
        {NAV.map((n) => {
          const active = activeTab?.id === `view:${n.id}`;
          return (
            <button
              key={n.id}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => openView(n.id)}
            >
              <span className="ico">{n.icon}</span>
              {n.label}
              {n.id in counts && <span className="count">{counts[n.id]}</span>}
            </button>
          );
        })}
      </aside>

      <div className="tabbar" role="tablist">
        {tabs.map((t) => {
          const active = t.id === activeTab?.id;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              className={`tabchip ${active ? 'active' : ''}`}
              onClick={() => activateTab(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && t.closable) {
                  e.preventDefault();
                  closeTab(t.id);
                }
              }}
              title={tabTitle(t)}
            >
              <span className="tabchip-ico">{tabIcon(t)}</span>
              <span className="tabchip-label">{tabTitle(t)}</span>
              {t.closable && (
                <span
                  className="tabchip-close"
                  role="button"
                  aria-label={`Close ${tabTitle(t)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                >
                  ×
                </span>
              )}
            </div>
          );
        })}
      </div>

      <main className="main">{renderActive()}</main>
    </div>
  );
}
