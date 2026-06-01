import type { CryptoSession } from '../../service/src/ports.js';
import type { OverviewRunOptions } from '../../service/src/service-types.js';

export const VALID_SESSIONS: ReadonlySet<string> = new Set<CryptoSession>([
  'ASIA_CRYPTO',
  'EUROPE_CRYPTO',
  'US_CRYPTO',
]);

export const VALID_SESSIONS_LIST = Array.from(VALID_SESSIONS);

const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export function isValidSession(value: unknown): value is CryptoSession {
  return typeof value === 'string' && VALID_SESSIONS.has(value);
}

export function clampLimit(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n)) return undefined;
  return Math.min(Math.max(n, MIN_LIMIT), MAX_LIMIT);
}

export type LimitValidationResult =
  | { ok: true; value?: number }
  | { ok: false; error: string; code: 'INVALID_LIMIT' };

export function validateLimitParam(value: unknown): LimitValidationResult {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, error: 'limit must be a number between 1 and 100', code: 'INVALID_LIMIT' };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, error: 'limit must be a number between 1 and 100', code: 'INVALID_LIMIT' };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
    return { ok: false, error: 'limit must be a number between 1 and 100', code: 'INVALID_LIMIT' };
  }
  return { ok: true, value: n };
}

export function parseDateParam(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

type TriggerValidationSuccess = { ok: true; options: OverviewRunOptions };
type TriggerValidationFailure = { ok: false; error: string; code: string };
export type TriggerValidationResult = TriggerValidationSuccess | TriggerValidationFailure;
type SymbolsValidationResult =
  | { ok: true; symbols: OverviewRunOptions['symbols'] }
  | TriggerValidationFailure;

function isStringArray(arr: unknown[]): arr is string[] {
  return arr.every((x) => typeof x === 'string');
}

function normalizeSymbols(symbols: unknown): SymbolsValidationResult {
  if (Array.isArray(symbols)) {
    if (!isStringArray(symbols) || symbols.length === 0) {
      return { ok: false, error: 'symbols array must contain at least one string symbol', code: 'INVALID_SYMBOLS' };
    }
    const unique = [...new Set(symbols.map((s) => s.trim()).filter((s) => s.length > 0))];
    if (unique.length === 0) {
      return { ok: false, error: 'symbols array must contain at least one string symbol', code: 'INVALID_SYMBOLS' };
    }
    const core = unique.filter((s) => s === 'BTCUSDT' || s === 'ETHUSDT');
    const major = unique.filter((s) => s !== 'BTCUSDT' && s !== 'ETHUSDT');
    return {
      ok: true,
      symbols: {
        core: core.length > 0 ? core : [unique[0]!],
        major: core.length > 0 ? major : unique.slice(1),
        watch: [],
      },
    };
  }

  if (typeof symbols !== 'object' || symbols === null) {
    return { ok: false, error: 'symbols must be an object with core, major, watch arrays or a string array', code: 'INVALID_SYMBOLS' };
  }

  const sym = symbols as Record<string, unknown>;

  if (!Array.isArray(sym['core']) || !Array.isArray(sym['major']) || !Array.isArray(sym['watch'])) {
    return { ok: false, error: 'symbols.core, symbols.major, and symbols.watch must be arrays', code: 'INVALID_SYMBOLS' };
  }

  if (!isStringArray(sym['core']) || !isStringArray(sym['major']) || !isStringArray(sym['watch'])) {
    return { ok: false, error: 'All symbol entries must be strings', code: 'INVALID_SYMBOLS' };
  }

  if (sym['core'].length === 0) {
    return { ok: false, error: 'symbols.core must contain at least one symbol', code: 'INVALID_SYMBOLS' };
  }

  return {
    ok: true,
    symbols: { core: sym['core'], major: sym['major'], watch: sym['watch'] },
  };
}

export function validateTriggerBody(body: unknown): TriggerValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object', code: 'INVALID_BODY' };
  }

  const { session, symbols, publish, force } = body as Record<string, unknown>;

  if (!isValidSession(session)) {
    return { ok: false, error: 'Invalid or missing session', code: 'INVALID_SESSION' };
  }

  const symbolsResult = normalizeSymbols(symbols);
  if (!symbolsResult.ok) return symbolsResult;

  return {
    ok: true,
    options: {
      session,
      symbols: symbolsResult.symbols,
      ...(publish !== undefined ? { publish: Boolean(publish) } : {}),
      ...(force !== undefined ? { force: Boolean(force) } : {}),
    },
  };
}
