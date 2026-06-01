import { config as loadDotenv } from 'dotenv';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { startScheduler } from './scheduler.js';
import { wire } from './wire.js';
import type { LoggerLike } from '../../service/src/ports.js';

loadDotenv({ path: new URL('../../.env', import.meta.url) });

const config = loadConfig();

// Simple console logger matching LoggerLike interface
const logger: LoggerLike = {
  info(obj, msg) {
    console.info(typeof obj === 'string' ? obj : { ...obj, msg });
  },
  warn(obj, msg) {
    console.warn(typeof obj === 'string' ? obj : { ...obj, msg });
  },
  error(obj, msg) {
    console.error(typeof obj === 'string' ? obj : { ...obj, msg });
  },
  debug(obj, msg) {
    console.debug(typeof obj === 'string' ? obj : { ...obj, msg });
  },
};

const service = wire(config, logger);
const app = createServer(service, config);

app.listen(config.server.port, () => {
  logger.info(`Session overview server on port ${config.server.port}`);
});

if (config.scheduler.enabled) {
  startScheduler(service, config, logger);
}
