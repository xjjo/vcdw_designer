import type { AnyEntity, DesignModel } from '@shared/types';

/** Thin client for the optional Node backend. All calls degrade gracefully. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function generateModelSql(model: DesignModel, rows = 3): Promise<string> {
  const data = await post<{ sql: string }>('/api/sql', { model, rows });
  return data.sql;
}

export async function mapToGenerator(entity: AnyEntity): Promise<unknown> {
  return post<unknown>('/api/generator-map', { entity });
}

export async function saveModel(model: DesignModel): Promise<void> {
  await post('/api/model', model);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}
