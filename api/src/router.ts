import { Router, type Request, type Response } from 'express';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';
import type { OverviewFilters, EventFilters, CollectorRunFilters, TelegramPostFilters } from '../../service/src/ports.js';
import {
  isValidSession,
  validateLimitParam,
  parseDateParam,
  validateTriggerBody,
  VALID_SESSIONS_LIST,
} from './router-validators.js';

export type SessionOverviewRouterOptions = {
  apiToken?: string;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
};

type RateLimitBucket = { count: number; resetAt: number };
const RATE_LIMIT_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RATE_LIMIT = { maxRequests: 5, windowMs: 10 * 60 * 1000 };

function positiveIntegerOrDefault(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function getBearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export function createSessionOverviewRouter(
  service: SessionOverviewService,
  options: SessionOverviewRouterOptions = {},
): Router {
  const router = Router();
  const rateLimitBuckets = new Map<string, RateLimitBucket>();
  let lastRateLimitPruneAt = 0;
  const configuredRateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const rateLimit = {
    maxRequests: positiveIntegerOrDefault(configuredRateLimit.maxRequests, DEFAULT_RATE_LIMIT.maxRequests),
    windowMs: positiveIntegerOrDefault(configuredRateLimit.windowMs, DEFAULT_RATE_LIMIT.windowMs),
  };

  const requireWriteAuth = (req: Request, res: Response): boolean => {
    if (options.apiToken === undefined) return true;
    const token = getBearerToken(req);
    if (token === undefined) {
      res.status(401).json({ error: 'Missing bearer token', code: 'UNAUTHORIZED' });
      return false;
    }
    if (token !== options.apiToken) {
      res.status(403).json({ error: 'Invalid bearer token', code: 'FORBIDDEN' });
      return false;
    }
    return true;
  };

  const checkTriggerRateLimit = (req: Request, res: Response): boolean => {
    if (options.apiToken === undefined) return true;

    const key = getBearerToken(req) ?? req.ip ?? 'unknown';
    const now = Date.now();
    if (now - lastRateLimitPruneAt >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
      for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
        if (bucket.resetAt <= now) {
          rateLimitBuckets.delete(bucketKey);
        }
      }
      lastRateLimitPruneAt = now;
    }
    const bucket = rateLimitBuckets.get(key);
    if (bucket === undefined || bucket.resetAt <= now) {
      let resetAt = bucket?.resetAt ?? now + rateLimit.windowMs;
      if (resetAt <= now) {
        const elapsedWindows = Math.floor((now - resetAt) / rateLimit.windowMs) + 1;
        resetAt += elapsedWindows * rateLimit.windowMs;
      }
      rateLimitBuckets.set(key, { count: 1, resetAt });
      return true;
    }
    if (bucket.count >= rateLimit.maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
      return false;
    }
    bucket.count += 1;
    return true;
  };

  // GET /health
  router.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /overviews — list with filters
  router.get('/overviews', async (req: Request, res: Response): Promise<void> => {
    const { session, limit, fromDate } = req.query;
    if (session !== undefined && !isValidSession(session)) {
      res.status(400).json({ error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST });
      return;
    }
    const limitResult = validateLimitParam(limit);
    if (!limitResult.ok) {
      res.status(400).json({ error: limitResult.error, code: limitResult.code });
      return;
    }
    const fromDateVal = parseDateParam(fromDate);
    const filters: OverviewFilters = {
      ...(isValidSession(session) ? { session } : {}),
      ...(limitResult.value !== undefined ? { limit: limitResult.value } : {}),
      ...(fromDateVal !== undefined ? { fromDate: fromDateVal } : {}),
    };
    try {
      const records = await service.listOverviews(filters);
      res.status(200).json({ items: records, count: records.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /overviews/latest/:session — MUST be before /overviews/:id to avoid swallowing 'latest' as an ID
  router.get('/overviews/latest/:session', async (req: Request, res: Response): Promise<void> => {
    const { session } = req.params;
    if (!isValidSession(session)) {
      res.status(400).json({ error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST });
      return;
    }
    try {
      const record = await service.getLatestOverview(session);
      if (record === null) {
        res.status(404).json({ error: `No overview found for session: ${session}`, code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(record);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /overviews/:id — get by ID
  router.get('/overviews/:id', async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id']!;
    try {
      const record = await service.getOverviewById(id);
      if (record === null) {
        res.status(404).json({ error: `Overview not found: ${id}`, code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(record);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /events — list collected events
  router.get('/events', async (req: Request, res: Response): Promise<void> => {
    const { session, eventType, asset, source, category, importance, limit, fromDate } = req.query;
    if (session !== undefined && !isValidSession(session)) {
      res.status(400).json({ error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST });
      return;
    }
    const limitResult = validateLimitParam(limit);
    if (!limitResult.ok) {
      res.status(400).json({ error: limitResult.error, code: limitResult.code });
      return;
    }
    const fromDateVal = parseDateParam(fromDate);
    const filters: EventFilters = {
      ...(isValidSession(session) ? { session } : {}),
      ...(typeof eventType === 'string' ? { eventType } : {}),
      ...(typeof asset === 'string' ? { asset } : {}),
      ...(typeof source === 'string' ? { source } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof importance === 'string' ? { importance } : {}),
      ...(limitResult.value !== undefined ? { limit: limitResult.value } : {}),
      ...(fromDateVal !== undefined ? { fromDate: fromDateVal } : {}),
    };
    try {
      const events = await service.listEvents(filters);
      res.status(200).json({ items: events, count: events.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /collector-runs — telemetry
  router.get('/collector-runs', async (req: Request, res: Response): Promise<void> => {
    const { collectorName, status, limit, fromDate } = req.query;
    const limitResult = validateLimitParam(limit);
    if (!limitResult.ok) {
      res.status(400).json({ error: limitResult.error, code: limitResult.code });
      return;
    }
    const fromDateVal = parseDateParam(fromDate);
    const filters: CollectorRunFilters = {
      ...(typeof collectorName === 'string' ? { collectorName } : {}),
      ...(typeof status === 'string' && ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED'].includes(status)
        ? { status: status as NonNullable<CollectorRunFilters['status']> } : {}),
      ...(limitResult.value !== undefined ? { limit: limitResult.value } : {}),
      ...(fromDateVal !== undefined ? { fromDate: fromDateVal } : {}),
    };
    try {
      const runs = await service.listCollectorRuns(filters);
      res.status(200).json({ items: runs, count: runs.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /telegram-posts — list posted Telegram messages
  router.get('/telegram-posts', async (req: Request, res: Response): Promise<void> => {
    const { session, overviewId, limit } = req.query;
    if (session !== undefined && !isValidSession(session)) {
      res.status(400).json({ error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST });
      return;
    }
    const limitResult = validateLimitParam(limit);
    if (!limitResult.ok) {
      res.status(400).json({ error: limitResult.error, code: limitResult.code });
      return;
    }
    const filters: TelegramPostFilters = {
      ...(isValidSession(session) ? { session: session as string } : {}),
      ...(typeof overviewId === 'string' ? { overviewId } : {}),
      ...(limitResult.value !== undefined ? { limit: limitResult.value } : {}),
    };
    try {
      const posts = await service.listTelegramPosts(filters);
      res.status(200).json({ items: posts, count: posts.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /overviews/trigger — manual trigger
  router.post('/overviews/trigger', async (req: Request, res: Response): Promise<void> => {
    if (!requireWriteAuth(req, res)) return;
    if (!checkTriggerRateLimit(req, res)) return;

    const validation = validateTriggerBody(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error, code: validation.code });
      return;
    }
    if (options.apiToken === undefined && validation.options.force === true) {
      res.status(403).json({ error: 'force=true requires API authentication', code: 'FORCE_REQUIRES_AUTH' });
      return;
    }
    try {
      const result = await service.runSessionOverview(validation.options);
      res.status(202).json({
        overviewId: result.overviewId,
        status: result.status,
        durationMs: result.durationMs,
        telegramPublished: result.telegramPublished,
        marketRegime: result.marketRegime,
        briefConfidence: result.briefConfidence,
        collectorStatus: result.collectorStatus,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Legacy alias — canonical path preferred
  router.get('/overview/:session', async (req: Request, res: Response): Promise<void> => {
    const { session } = req.params;
    if (!isValidSession(session)) {
      res.status(400).json({ error: 'Invalid session', code: 'INVALID_SESSION', validSessions: VALID_SESSIONS_LIST });
      return;
    }
    const record = await service.getLatestOverview(session).catch(() => null);
    if (record === null) {
      res.status(404).json({ error: `No overview found for session: ${session}`, code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json(record);
  });

  return router;
}
