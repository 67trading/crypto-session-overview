import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadConfig()', () => {
  it('defaults Gemini model to flash when GEMINI_MODEL is omitted', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_MODEL', '');

    const config = loadConfig();

    expect(config.gemini.model).toBe('gemini-2.5-flash');
  });

  it('uses explicit GEMINI_MODEL when provided', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-custom-model');

    const config = loadConfig();

    expect(config.gemini.model).toBe('gemini-custom-model');
  });

  it('loads trigger rate-limit defaults', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');

    const config = loadConfig();

    expect(config.server.triggerRateLimit).toEqual({
      maxRequests: 5,
      windowMs: 600000,
    });
  });

  it('loads explicit trigger rate-limit settings', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_MAX', '2');
    vi.stubEnv('SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_WINDOW_MS', '30000');

    const config = loadConfig();

    expect(config.server.triggerRateLimit).toEqual({
      maxRequests: 2,
      windowMs: 30000,
    });
  });

  it('rejects invalid trigger rate-limit settings', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_MAX', '0');

    expect(() => loadConfig()).toThrow(/SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_MAX/);
  });
});
