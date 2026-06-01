import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('free-only source wiring', () => {
  it('does not wire Bitbo or CoinGlass paid ETF APIs', () => {
    const wireSource = readFileSync(resolve(process.cwd(), 'src/wire.ts'), 'utf8');

    expect(wireSource).not.toContain('Bitbo');
    expect(wireSource).not.toContain('CoinGlass');
  });
});
