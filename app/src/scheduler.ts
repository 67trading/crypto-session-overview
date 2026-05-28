import cron from 'node-cron';
import { PrismaClient } from './generated/prisma-client/index.js';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';
import type { AppConfig } from './config.js';
import type { LoggerLike } from '../../service/src/ports.js';

type ScheduleEntry = {
  session: 'ASIA_CRYPTO' | 'EUROPE_CRYPTO' | 'US_CRYPTO';
  cronExpr: string;
};

const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes — covers a slow run

const inMemoryLocks = new Set<string>();

async function acquireLock(prisma: PrismaClient, lockId: string): Promise<boolean> {
  if (inMemoryLocks.has(lockId)) return false;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    // Expire stale locks first
    await prisma.schedulerLock.deleteMany({
      where: { id: lockId, expiresAt: { lt: now } },
    });

    await prisma.schedulerLock.create({
      data: { id: lockId, lockedAt: now, expiresAt },
    });

    inMemoryLocks.add(lockId);
    return true;
  } catch {
    // Unique constraint violation — lock already held
    return false;
  }
}

async function releaseLock(prisma: PrismaClient, lockId: string): Promise<void> {
  inMemoryLocks.delete(lockId);
  await prisma.schedulerLock.deleteMany({ where: { id: lockId } });
}

export function startScheduler(
  service: SessionOverviewService,
  config: AppConfig,
  logger: LoggerLike,
): void {
  const prisma = new PrismaClient({ datasources: { db: { url: config.database.url } } });

  const schedules: ScheduleEntry[] = [
    { session: 'ASIA_CRYPTO',   cronExpr: config.scheduler.cronAsia   },
    { session: 'EUROPE_CRYPTO', cronExpr: config.scheduler.cronEurope },
    { session: 'US_CRYPTO',     cronExpr: config.scheduler.cronUs     },
  ];

  for (const { session, cronExpr } of schedules) {
    cron.schedule(cronExpr, async () => {
      const lockId = `scheduler-${session}`;
      const acquired = await acquireLock(prisma, lockId);
      if (!acquired) {
        logger.warn({ session }, 'Scheduler lock already held — skipping run');
        return;
      }

      logger.info({ session, cronExpr }, 'Scheduler triggered session overview run');
      try {
        await service.runSessionOverview({
          session,
          symbols: config.symbols,
          publish: config.telegram.enabled,
        });
        logger.info({ session }, 'Scheduled overview run complete');
      } catch (err) {
        logger.error({ session, err }, 'Scheduled overview run failed');
      } finally {
        await releaseLock(prisma, lockId);
      }
    }, { timezone: config.scheduler.timezone });

    logger.info({ session, cronExpr }, 'Registered session overview cron');
  }
}
