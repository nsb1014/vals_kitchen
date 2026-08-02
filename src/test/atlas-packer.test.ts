import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('atlas packer', () => {
  it('preserves straight-alpha sprite coverage without applying it twice', () => {
    expect(() =>
      execFileSync('python3', [resolve('scripts/test-pack-atlas.py')], {
        encoding: 'utf8',
      }),
    ).not.toThrow();
  });
});
