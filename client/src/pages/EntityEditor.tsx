import { useState } from 'react';
import { useStore } from '../store';
import { KIND_META, downloadFile } from '../ui';
import type {
  AnyEntity,
  Column,
  Dimension,
  Enumeration,
  Fact,
  FactType,
} from '@shared/types';
import {
  materializeAuditColumns,
  standardDimensionColumns,
  standardEnumColumns,
  standardFactColumns,
} from '@shared/templates';
import { entityToGenerator } from '@shared/generatorMap';
import { generateEntitySql } from '@shared/sqlGenerator';
import ColumnsEditor from '../components/ColumnsEditor';
import DimensionLookupsEditor from '../components/DimensionLookupsEditor';
import GeoCurrencyEditor from '../components/GeoCurrencyEditor';
import ValidationEditor from '../components/ValidationEditor';
import NetChangeEditor from '../components/NetChangeEditor';
import LookupsEditor from '../components/LookupsEditor';
import JoinsEditor from '../components/JoinsEditor';

type Tab = 'general' | 'columns' | 'sources' | 'lookups' | 'relations' | 'validation' | 'etl' | 'preview';

export default function EntityEditor({ entityId }: { entityId: string }) {
  const model = useStore((s) => s.model);
  const updateEntity = useStore((s) => s.updateEntity);
  const deleteEntity = useStore((s) => s.deleteEntity);
  const select = useStore((s) => s.select);
  const allEntities = useStore((s) => s.allEntities)();
  const [tab, setTab] = useState<Tab>('general');

  const entity = allEntities.find((e) => e.id === entityId) as AnyEntity | undefined;
  if (!entity) return <div className="empty">Entity not found.</div>;

  const meta = KIND_META[entity.kind];
  const isFact = entity.kind === 'fact';
  const isDim = entity.kind === 'dimension';
  const isEnum = entity.kind === 'enumeration';

  function patch(p: Partial<AnyEntity>) {
    updateEntity({ ...entity, ...p } as AnyEntity);
  }

  function insertStandardColumns() {
    let std: Column[] = [];
    if (isEnum) std = standardEnumColumns(entity!.name);
    else if (isDim) std = standardDimensionColumns(entity!.name);
    else std = standardFactColumns(entity!.name);
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
    { id: 'sources', label: 'Sources & Joins', show: true },
    { id: 'lookups', label: 'Custom Lookups', show: true },
    { id: 'relations', label: 'Dimension Links', show: isFact },
    { id: 'validation', label: 'Validation', show: isFact },
    { id: 'etl', label: 'ETL Config', show: true },
    { id: 'preview', label: 'Preview', show: true },
  ];

  const generatorJson = JSON.stringify(entityToGenerator(entity), null, 2);
  const sql = generateEntitySql(entity, model.project.targetDatabase).full;

  return (
    <div className="editor">
      <div className="page-head">
        <button className="btn sm" onClick={() => select(null)}>
          ← Back
        </button>
        <span className={`kindbar ${meta.badge}`} />
        <h1>{entity.name}</h1>
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <div className="spacer" />
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
            <div className="row">
              <div className="field">
                <label>Source NC table</label>
                <input
                  value={(entity as Enumeration).sourceNcTable ?? ''}
                  onChange={(e) => patch({ sourceNcTable: e.target.value } as Partial<Enumeration>)}
                />
              </div>
              <div className="field">
                <label>ENUM_TYPE filter</label>
                <input
                  value={(entity as Enumeration).enumTypeFilter ?? ''}
                  onChange={(e) => patch({ enumTypeFilter: e.target.value } as Partial<Enumeration>)}
                />
              </div>
              <div className="field" style={{ maxWidth: 200, alignSelf: 'flex-end' }}>
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
        </div>
      )}

      {tab === 'columns' && (
        <ColumnsEditor
          kind={entity.kind}
          columns={entity.columns}
          entities={allEntities}
          onChange={(columns) => patch({ columns })}
          onInsertStandard={insertStandardColumns}
          onApplyAudit={applyAudit}
        />
      )}

      {tab === 'sources' && (
        <>
          <NetChangeEditor sources={entity.netChange ?? []} onChange={(netChange) => patch({ netChange })} />
          <JoinsEditor joins={entity.joins ?? []} onChange={(joins) => patch({ joins })} />
        </>
      )}

      {tab === 'lookups' && (
        <LookupsEditor
          lookups={entity.lookups ?? []}
          entities={allEntities.filter((e) => e.id !== entity.id)}
          onChange={(lookups) => patch({ lookups })}
        />
      )}

      {tab === 'relations' && isFact && (
        <>
          <DimensionLookupsEditor
            lookups={(entity as Fact).dimensionLookups ?? []}
            entities={allEntities.filter((e) => e.id !== entity.id)}
            onChange={(dimensionLookups) => patch({ dimensionLookups } as Partial<Fact>)}
          />
          <GeoCurrencyEditor
            geo={(entity as Fact).geoEnrichment ?? []}
            currency={(entity as Fact).currencyConversions ?? []}
            onGeoChange={(geoEnrichment) => patch({ geoEnrichment } as Partial<Fact>)}
            onCurrencyChange={(currencyConversions) => patch({ currencyConversions } as Partial<Fact>)}
          />
        </>
      )}

      {tab === 'validation' && isFact && (
        <ValidationEditor
          rules={(entity as Fact).validationRules ?? []}
          onChange={(validationRules) => patch({ validationRules } as Partial<Fact>)}
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
          <div className="panel">
            <div className="section-actions">
              <h3 style={{ margin: 0, flex: 1 }}>ETL generator JSON</h3>
              <button className="btn sm" onClick={() => downloadFile(`${entity.name}.generator.json`, generatorJson, 'application/json')}>
                Download
              </button>
            </div>
            <p className="hint">This is the narrower contract consumed by vcdw-etl-builder.</p>
            <pre className="code">{generatorJson}</pre>
          </div>
          <div className="panel">
            <div className="section-actions">
              <h3 style={{ margin: 0, flex: 1 }}>SQL (DDL + sample data)</h3>
              <button className="btn sm" onClick={() => downloadFile(`${entity.name}.sql`, sql, 'text/sql')}>
                Download
              </button>
            </div>
            <pre className="code">{sql}</pre>
          </div>
        </>
      )}
    </div>
  );
}
