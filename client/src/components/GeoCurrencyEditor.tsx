import type { CurrencyConversion, GeoEnrichment } from '@shared/types';
import { uid } from '@shared/templates';

interface Props {
  geo: GeoEnrichment[];
  currency: CurrencyConversion[];
  onGeoChange: (g: GeoEnrichment[]) => void;
  onCurrencyChange: (c: CurrencyConversion[]) => void;
}

export default function GeoCurrencyEditor({ geo, currency, onGeoChange, onCurrencyChange }: Props) {
  function updGeo(id: string, patch: Partial<GeoEnrichment>) {
    onGeoChange(geo.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function updCur(id: string, patch: Partial<CurrencyConversion>) {
    onCurrencyChange(currency.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <>
      <div className="panel">
        <h3>Geo enrichment</h3>
        <div className="section-actions">
          <button
            className="btn sm primary"
            onClick={() =>
              onGeoChange([
                ...geo,
                {
                  id: uid('geo'),
                  type: 'ship_from',
                  targetGeoSk: 'GEO_SK',
                  sourceCountryCol: 'COUNTRY_CODE',
                  sourceStateCol: 'STATE_CODE',
                  sourceCityCol: 'CITY_NAME',
                },
              ])
            }
          >
            + Add geo mapping
          </button>
        </div>
        <div className="tbl-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Target GEO_SK</th>
                <th>Country col</th>
                <th>State col</th>
                <th>City col</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {geo.map((g) => (
                <tr key={g.id}>
                  <td>
                    <input value={g.type} onChange={(e) => updGeo(g.id, { type: e.target.value })} />
                  </td>
                  <td>
                    <input value={g.targetGeoSk} onChange={(e) => updGeo(g.id, { targetGeoSk: e.target.value })} />
                  </td>
                  <td>
                    <input value={g.sourceCountryCol} onChange={(e) => updGeo(g.id, { sourceCountryCol: e.target.value })} />
                  </td>
                  <td>
                    <input value={g.sourceStateCol} onChange={(e) => updGeo(g.id, { sourceStateCol: e.target.value })} />
                  </td>
                  <td>
                    <input value={g.sourceCityCol} onChange={(e) => updGeo(g.id, { sourceCityCol: e.target.value })} />
                  </td>
                  <td>
                    <button className="btn sm ghost" onClick={() => onGeoChange(geo.filter((x) => x.id !== g.id))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Currency conversion</h3>
        <div className="section-actions">
          <button
            className="btn sm primary"
            onClick={() =>
              onCurrencyChange([
                ...currency,
                {
                  id: uid('cc'),
                  sourceAmountCol: 'LOCAL_AMOUNT',
                  sourceCurrencyCol: 'CURRENCY_CODE',
                  targetBaseAmountCol: 'AMOUNT_USD',
                  baseCurrency: 'USD',
                },
              ])
            }
          >
            + Add conversion
          </button>
        </div>
        <div className="tbl-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Local amount col</th>
                <th>Currency code col</th>
                <th>Target base amount col</th>
                <th style={{ width: 90 }}>Base ccy</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {currency.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input value={c.sourceAmountCol} onChange={(e) => updCur(c.id, { sourceAmountCol: e.target.value })} />
                  </td>
                  <td>
                    <input value={c.sourceCurrencyCol} onChange={(e) => updCur(c.id, { sourceCurrencyCol: e.target.value })} />
                  </td>
                  <td>
                    <input
                      value={c.targetBaseAmountCol}
                      onChange={(e) => updCur(c.id, { targetBaseAmountCol: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={c.baseCurrency} onChange={(e) => updCur(c.id, { baseCurrency: e.target.value })} />
                  </td>
                  <td>
                    <button className="btn sm ghost" onClick={() => onCurrencyChange(currency.filter((x) => x.id !== c.id))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
