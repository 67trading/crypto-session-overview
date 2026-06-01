import express, { type Request, type Response, type NextFunction } from 'express';
import { createSessionOverviewRouter } from '../../api/src/router.js';
import { metrics } from '../../service/src/metrics.js';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';
import type { AppConfig } from './config.js';

function routeMetricLabel(req: Request): string {
  if (req.route === undefined) {
    return `${req.method}:unmatched`;
  }

  const routePath = typeof req.route.path === 'string' ? req.route.path : 'unknown';
  const baseUrl = req.baseUrl === '' ? '' : req.baseUrl;
  return `${baseUrl}${routePath}`
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function createServer(
  service: SessionOverviewService,
  config: AppConfig,
): express.Application {
  const app = express();

  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      metrics.recordApiRequest(routeMetricLabel(req), res.statusCode);
    });
    next();
  });

  app.get('/metrics', (_req: Request, res: Response): void => {
    res.status(200).json(metrics.snapshot());
  });

  const overviewRouter = createSessionOverviewRouter(service, {
    ...(config.server.apiToken !== undefined ? { apiToken: config.server.apiToken } : {}),
    rateLimit: config.server.triggerRateLimit,
  });
  app.use('/api/v1/session-overview', overviewRouter);

  // 404 handler
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Internal server error', detail: message });
  });

  return app;
}
