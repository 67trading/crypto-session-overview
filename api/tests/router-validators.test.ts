import { describe, it, expect } from 'vitest';
import {
  isValidSession,
  clampLimit,
  validateLimitParam,
  parseDateParam,
  validateTriggerBody,
} from '../src/router-validators.js';

describe('isValidSession()', () => {
  it('accepts all three valid sessions', () => {
    expect(isValidSession('ASIA_CRYPTO')).toBe(true);
    expect(isValidSession('EUROPE_CRYPTO')).toBe(true);
    expect(isValidSession('US_CRYPTO')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isValidSession('INVALID')).toBe(false);
    expect(isValidSession('asia_crypto')).toBe(false);
    expect(isValidSession('')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isValidSession(undefined)).toBe(false);
    expect(isValidSession(null)).toBe(false);
    expect(isValidSession(42)).toBe(false);
  });
});

describe('clampLimit()', () => {
  it('parses a valid numeric string', () => {
    expect(clampLimit('10')).toBe(10);
  });

  it('clamps values above 100 to 100', () => {
    expect(clampLimit('9999')).toBe(100);
    expect(clampLimit('101')).toBe(100);
  });

  it('clamps values below 1 to 1', () => {
    expect(clampLimit('0')).toBe(1);
    expect(clampLimit('-5')).toBe(1);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(clampLimit('abc')).toBeUndefined();
    expect(clampLimit('')).toBeUndefined();
  });

  it('returns undefined for non-string inputs', () => {
    expect(clampLimit(undefined)).toBeUndefined();
    expect(clampLimit(50)).toBeUndefined();
  });
});

describe('validateLimitParam()', () => {
  it('accepts a valid numeric string', () => {
    expect(validateLimitParam('10')).toEqual({ ok: true, value: 10 });
  });

  it('accepts undefined as omitted', () => {
    expect(validateLimitParam(undefined)).toEqual({ ok: true });
  });

  it('rejects values above 100', () => {
    expect(validateLimitParam('101')).toEqual(expect.objectContaining({ ok: false, code: 'INVALID_LIMIT' }));
  });

  it('rejects values below 1', () => {
    expect(validateLimitParam('0')).toEqual(expect.objectContaining({ ok: false, code: 'INVALID_LIMIT' }));
  });

  it('rejects non-numeric strings', () => {
    expect(validateLimitParam('abc')).toEqual(expect.objectContaining({ ok: false, code: 'INVALID_LIMIT' }));
  });
});

describe('parseDateParam()', () => {
  it('parses a valid ISO date string', () => {
    const d = parseDateParam('2026-01-01T00:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns undefined for invalid date strings', () => {
    expect(parseDateParam('not-a-date')).toBeUndefined();
  });

  it('returns undefined for non-string inputs', () => {
    expect(parseDateParam(undefined)).toBeUndefined();
    expect(parseDateParam(null)).toBeUndefined();
  });
});

describe('validateTriggerBody()', () => {
  const validBody = {
    session: 'US_CRYPTO',
    symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: ['BNBUSDT'], watch: ['SOLUSDT'] },
  };

  it('accepts a valid body', () => {
    const result = validateTriggerBody(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.session).toBe('US_CRYPTO');
    expect(result.options.symbols.core).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('rejects null body', () => {
    const result = validateTriggerBody(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_BODY');
  });

  it('rejects missing session', () => {
    const result = validateTriggerBody({ symbols: validBody.symbols });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SESSION');
  });

  it('rejects invalid session value', () => {
    const result = validateTriggerBody({ ...validBody, session: 'INVALID' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SESSION');
  });

  it('rejects missing symbols', () => {
    const result = validateTriggerBody({ session: 'US_CRYPTO' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SYMBOLS');
  });

  it('accepts symbols shorthand array', () => {
    const result = validateTriggerBody({ session: 'US_CRYPTO', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.symbols).toEqual({
      core: ['BTCUSDT', 'ETHUSDT'],
      major: ['SOLUSDT'],
      watch: [],
    });
  });

  it('rejects empty symbols shorthand array', () => {
    const result = validateTriggerBody({ session: 'US_CRYPTO', symbols: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SYMBOLS');
  });

  it('rejects symbols with missing sub-arrays', () => {
    const result = validateTriggerBody({ session: 'US_CRYPTO', symbols: { core: ['BTCUSDT'] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SYMBOLS');
  });

  it('rejects symbols arrays containing non-strings', () => {
    const result = validateTriggerBody({
      session: 'US_CRYPTO',
      symbols: { core: [1, 2], major: [], watch: [] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SYMBOLS');
  });

  it('rejects empty core symbols array', () => {
    const result = validateTriggerBody({
      session: 'US_CRYPTO',
      symbols: { core: [], major: [], watch: [] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SYMBOLS');
  });

  it('coerces publish to boolean when provided', () => {
    const result = validateTriggerBody({ ...validBody, publish: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.publish).toBe(true);
  });

  it('omits publish field when not provided', () => {
    const result = validateTriggerBody(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('publish' in result.options).toBe(false);
  });

  it('accepts empty major and watch arrays', () => {
    const result = validateTriggerBody({
      session: 'US_CRYPTO',
      symbols: { core: ['BTCUSDT'], major: [], watch: [] },
    });
    expect(result.ok).toBe(true);
  });
});
