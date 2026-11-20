import { describe, it, expect } from 'vitest';
import { buildDeploymentPacket, suggestedWrapper } from '../packet';
import { newDimension } from '../templates';

describe('D3 (M32): INSTALL.md names the wrapper job', () => {
  it('dimensions on enumeration_nc -> wrapper_for_enums.kjb, other dimensions -> sync_dimensions.kjb', () => {
    const hazmat = newDimension('hazmat_number_category');
    hazmat.netChange = [{ id: 'nc', role: 'netchange', isPrimary: true, ncTable: 'enumeration_nc' }];
    expect(suggestedWrapper(hazmat)).toContain('wrapper_for_enums.kjb');
    const plain = newDimension('demo_item');
    plain.netChange = [{ id: 'nc', role: 'netchange', isPrimary: true, ncTable: 'demo_item_nc' }];
    expect(suggestedWrapper(plain)).toBe('`sync_dimensions.kjb`');
    const install = buildDeploymentPacket(plain, 'MemSQL').files.find((f) => f.path === 'INSTALL.md')!.content;
    expect(install).toContain('Register `demo_item_sync.kjb` in the wrapper job: `sync_dimensions.kjb`.');
  });
});
