import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildZip } from '../zipFiles';

it('zips every file under its own path with its full content', () => {
  const zip = buildZip([
    { path: 'enumeration/purchase_contract_type_sync.kjb', content: '<job>…</job>' },
    { path: 'enumeration/purchase_contract_type_sync.ktr', content: '<transformation/>' },
    { path: 'INSTALL.md', content: '# Deploy\nline 2' },
  ]);
  const out = unzipSync(zip);
  expect(Object.keys(out).sort()).toEqual([
    'INSTALL.md',
    'enumeration/purchase_contract_type_sync.kjb',
    'enumeration/purchase_contract_type_sync.ktr',
  ]);
  expect(strFromU8(out['enumeration/purchase_contract_type_sync.kjb'])).toBe('<job>…</job>');
  expect(strFromU8(out['INSTALL.md'])).toBe('# Deploy\nline 2');
});

it('normalizes backslashes and leading slashes in paths', () => {
  const out = unzipSync(buildZip([{ path: '\\ddl\\a.sql', content: 'x' }]));
  expect(Object.keys(out)).toEqual(['ddl/a.sql']);
});
