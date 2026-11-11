import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { KIND_META, downloadFile } from '../ui';
import { saveEnumerationDesign, fetchDbColumns, saveSupportTableDesign, fetchPacket, generateEtl } from '../api';
import type { EtlGenResult } from '../api';
import type {
  AnyEntity,
  Dimension,
  DimensionType,
  Enumeration,
  Fact,
  FactType,
  NetChangeSource,
} from '@shared/types';
import {
  materializeAuditColumns,
  standardProfilesFor,
  type StandardColumnProfile,
} from '@shared/templates';
import { entityToGenerator } from '@shared/generatorMap';
import { generateEntitySql, buildSourceSelectPreview, buildStreamLookupPreview, buildSourceTableDdl } from '@shared/sqlGenerator';
import type { DeploymentPacket } from '@shared/packet';
import { buildDesignerTables, workingTableFromEntity } from '../tableOptions';
import Collapsible from '../components/Collapsible';
import ColumnsEditor from '../components/ColumnsEditor';
import MappingEditor from '../components/MappingEditor';
import DimensionLookupsEditor from '../components/DimensionLookupsEditor';
import GeoCurrencyEditor from '../components/GeoCurrencyEditor';
import ValidationEditor from '../components/ValidationEditor';
import ReconcileEditor from '../components/ReconcileEditor';
import SourceTablesEditor from '../components/SourceTablesEditor';
import NcEditor from '../components/NcEditor';
import LookupsEditor from '../components/LookupsEditor';
import JoinsEditor from '../components/JoinsEditor';

type Tab =
  | 'general'
  | 'columns'
  | 'mapping'
  | 'sourceTables'
  | 'nc'
  | 'joins'
  | 'lookups'
  | 'relations'
  | 'validation'
  | 'reconcile'
  | 'geocurrency'
  | 'etl'
  | 'preview';

