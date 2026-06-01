import { describe, it, expect, vi } from 'vitest';
import { SessionOverviewService } from '../src/session-overview.service.js';
import type { TelegramPostRecord, TelegramPostFilters } from '../src/ports.js';

const noopFn = vi.fn();

function makeMockRepo(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    saveInputSnapshot: noopFn,
    saveCollectedEvents: noopFn,
    saveCollectorRun: noopFn,
    saveOverview: noopFn,
    updateOverviewTelegramPosts: noopFn,
    getLatestOverview: noopFn,
    getOverviewByRunKey: noopFn,
    listOverviews: noopFn,
    saveTelegramPost: noopFn,
    saveLlmUsage: noopFn,
    getOverviewById: noopFn,
    listEvents: noopFn,
    listCollectorRuns: noopFn,
    listTelegramPosts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const mockRunner = {
  run: vi.fn(),
} as never;

describe('SessionOverviewService.listTelegramPosts()', () => {
  it('delegates to repository.listTelegramPosts with the exact filters passed in', async () => {
    const repo = makeMockRepo();
    const service = new SessionOverviewService(mockRunner, repo);
    const filters: TelegramPostFilters = { session: 'US_CRYPTO', limit: 10 };

    await service.listTelegramPosts(filters);

    expect(repo.listTelegramPosts).toHaveBeenCalledOnce();
    expect(repo.listTelegramPosts).toHaveBeenCalledWith(filters);
  });

  it('returns the array from the repository unchanged', async () => {
    const records: TelegramPostRecord[] = [
      {
        overviewId: 'ov-1',
        messageId: 'msg-101',
        chatId: 'chat-999',
        session: 'US_CRYPTO',
        messageIndex: 0,
        text: 'hello',
      },
      {
        overviewId: 'ov-1',
        messageId: 'msg-102',
        chatId: 'chat-999',
        session: 'US_CRYPTO',
        messageIndex: 1,
      },
    ];
    const repo = makeMockRepo({
      listTelegramPosts: vi.fn().mockResolvedValue(records),
    });
    const service = new SessionOverviewService(mockRunner, repo);

    const result = await service.listTelegramPosts({});

    expect(result).toBe(records);
    expect(result).toHaveLength(2);
    expect(result[0]?.messageId).toBe('msg-101');
  });

  it('returns an empty array when repository returns none', async () => {
    const repo = makeMockRepo({
      listTelegramPosts: vi.fn().mockResolvedValue([]),
    });
    const service = new SessionOverviewService(mockRunner, repo);

    const result = await service.listTelegramPosts({});

    expect(result).toEqual([]);
  });

  it('passes overviewId filter through to the repository', async () => {
    const repo = makeMockRepo();
    const service = new SessionOverviewService(mockRunner, repo);
    const filters: TelegramPostFilters = { overviewId: 'abc-123' };

    await service.listTelegramPosts(filters);

    expect(repo.listTelegramPosts).toHaveBeenCalledWith({ overviewId: 'abc-123' });
  });

  it('propagates repository rejection', async () => {
    const repo = makeMockRepo({
      listTelegramPosts: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const service = new SessionOverviewService(mockRunner, repo);

    await expect(service.listTelegramPosts({})).rejects.toThrow('db error');
  });
});
