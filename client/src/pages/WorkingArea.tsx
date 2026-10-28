import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { KIND_META } from '../ui';
import Collapsible from '../components/Collapsible';
import type { AnyEntity } from '@shared/types';

type SaveState = Record<string, 'idle' | 'busy' | 'ok' | 'err'>;

export default function WorkingArea() {
  const model = useStore((s) => s.model);
  const openEntity = useStore((s) => s.openEntity);
  const saveObject = useStore((s) => s.saveObject);
  const addEntity = useStore((s) => s.addEntity);
  const openView = useStore((s) => s.openView);
  const getEntity = useStore((s) => s.getEntity);
  const workingIds = useStore((s) => s.workingIds);
  const workingSet = useStore((s) => s.workingSet);
  const removeWorkingTable = useStore((s) => s.removeWorkingTable);
  const removeFromWorking = useStore((s) => s.removeFromWorking);
  const clearWorkingArea = useStore((s) => s.clearWorkingArea);
  const isDirty = useStore((s) => s.isDirty);

  const [saveState, setSaveState] = useState<SaveState>({});

  const workingObjects = useMemo(() => {
    return workingIds
      .map((id) => getEntity(id))
      .filter((e): e is AnyEntity => !!e);
  }, [workingIds, getEntity, model]);

  const dirtyCount = workingObjects.filter((e) => isDirty(e.id)).length;

  async function save(id: string) {
    setSaveState((s) => ({ ...s, [id]: 'busy' }));
    try {
      await saveObject(id);
      setSaveState((s) => ({ ...s, [id]: 'ok' }));
      setTimeout(() => setSaveState((s) => ({ ...s, [id]: 'idle' })), 2000);
    } catch {
      setSaveState((s) => ({ ...s, [id]: 'err' }));
      setTimeout(() => setSaveState((s) => ({ ...s, [id]: 'idle' })), 3000);
    }
  }

  function remove(id: string) {
    if (isDirty(id)) {
      const e = getEntity(id);
      if (
        !confirm(
          `"${e?.name ?? 'This object'}" has unsaved changes. Discard them and remove it from the working area?`,
        )
      )
        return;
    }
    removeFromWorking(id);
  }

  function clearAll() {
    if (workingObjects.length === 0) return;
    const msg =
      dirtyCount > 0
        ? `Discard changes and clear the working area? ${dirtyCount} object(s) have unsaved changes.`
        : 'Clear the working area? This removes all objects from your working set.';
    if (confirm(msg)) clearWorkingArea();
  }

  function saveLabel(id: string): string {
    const st = saveState[id] ?? 'idle';
    return st === 'busy' ? 'Saving…' : st === 'ok' ? 'Saved ✓' : st === 'err' ? 'Failed' : 'Save';
  }

  return (
    <div>
      <div className="page-head">
        <h1>Working Area</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          {workingObjects.length} object(s){dirtyCount > 0 ? ` · ${dirtyCount} unsaved` : ''}
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => addEntity('enumeration')}>
          + Enumeration
        </button>
        <button className="btn sm" onClick={() => addEntity('dimension')}>
          + Dimension
        </button>
        <button className="btn sm" onClick={() => addEntity('fact')}>
          + Fact
        </button>
        <button
          className="btn sm danger"
          style={{ marginLeft: 6 }}
          onClick={clearAll}
          disabled={workingObjects.length === 0}
          title="Discard all changes and empty the working area"
        >
          Clear working area
        </button>
      </div>

      <Collapsible
        title={`Working set (${workingObjects.length})`}
        subtitle="Objects you are working on. Click to open · changes are kept here until saved or removed."
        id="wa-working-set"
        defaultOpen
      >
        {workingObjects.length === 0 ? (
          <div className="empty">
            Nothing here yet. Create a new object above, or add one from a catalog with “+ Working area”.
          </div>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Columns</th>
                <th style={{ width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {workingObjects.map((e) => {
                const meta = KIND_META[e.kind];
                const dirty = isDirty(e.id);
                return (
                  <tr key={e.id}>
                    <td>
                      <span className={`kindbar ${meta.badge}`} />
                    </td>
                    <td
                      className="mono click"
                      style={{ cursor: 'pointer' }}
                      onClick={() => openEntity(e.id)}
                      title="Open"
                    >
                      {e.name}
                    </td>
                    <td>
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td>
                      {dirty ? (
                        <span className="badge" style={{ background: '#f5b30122', color: '#b7860b' }}>
                          Unsaved
                        </span>
                      ) : (
                        <span className="muted-txt">Saved</span>
                      )}
                    </td>
                    <td className="muted-txt">{e.columns.length}</td>
                    <td>
                      <button className="btn sm" onClick={() => openEntity(e.id)}>
                        Open
                      </button>
                      <button
                        className="btn sm primary"
                        style={{ marginLeft: 6 }}
                        onClick={() => save(e.id)}
                        disabled={(saveState[e.id] ?? 'idle') === 'busy'}
                      >
                        {saveLabel(e.id)}
                      </button>
                      <button
                        className="btn sm danger"
                        style={{ marginLeft: 6 }}
                        onClick={() => remove(e.id)}
                        title="Remove from working area"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Collapsible>

      <Collapsible
        title={`Referenceable tables (${workingSet.length})`}
        subtitle="Tables added here power the pickers in other objects' joins, mappings and lookups."
        id="wa-ref-tables"
        right={
          <button className="btn sm" onClick={() => openView('support')}>
            Browse support tables
          </button>
        }
      >
        {workingSet.length === 0 ? (
          <div className="empty">Nothing yet. Import support tables to reference them elsewhere.</div>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Origin</th>
                <th>Alias</th>
                <th>Columns</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {workingSet.map((t) => (
                <tr key={t.name}>
                  <td className="mono">{t.name}</td>
                  <td className="muted-txt">{t.origin}</td>
                  <td className="mono muted-txt">{t.alias || '—'}</td>
                  <td className="muted-txt">{t.columns.length}</td>
                  <td>
                    <button className="btn sm" onClick={() => removeWorkingTable(t.name)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Collapsible>
    </div>
  );
}