export default function EntityEditor({ entityId }: { entityId: string }) {
  const model = useStore((s) => s.model);
  const updateEntity = useStore((s) => s.updateEntity);
  const deleteEntity = useStore((s) => s.deleteEntity);
  const allEntities = useStore((s) => s.allEntities)();
  const workingSet = useStore((s) => s.workingSet);
  const addWorkingTable = useStore((s) => s.addWorkingTable);
  const refreshCatalogCounts = useStore((s) => s.refreshCatalogCounts);
  const [tab, setTab] = useState<Tab>('general');
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [packet, setPacket] = useState<DeploymentPacket | null>(null);
  const [packetBusy, setPacketBusy] = useState(false);
  const [packetError, setPacketError] = useState<string | null>(null);
  const [etl, setEtl] = useState<EtlGenResult | null>(null);
  const [etlBusy, setEtlBusy] = useState(false);
  const [etlError, setEtlError] = useState<string | null>(null);

  useEffect(() => {
    setPacket(null);
    setPacketError(null);
    setPacketBusy(false);
    setEtl(null);
    setEtlBusy(false);
    setEtlError(null);
  }, [entityId]);

  const entity = allEntities.find((e) => e.id === entityId) as AnyEntity | undefined;
  if (!entity) return <div className="empty">Entity not found.</div>;

  const meta = KIND_META[entity.kind];
  const isFact = entity.kind === 'fact';
  const isDim = entity.kind === 'dimension';
  const isEnum = entity.kind === 'enumeration';
  const isRefEnum = isEnum && !!(entity as Enumeration).isReferenceTable;

  function patch(p: Partial<AnyEntity>) {
    updateEntity({ ...entity, ...p } as AnyEntity);
  }

  async function saveToLibrary() {
    if (!isEnum) return;
    setSaveState('busy');
    try {
      await saveEnumerationDesign(entity as Enumeration);
      setSaveState('ok');
      void refreshCatalogCounts();
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('err');
      setTimeout(() => setSaveState('idle'), 3500);
    }
  }

  async function generatePacket() {
    setPacketBusy(true);
    setPacketError(null);
    try {
      setPacket(await fetchPacket(entity!, model.project.targetDatabase));
    } catch (err) {
      setPacket(null);
      setPacketError(err instanceof Error ? err.message : 'Failed to generate packet.');
    } finally {
      setPacketBusy(false);
    }
  }

  function downloadPacket() {
    if (!packet) return;
    const combined = packet.files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n');
    downloadFile(`${entity!.name}-packet.txt`, combined, 'text/plain');
  }

  async function generateEtlCode() {
    setEtlBusy(true);
    setEtlError(null);
    try {
      const r = await generateEtl(entity!);
      setEtl(r);
      if (!r.ok) setEtlError(r.error || 'Generation failed.');
    } catch (err) {
      setEtlError(err instanceof Error ? err.message : 'Failed to generate ETL code.');
    } finally {
      setEtlBusy(false);
    }
  }

  function downloadEtl() {
    if (!etl) return;
    const combined = etl.files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n');
    downloadFile(`${entity!.name}-etl-kettle.txt`, combined, 'text/plain');
  }

  const columnProfiles = standardProfilesFor(entity.kind);

  /** Classify a source table name into a support-table kind. */
  function classifySupport(name: string): 'nc' | 'dw' | 'other' {
    const n = name.toLowerCase();
    if (n.endsWith('_nc')) return 'nc';
    if (n.startsWith('dw_')) return 'dw';
    return 'other';
  }

  async function loadSourceColumns(name: string) {
    try {
      return (await fetchDbColumns(name)).columns;
    } catch {
      return [];
    }
  }

  function addSourceToWorkingArea(s: NetChangeSource) {
    if (!s.ncTable.trim()) return;
    addWorkingTable({
      name: s.ncTable,
      alias: s.alias || undefined,
      origin: 'support',
      columns: (s.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
    });
  }

  async function saveSourceToLibrary(s: NetChangeSource) {
    if (!s.ncTable.trim()) return;
    await saveSupportTableDesign({
      id: `support_${s.ncTable}`,
      kind: 'support',
      name: s.ncTable,
      tableKind: classifySupport(s.ncTable),
      alias: s.alias || undefined,
      origin: 'manual',
      columns: (s.columns ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type })),
    });
  }

  function insertProfile(profile: StandardColumnProfile) {
    const std = profile.build(entity!.name);
    const existing = new Set(entity!.columns.map((c) => c.name.toUpperCase()));
    const toAdd = std.filter((c) => !existing.has(c.name.toUpperCase()));
    patch({ columns: [...entity!.columns, ...toAdd] } as Partial<AnyEntity>);
  }

  function applyAudit() {
    const profile = model.auditProfiles.find((p) => p.id === entity!.auditProfileId) ?? model.auditProfiles[0];
    if (!profile) return;
    const existing = new Set(entity!.columns.map((c) => c.name.toUpperCase()));
    const toAdd = materializeAuditColumns(profile).filter((c) => !existing.has(c.name.toUpperCase()));
    patch({ columns: [...entity!.columns, ...toAdd], auditProfileId: profile.id } as Partial<AnyEntity>);
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'general', label: 'General', show: true },
    { id: 'columns', label: 'Columns', show: true },
    { id: 'mapping', label: 'Mapping', show: true },
    { id: 'sourceTables', label: 'Source Tables', show: true },
    { id: 'nc', label: 'NC', show: true },
    { id: 'joins', label: 'Joins', show: true },
    { id: 'lookups', label: 'Lookups', show: true },
    { id: 'relations', label: 'Dimension Links', show: isFact },
    { id: 'validation', label: 'Validation', show: isFact },
    { id: 'reconcile', label: 'Reconcile', show: isFact },
    { id: 'geocurrency', label: 'Geo / Currency', show: isFact },
    { id: 'etl', label: 'ETL Config', show: true },
    { id: 'preview', label: 'Preview', show: true },
  ];

  const generatorJson = JSON.stringify(entityToGenerator(entity), null, 2);
  const sql = generateEntitySql(entity, model.project.targetDatabase).full;

  const sourceSelect = buildSourceSelectPreview({
    sources: entity.netChange ?? [],
    joins: entity.joins ?? [],
    columns: entity.columns,
  });
  const lookupSteps = buildStreamLookupPreview({
    columns: entity.columns,
    lookups: entity.lookups ?? [],
  });

  const ncTables = (entity.netChange ?? []).filter((s) => (s.role ?? 'netchange') !== 'support');
  const ddlTables = (entity.netChange ?? []).filter((s) => s.createDdl && s.ncTable.trim());
  const sourceDdl = ddlTables
    .map((s) => buildSourceTableDdl({ name: s.ncTable, columns: s.columns, storageType: s.storageType }))
    .join('\n\n');

  const designerTables = buildDesignerTables(entity, workingSet);
  const inWorkingSet = workingSet.some(
    (t) => t.name.toLowerCase() === (isEnum ? (entity as Enumeration).enumTable ?? entity.name : entity.name).toLowerCase(),
  );

  return (
    <div className="editor">
      <div className="page-head">
        <span className={`kindbar ${meta.badge}`} />
        <h1>{entity.name}</h1>
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <div className="spacer" />
        <button
          className="btn sm"
          title="Make this object referenceable from other objects' pickers"
          onClick={() => addWorkingTable(workingTableFromEntity(entity))}
          disabled={inWorkingSet}
        >
          {inWorkingSet ? 'In working area ✓' : '+ Working area'}
        </button>
        {isEnum && (
          <button className="btn primary sm" onClick={saveToLibrary} disabled={saveState === 'busy'}>
            {saveState === 'busy'
              ? 'Saving…'
              : saveState === 'ok'
                ? 'Saved to library ✓'
                : saveState === 'err'
                  ? 'Save failed'
                  : 'Save to library'}
          </button>
        )}
        <button
          className="btn danger sm"
          onClick={() => {
            if (confirm(`Delete ${entity.name}?`)) deleteEntity(entity.id);
          }}
        >
          Delete
        </button>
      </div>

      <div className="tabs">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'general' && (
        <div className="panel">
          <div className="row">
            <div className="field">
              <label>Physical name</label>
              <input value={entity.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="field">
              <label>Display name</label>
              <input value={entity.displayName ?? ''} onChange={(e) => patch({ displayName: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 190 }}>
              <label>Domain</label>
              <select value={entity.domain ?? 'General'} onChange={(e) => patch({ domain: e.target.value })}>
                {['Logistics', 'Supply Chain Core', 'Manufacturing', 'Yard', 'General'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={2} value={entity.description ?? ''} onChange={(e) => patch({ description: e.target.value })} />
          </div>

          {isEnum && (
            <>
              <div className="row">
                <div className="field">
                  <label>ENUM_TYPE filter</label>
                  <input
                    value={(entity as Enumeration).enumTypeFilter ?? ''}
                    onChange={(e) => patch({ enumTypeFilter: e.target.value } as Partial<Enumeration>)}
                  />
                  <span className="hint">
                    Reference table, keys and name are derived from the Columns + Mapping tabs.
                  </span>
                </div>
                <div className="field" style={{ maxWidth: 220, alignSelf: 'flex-start' }}>
                  <label>&nbsp;</label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!(entity as Enumeration).isReferenceTable}
                      onChange={(e) => patch({ isReferenceTable: e.target.checked } as Partial<Enumeration>)}
                    />
                    Reference table (MemSQL)
                  </label>
                </div>
              </div>
            </>
          )}

          {isDim && (
            <>
              <div className="row">
                <div className="field">
                  <label>Surrogate key</label>
                  <input
                    value={(entity as Dimension).surrogateKey ?? ''}
                    onChange={(e) => patch({ surrogateKey: e.target.value } as Partial<Dimension>)}
                  />
                </div>
                <div className="field">
                  <label>Natural key</label>
                  <input
                    value={(entity as Dimension).naturalKey ?? ''}
                    onChange={(e) => patch({ naturalKey: e.target.value } as Partial<Dimension>)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ maxWidth: 220 }}>
                  <label>Dimension type</label>
                  <select
                    value={(entity as Dimension).dimensionType ?? 'simple'}
                    onChange={(e) => patch({ dimensionType: e.target.value as DimensionType } as Partial<Dimension>)}
                  >
                    <option value="simple">Simple</option>
                    <option value="staged">Staged</option>
                    <option value="geo">Geo</option>
                    <option value="hierarchical">Hierarchical</option>
                    <option value="multi_target">Multi-target</option>
                  </select>
                </div>
                <div className="field" style={{ maxWidth: 260 }}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!(entity as Dimension).nkUpdates}
                      onChange={(e) => patch({ nkUpdates: e.target.checked } as Partial<Dimension>)}
                    />
                    Natural-key updates
                  </label>
                  <span className="hint">Retire renamed rows (handle_nk_updates).</span>
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ maxWidth: 240 }}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!(entity as Dimension).requiresStaging}
                      onChange={(e) => patch({ requiresStaging: e.target.checked } as Partial<Dimension>)}
                    />
                    Requires staging (_stg)
                  </label>
                  <span className="hint">Enable for enrichment / multi-source consolidation.</span>
                </div>
                <div className="field" style={{ maxWidth: 260 }}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!(entity as Dimension).hasDefaultUnknownRow}
                      onChange={(e) => patch({ hasDefaultUnknownRow: e.target.checked } as Partial<Dimension>)}
                    />
                    Generate default -1 (Unknown) row
                  </label>
                </div>
              </div>
              {(entity as Dimension).requiresStaging && (
                <div className="row">
                  <div className="field">
                    <label>Staging table</label>
                    <input
                      value={(entity as Dimension).stgTable ?? ''}
                      onChange={(e) => patch({ stgTable: e.target.value } as Partial<Dimension>)}
                    />
                  </div>
                  <div className="field">
                    <label>Error table</label>
                    <input
                      value={(entity as Dimension).stgErrorTable ?? ''}
                      onChange={(e) => patch({ stgErrorTable: e.target.value } as Partial<Dimension>)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {isFact && (
            <>
              <div className="row">
                <div className="field" style={{ maxWidth: 220 }}>
                  <label>Fact type</label>
                  <select
                    value={(entity as Fact).factType}
                    onChange={(e) => patch({ factType: e.target.value as FactType } as Partial<Fact>)}
                  >
                    <option value="transaction">Transaction</option>
                    <option value="snapshot">Snapshot</option>
                    <option value="weekly_aggregation">Weekly aggregation</option>
                  </select>
                </div>
                <div className="field">
                  <label>Primary NC table</label>
                  <input
                    value={(entity as Fact).primaryNcTable ?? ''}
                    onChange={(e) => patch({ primaryNcTable: e.target.value } as Partial<Fact>)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Staging table</label>
                  <input
                    value={(entity as Fact).stagingTable ?? ''}
                    onChange={(e) => patch({ stagingTable: e.target.value } as Partial<Fact>)}
                  />
                </div>
                <div className="field">
                  <label>Error table</label>
                  <input
                    value={(entity as Fact).errorTable ?? ''}
                    onChange={(e) => patch({ errorTable: e.target.value } as Partial<Fact>)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Secondary NC tables (comma separated)</label>
                <input
                  value={((entity as Fact).secondaryNcTables ?? []).join(', ')}
                  onChange={(e) =>
                    patch({
                      secondaryNcTables: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    } as Partial<Fact>)
                  }
                />
              </div>
            </>
          )}

          {!isRefEnum && (
            <div className="row">
              <div className="field">
                <label>Shard key (MemSQL)</label>
                <input value={entity.shardKey ?? ''} onChange={(e) => patch({ shardKey: e.target.value })} />
              </div>
              <div className="field">
                <label>Sort keys (comma separated)</label>
                <input
                  value={(entity.sortKeys ?? []).join(', ')}
                  onChange={(e) => patch({ sortKeys: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
            </div>
          )}
          {isRefEnum && (
            <p className="hint">
              SingleStore <strong>reference</strong> tables are replicated — shard keys and sort keys
              don&apos;t apply, so they&apos;re hidden.
            </p>
          )}
        </div>
      )}

      {tab === 'columns' && (
        <ColumnsEditor
          kind={entity.kind}
          columns={entity.columns}
          entities={allEntities}
          profiles={columnProfiles}
          onChange={(columns) => patch({ columns })}
          onInsertProfile={insertProfile}
          onApplyAudit={applyAudit}
        />
      )}

      {tab === 'mapping' && (
        <MappingEditor
          columns={entity.columns}
          tables={designerTables}
          lookups={entity.lookups ?? []}
          joins={entity.joins ?? []}
          onChange={(columns) => patch({ columns })}
        />
      )}

      {tab === 'sourceTables' && (
        <SourceTablesEditor
          sources={entity.netChange ?? []}
          onChange={(netChange) => patch({ netChange })}
          tables={designerTables}
          onLoadColumns={loadSourceColumns}
          onAddToWorkingArea={addSourceToWorkingArea}
          onSaveToLibrary={saveSourceToLibrary}
        />
      )}

      {tab === 'nc' && (
        <NcEditor sources={entity.netChange ?? []} onChange={(netChange) => patch({ netChange })} />
      )}

      {tab === 'joins' && (
        <JoinsEditor
          joins={entity.joins ?? []}
          onChange={(joins) => patch({ joins })}
          sources={entity.netChange ?? []}
          columns={entity.columns}
          tables={designerTables}
        />
      )}
      {tab === 'lookups' && (
        <LookupsEditor
          lookups={entity.lookups ?? []}
          onChange={(lookups) => patch({ lookups })}
        />
      )}

      {tab === 'relations' && isFact && (
        <DimensionLookupsEditor
          lookups={(entity as Fact).dimensionLookups ?? []}
          entities={allEntities.filter((e) => e.id !== entity.id)}
          onChange={(dimensionLookups) => patch({ dimensionLookups } as Partial<Fact>)}
        />
      )}

      {tab === 'validation' && isFact && (
        <ValidationEditor
          rules={(entity as Fact).validationRules ?? []}
          onChange={(validationRules) => patch({ validationRules } as Partial<Fact>)}
        />
      )}

      {tab === 'reconcile' && isFact && (
        <ReconcileEditor fact={entity as Fact} onChange={(f) => updateEntity(f)} />
      )}

      {tab === 'geocurrency' && isFact && (
        <GeoCurrencyEditor
          geo={(entity as Fact).geoEnrichment ?? []}
          currency={(entity as Fact).currencyConversions ?? []}
          onGeoChange={(geoEnrichment) => patch({ geoEnrichment } as Partial<Fact>)}
          onCurrencyChange={(currencyConversions) => patch({ currencyConversions } as Partial<Fact>)}
        />
      )}

      {tab === 'etl' && (
        <div className="panel">
          <h3>ETL configuration</h3>
          <div className="row">
            <div className="field" style={{ maxWidth: 220 }}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={entity.etlConfig?.isEnabled ?? true}
                  onChange={(e) => patch({ etlConfig: { ...entity.etlConfig, isEnabled: e.target.checked } })}
                />
                Enabled
              </label>
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label>Priority (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={entity.etlConfig?.priority ?? 5}
                onChange={(e) => patch({ etlConfig: { ...entity.etlConfig, priority: Number(e.target.value) } })}
              />
            </div>
            {isFact && (
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Resource cost (1-4)</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={entity.etlConfig?.resourceCost ?? 2}
                  onChange={(e) => patch({ etlConfig: { ...entity.etlConfig, resourceCost: Number(e.target.value) } })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'preview' && (
        <>
          <Collapsible
            title={`Net-change tables (${ncTables.length})`}
            subtitle="Which source tables drive CDC, with the primary/secondary role and the Sys ID / LMD columns"
            id={`preview-nc-${entity.id}`}
            defaultOpen
          >
            {ncTables.length === 0 ? (
              <p className="hint">No net-change tables. Promote a source table in the NC tab.</p>
            ) : (
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Role</th>
                    <th>Sys ID column</th>
                    <th>LMD column</th>
                  </tr>
                </thead>
                <tbody>
                  {ncTables.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.ncTable || '(unnamed)'}</td>
                      <td>
                        <span className="badge">{s.isPrimary ? 'Primary' : 'Secondary'}</span>
                      </td>
                      <td className="mono muted-txt">{s.oltpTableSysId || '—'}</td>
                      <td className="mono muted-txt">{s.oltpTableLmd || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Collapsible>
          <Collapsible
            title="Source SELECT (Pentaho Table input)"
            subtitle="FROM + JOIN with the mapping's direct & join columns projected as the final names"
            id={`preview-source-select-${entity.id}`}
            defaultOpen
            right={
              <button
                className="btn sm"
                onClick={() => downloadFile(`${entity.name}.source.sql`, sourceSelect, 'text/sql')}
              >
                Download
              </button>
            }
          >
            <pre className="code-preview">{sourceSelect}</pre>
          </Collapsible>
          <Collapsible
            title="Lookup steps (added to the stream)"
            subtitle="Each lookup-mapped column appends a field to the Pentaho stream — not part of the SELECT"
            id={`preview-lookup-steps-${entity.id}`}
            defaultOpen={false}
          >
            <pre className="code-preview">{lookupSteps}</pre>
          </Collapsible>
          {ddlTables.length > 0 && (
            <Collapsible
              title={`Source table DDL (${ddlTables.length})`}
              subtitle="SingleStore CREATE TABLE for sources flagged with 'Generate DDL'"
              id={`preview-source-ddl-${entity.id}`}
              defaultOpen={false}
              right={
                <button
                  className="btn sm"
                  onClick={() => downloadFile(`${entity.name}.sources.sql`, sourceDdl, 'text/sql')}
                >
                  Download
                </button>
              }
            >
              <pre className="code-preview">{sourceDdl}</pre>
            </Collapsible>
          )}
          <Collapsible
            title="ETL generator JSON"
            subtitle="The narrower contract consumed by vcdw-etl-builder"
            id={`preview-generator-${entity.id}`}
            defaultOpen={false}
            right={
              <button
                className="btn sm"
                onClick={() => downloadFile(`${entity.name}.generator.json`, generatorJson, 'application/json')}
              >
                Download
              </button>
            }
          >
            <pre className="code">{generatorJson}</pre>
          </Collapsible>
          <Collapsible
            title="SQL (DDL + sample data)"
            subtitle="CREATE TABLE plus sample INSERTs for the target dialect"
            id={`preview-sql-${entity.id}`}
            defaultOpen={false}
            right={
              <button className="btn sm" onClick={() => downloadFile(`${entity.name}.sql`, sql, 'text/sql')}>
                Download
              </button>
            }
          >
            <pre className="code">{sql}</pre>
          </Collapsible>
          <Collapsible
            title="Deployment packet"
            subtitle="Full per-entity bundle (generator.json, DDL, control inserts, mapping CSVs, INSTALL.md) ready to drop into the VCDW DataWarehouse repo"
            id={`preview-packet-${entity.id}`}
            defaultOpen={false}
            right={
              packet ? (
                <button className="btn sm" onClick={downloadPacket}>
                  Download all
                </button>
              ) : undefined
            }
          >
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn primary sm" onClick={generatePacket} disabled={packetBusy}>
                {packetBusy ? 'Generating…' : 'Generate deployment packet'}
              </button>
              {packetError && <span className="badge error">{packetError}</span>}
            </div>
            {packet &&
              (packet.files.length === 0 ? (
                <p className="hint">Packet is empty for this entity.</p>
              ) : (
                packet.files.map((f) => (
                  <div key={f.path} style={{ marginBottom: 12 }}>
                    <div className="mono" style={{ fontWeight: 600, marginBottom: 4 }}>{f.path}</div>
                    <pre className="code">{f.content}</pre>
                  </div>
                ))
              ))}
          </Collapsible>
          <Collapsible
            title="ETL code (Kettle .ktr / .kjb)"
            subtitle="Generated by the vcdw-etl-builder Java app from this entity's generator JSON"
            id={`preview-etl-${entity.id}`}
            defaultOpen={false}
            right={
              etl && etl.files.length > 0 ? (
                <button className="btn sm" onClick={downloadEtl}>
                  Download all
                </button>
              ) : undefined
            }
          >
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn primary sm" onClick={generateEtlCode} disabled={etlBusy}>
                {etlBusy ? 'Generating…' : 'Generate ETL code'}
              </button>
              {etlError && <span className="badge error">{etlError}</span>}
            </div>
            {etl &&
              (etl.files.length === 0 ? (
                <pre className="code">{etl.log}</pre>
              ) : (
                etl.files.map((f) => (
                  <div key={f.path} style={{ marginBottom: 12 }}>
                    <div className="mono" style={{ fontWeight: 600, marginBottom: 4 }}>{f.path}</div>
                    <pre className="code">{f.content}</pre>
                  </div>
                ))
              ))}
          </Collapsible>
        </>
      )}
    </div>
  );
}
