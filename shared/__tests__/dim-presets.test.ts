import { describe, it, expect } from 'vitest';
import { STANDARD_COLUMN_PROFILES, standardProfilesFor } from '../templates';

describe('dimension column presets', () => {
  it('offers geo + parent presets for dimensions', () => {
    const ids = standardProfilesFor('dimension').map((p) => p.id);
    expect(ids).toContain('dim_geo_address');
    expect(ids).toContain('dim_parent_denorm');
  });

  it('geo preset builds the address tuple with a geo key', () => {
    const p = STANDARD_COLUMN_PROFILES.find((x) => x.id === 'dim_geo_address')!;
    const names = p.build('site').map((c) => c.name);
    expect(names).toContain('SITE_GEO_DIMENSION_KEY');
    expect(names).toContain('GEO_DIM_COUNTRY');
  });
});
