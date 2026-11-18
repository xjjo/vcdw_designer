import { useEffect, useState } from 'react';
import {
  fetchConfig,
  saveConfig,
  testDbConnection,
  fetchDbEnumerations,
  scanEtl,
  trainEnumerations,
} from '../api';
import type { AppConfig, DbEnumRow, EtlScanResult, TrainEnumResult } from '../api';

const EMPTY: AppConfig = {
  db: { host: '', name: '', user: '', password: '', port: 3306 },
  etl: { root: '', enumerationsDir: '' },
  catalog: { enumCatalogPath: '' },
  etlBuilder: { appDir: '', pdiHome: '', enabled: true },
};

type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; message?: string };

export default function TrainView() {
  const [cfg, setCfg] = useState<AppConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Status>({ kind: 'idle' });
  const [dbStatus, setDbStatus] = useState<Status>({ kind: 'idle' });
  const [enumStatus, setEnumStatus] = useState<Status>({ kind: 'idle' });
  const [scanStatus, setScanStatus] = useState<Status>({ kind: 'idle' });
  const [dbRows, setDbRows] = useState<DbEnumRow[]>([]);
  const [scan, setScan] = useState<EtlScanResult | null>(null);
  const [trainStatus, setTrainStatus] = useState<Status>({ kind: 'idle' });
  const [trainResult, setTrainResult] = useState<TrainEnumResult | null>(null);

  useEffect(() => {
    fetchConfig()
      .then((c) => setCfg({ ...EMPTY, ...c, db: { ...EMPTY.db, ...c.db }, etl: { ...EMPTY.etl, ...c.etl }, catalog: { ...EMPTY.catalog, ...c.catalog }, etlBuilder: { ...EMPTY.etlBuilder, ...c.etlBuilder } }))
      .catch(() => setSaveStatus({ kind: 'err', message: 'Server offline — start the API to load/save configs.' }))
      .finally(() => setLoaded(true));
  }, []);

  function patchDb(p: Partial<AppConfig['db']>) {
    setCfg((c) => ({ ...c, db: { ...c.db, ...p } }));
  }
  function patchEtl(p: Partial<AppConfig['etl']>) {
    setCfg((c) => ({ ...c, etl: { ...c.etl, ...p } }));
  }
  function patchEtlBuilder(p: Partial<AppConfig['etlBuilder']>) {
    setCfg((c) => ({ ...c, etlBuilder: { ...c.etlBuilder, ...p } }));
  }

  async function onSave() {
    setSaveStatus({ kind: 'busy' });
    try {
      await saveConfig(cfg);
      setSaveStatus({ kind: 'ok', message: 'Configuration saved.' });
    } catch {
      setSaveStatus({ kind: 'err', message: 'Could not save (server offline).' });
    }
  }

  async function onTestDb() {
    setDbStatus({ kind: 'busy' });
    try {
      const r = await testDbConnection(cfg.db);
      setDbStatus({ kind: r.ok ? 'ok' : 'err', message: r.message });
    } catch {
      setDbStatus({ kind: 'err', message: 'Request failed (server offline or driver missing).' });
    }
  }

  async function onListEnums() {
    setEnumStatus({ kind: 'busy' });
    try {
      const r = await fetchDbEnumerations(cfg.db);
      setDbRows(r.rows);
      setEnumStatus({ kind: 'ok', message: `${r.count} enumeration source rows.` });
    } catch {
      setEnumStatus({ kind: 'err', message: 'Query failed (check connection / server).' });
    }
  }

  async function onScan() {
    setScanStatus({ kind: 'busy' });
    try {
      const r = await scanEtl(cfg.etl.enumerationsDir || cfg.etl.root);
      setScan(r);
      setScanStatus({ kind: 'ok', message: `Scanned ${r.scanned} files, found ${r.enumerations.length} enum transforms.` });
    } catch {
      setScanStatus({ kind: 'err', message: 'Scan failed (path not reachable from server).' });
    }
  }

  async function onTrain() {
    setTrainStatus({ kind: 'busy' });
    try {
      const r = await trainEnumerations();
      setTrainResult(r);
      setTrainStatus({
        kind: 'ok',
        message: `Generated ${r.generated} YAML designs (columns: ${r.columnsSource}).`,
      });
    } catch {
      setTrainStatus({ kind: 'err', message: 'Training failed (server offline?).' });
    }
  }

  function badge(s: Status) {
    if (s.kind === 'idle') return null;
    const cls = s.kind === 'ok' ? 'ok' : s.kind === 'err' ? 'err' : 'busy';
    const label = s.kind === 'busy' ? 'Working…' : s.message;
    return <span className={`status-pill ${cls}`}>{label}</span>;
  }

  return (
    <div>
      <div className="page-head">
        <h1>Train / Sources</h1>
        <span className="hint" style={{ marginLeft: 8 }}>
          Point the designer at your live warehouse and ETL code to keep the catalog current.
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={onSave} disabled={!loaded}>
          Save configuration
        </button>
        {badge(saveStatus)}
      </div>

      <p className="hint" style={{ marginBottom: 14 }}>
        Credentials are stored server-side in <span className="mono">server/data/config.yaml</span>.
        Leave the password blank to keep the previously saved value.
      </p>

      {/* Enumeration YAML library */}
      <div className="panel">
        <div className="section-actions">
          <h3 style={{ margin: 0, flex: 1 }}>Enumeration YAML library</h3>
          <button className="btn primary sm" onClick={onTrain} disabled={!loaded || trainStatus.kind === 'busy'}>
            {trainStatus.kind === 'busy' ? 'Training…' : 'Generate / rebuild library'}
          </button>
          {badge(trainStatus)}
        </div>
        <p className="hint">
          Discovers enumerations from the catalog (and the live warehouse when reachable) and
          writes one design YAML per enumeration plus <span className="mono">_catalog.yaml</span> into{' '}
          <span className="mono">server/data/enumerations/</span>. This is the file-based store the
          Enumerations catalog loads from — so a trained enum and a newly designed one are identical.
        </p>
        {trainResult && (
          <div className="scroll-box" style={{ maxHeight: 160 }}>
            <table className="grid-table">
              <tbody>
                <tr><td className="mono">generated</td><td className="mono">{trainResult.generated}</td></tr>
                <tr><td className="mono">columns source</td><td className="mono">{trainResult.columnsSource}</td></tr>
                <tr><td className="mono">catalog file</td><td className="mono">{trainResult.catalogFile}</td></tr>
                <tr><td className="mono">store dir</td><td className="mono">{trainResult.storeDir}</td></tr>
                {trainResult.errors.length > 0 && (
                  <tr><td className="mono">notes</td><td className="mono muted-txt">{trainResult.errors.slice(0, 3).join(' · ')}{trainResult.errors.length > 3 ? ` … (+${trainResult.errors.length - 3})` : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Step 1 — Database */}
      <div className="panel">
        <div className="section-actions">
          <h3 style={{ margin: 0, flex: 1 }}>1 · Warehouse database (MySQL / MemSQL)</h3>
          <button className="btn sm" onClick={onTestDb} disabled={!loaded}>
            Test connection
          </button>
          {badge(dbStatus)}
        </div>
        <div className="row">
          <div className="field">
            <label>Host</label>
            <input value={cfg.db.host} onChange={(e) => patchDb({ host: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Port</label>
            <input
              type="number"
              value={cfg.db.port}
              onChange={(e) => patchDb({ port: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Database</label>
            <input value={cfg.db.name} onChange={(e) => patchDb({ name: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>User</label>
            <input value={cfg.db.user} onChange={(e) => patchDb({ user: e.target.value })} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="•••••• (unchanged if blank)"
              value={cfg.db.password}
              onChange={(e) => patchDb({ password: e.target.value })}
            />
          </div>
        </div>

        <div className="section-actions" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={onListEnums} disabled={!loaded}>
            List enumerations from DB
          </button>
          {badge(enumStatus)}
        </div>
        {dbRows.length > 0 && (
          <div className="scroll-box">
            <table className="grid-table">
              <thead>
                <tr>
                  {Object.keys(dbRows[0]).slice(0, 6).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbRows.map((r, i) => (
                  <tr key={i}>
                    {Object.keys(dbRows[0]).slice(0, 6).map((k) => (
                      <td key={k} className="mono">{String(r[k] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Uses <span className="mono">select * from initial_load_require_nc where OLTP_TABLE = 'ENUMERATION'</span>.
        </p>
      </div>

      {/* Step 2 — ETL code */}
      <div className="panel">
        <div className="section-actions">
          <h3 style={{ margin: 0, flex: 1 }}>2 · ETL code (Pentaho .ktr / .kjb)</h3>
          <button className="btn sm" onClick={onScan} disabled={!loaded}>
            Scan for enum transforms
          </button>
          {badge(scanStatus)}
        </div>
        <div className="field">
          <label>ETL root</label>
          <input value={cfg.etl.root} onChange={(e) => patchEtl({ root: e.target.value })} />
        </div>
        <div className="field">
          <label>Enumerations directory</label>
          <input
            value={cfg.etl.enumerationsDir}
            onChange={(e) => patchEtl({ enumerationsDir: e.target.value })}
          />
        </div>
        <div className="field">
          <label>ETL builder app dir</label>
          <input
            value={cfg.etlBuilder.appDir}
            onChange={(e) => patchEtlBuilder({ appDir: e.target.value })}
          />
        </div>
        <div className="field">
          <label>PDI home override (optional)</label>
          <input
            value={cfg.etlBuilder.pdiHome}
            onChange={(e) => patchEtlBuilder({ pdiHome: e.target.value })}
          />
        </div>
        {scan && scan.enumerations.length > 0 && (
          <div className="scroll-box">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>ENUM_TYPE</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {scan.enumerations.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{e.enumType}</td>
                    <td className="mono muted-txt">{e.file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          A <span className="mono">.ktr</span> is treated as an enumeration when its SQL references{' '}
          <span className="mono">enum_type</span>.
        </p>
      </div>

      {/* Step 3 — Catalog file */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>3 · Enumeration catalog file</h3>
        <div className="field">
          <label>Catalog path (relative to workspace root)</label>
          <input
            value={cfg.catalog.enumCatalogPath}
            onChange={(e) => setCfg((c) => ({ ...c, catalog: { enumCatalogPath: e.target.value } }))}
          />
        </div>
        <p className="hint">
          Backs the Enumerations catalog view. Default:{' '}
          <span className="mono">knowledge/graph/etl/enum/enum_catalog.md</span>.
        </p>
      </div>
    </div>
  );
}
