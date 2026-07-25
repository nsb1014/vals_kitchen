import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('loads domain barrel', async () => {
    const domain = await import('../domain/index.ts');
    expect(domain).toBeDefined();
  });
});
