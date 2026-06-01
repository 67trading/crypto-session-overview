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
});
