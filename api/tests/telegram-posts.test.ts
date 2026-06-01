/**
 * Tests for the GET /telegram-posts route validator logic and handler behaviour.
 *
 * The route handler logic is reproduced in a thin simulation so we can unit-test
 * filter-building and response-shaping without spinning up an Express server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidSession,
  clampLimit,
  VALID_SESSIONS_LIST,
} from '../src/router-validators.js';
import type { TelegramPostFilters, TelegramPostRecord } from '../../service/src/ports.js';

// ─── Validator unit tests ──────────────────────────────────────────────────────

describe('isValidSession() — telegram-posts context', () => {
  it('accepts ASIA_CRYPTO', () => {
    expect(isValidSession('ASIA_CRYPTO')).toBe(true);
  });

  it('accepts EUROPE_CRYPTO', () => {
    expect(isValidSession('EUROPE_CRYPTO')).toBe(true);
  });

  it('accepts US_CRYPTO', () => {
    expect(isValidSession('US_CRYPTO')).toBe(true);
  });

  it('rejects INVALID', () => {
    expect(isValidSession('INVALID')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidSession(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSession('')).toBe(false);
  });
});

describe('clampLimit() — telegram-posts context', () => {
  it('returns undefined for undefined input', () => {
    expect(clampLimit(undefined)).toBeUndefined();
  });

  it('clamps values above 100 to 100', () => {
    expect(clampLimit('200')).toBe(100);
    expect(clampLimit('9999')).toBe(100);
  });

  it('clamps values below 1 to 1', () => {
    expect(clampLimit('0')).toBe(1);
  });

  it('passes through a value within range', () => {
    expect(clampLimit('50')).toBe(50);
  });
});

// ─── Route handler logic simulation ───────────────────────────────────────────

type MockQuery = Record<string, string | undefined>;

interface MockResponse {
  statusCode: number;
  body: unknown;
}

async function simulateTelegramPostsHandler(
  query: MockQuery,
  listTelegramPosts: (f: TelegramPostFilters) => Promise<TelegramPostRecord[]>,
): Promise<MockResponse> {
  const { session, overviewId, limit } = query;

  if (session !== undefined && !isValidSession(session)) {
    return {
      statusCode: 400,
      body: { error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST },
    };
  }

  const limitVal = clampLimit(limit);
  const filters: TelegramPostFilters = {
    ...(isValidSession(session) ? { session: session as string } : {}),
    ...(typeof overviewId === 'string' ? { overviewId } : {}),
    ...(limitVal !== undefined ? { limit: limitVal } : {}),
  };

  try {
    const posts = await listTelegramPosts(filters);
    return { statusCode: 200, body: { items: posts, count: posts.length } };
  } catch (err) {
    return {
      statusCode: 500,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

describe('GET /telegram-posts — handler logic', () => {
  let listTelegramPosts: (f: TelegramPostFilters) => Promise<TelegramPostRecord[]>;

  beforeEach(() => {
    listTelegramPosts = vi.fn().mockResolvedValue([]) as unknown as typeof listTelegramPosts;
  });

  it('calls listTelegramPosts with empty filters when no query params and returns {items:[], count:0}', async () => {
    const res = await simulateTelegramPostsHandler({}, listTelegramPosts);

    expect(listTelegramPosts).toHaveBeenCalledWith({});
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ items: [], count: 0 });
  });

  it('passes session filter when session is valid', async () => {
    const res = await simulateTelegramPostsHandler({ session: 'US_CRYPTO' }, listTelegramPosts);

    expect(res.statusCode).toBe(200);
    expect(listTelegramPosts).toHaveBeenCalledWith(expect.objectContaining({ session: 'US_CRYPTO' }));
  });

  it('returns 400 with INVALID_SESSION code for an invalid session', async () => {
    const res = await simulateTelegramPostsHandler({ session: 'INVALID' }, listTelegramPosts);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('INVALID_SESSION');
    expect((res.body as Record<string, unknown>).validSessions).toEqual(VALID_SESSIONS_LIST);
    expect(listTelegramPosts).not.toHaveBeenCalled();
  });

  it('passes overviewId filter through to the service', async () => {
    const res = await simulateTelegramPostsHandler({ overviewId: 'abc123' }, listTelegramPosts);

    expect(res.statusCode).toBe(200);
    expect(listTelegramPosts).toHaveBeenCalledWith(expect.objectContaining({ overviewId: 'abc123' }));
  });

  it('returns actual posts from the service', async () => {
    const posts: TelegramPostRecord[] = [
      {
        overviewId: 'ov-1',
        messageId: 'msg-1',
        chatId: 'chat-99',
        session: 'US_CRYPTO',
        messageIndex: 0,
        text: 'brief text',
      },
    ];
    listTelegramPosts = vi.fn().mockResolvedValue(posts) as unknown as typeof listTelegramPosts;

    const res = await simulateTelegramPostsHandler({}, listTelegramPosts);

    expect(res.statusCode).toBe(200);
    const body = res.body as { items: TelegramPostRecord[]; count: number };
    expect(body.count).toBe(1);
    expect(body.items[0]?.messageId).toBe('msg-1');
  });

  it('returns 500 when service throws', async () => {
    listTelegramPosts = vi.fn().mockRejectedValue(new Error('db exploded')) as unknown as typeof listTelegramPosts;

    const res = await simulateTelegramPostsHandler({}, listTelegramPosts);

    expect(res.statusCode).toBe(500);
    expect((res.body as Record<string, unknown>).error).toBe('db exploded');
  });

  it('clamps and forwards the limit filter', async () => {
    const res = await simulateTelegramPostsHandler({ limit: '5' }, listTelegramPosts);

    expect(res.statusCode).toBe(200);
    expect(listTelegramPosts).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });
});
