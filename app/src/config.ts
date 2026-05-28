export type AppConfig = {
  bybit: {
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  symbols: {
    core: string[];
    major: string[];
    watch: string[];
  };
  database: {
    url: string;
  };
  server: {
    port: number;
  };
  scheduler: {
    enabled: boolean;
    timezone: string;
    cronAsia: string;
    cronEurope: string;
    cronUs: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

function parseSymbols(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(): AppConfig {
  const anthropicApiKey = requireEnv('ANTHROPIC_API_KEY');

  // Bybit credentials (apiKey and apiSecret optional for public endpoints but kept for future auth)
  const bybitApiKey = optionalEnv('BYBIT_API_KEY', '');
  const bybitApiSecret = optionalEnv('BYBIT_API_SECRET', '');

  const telegramEnabled = optionalEnv('TELEGRAM_ENABLED', 'false') === 'true';
  const telegramBotToken = telegramEnabled ? requireEnv('TELEGRAM_BOT_TOKEN') : optionalEnv('TELEGRAM_BOT_TOKEN', '');
  const telegramChatId = telegramEnabled ? requireEnv('TELEGRAM_CHAT_ID') : optionalEnv('TELEGRAM_CHAT_ID', '');

  const coreSymbolsRaw = optionalEnv('SYMBOLS_CORE', 'BTCUSDT,ETHUSDT');
  const majorSymbolsRaw = optionalEnv('SYMBOLS_MAJOR', 'SOLUSDT,BNBUSDT');
  const watchSymbolsRaw = optionalEnv('SYMBOLS_WATCH', '');

  const portRaw = optionalEnv('PORT', '3100');
  const port = parseInt(portRaw, 10);
  if (isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portRaw}`);
  }

  return {
    bybit: {
      baseUrl: optionalEnv('BYBIT_BASE_URL', 'https://api.bybit.com'),
      apiKey: bybitApiKey,
      apiSecret: bybitApiSecret,
    },
    anthropic: {
      apiKey: anthropicApiKey,
      model: optionalEnv('ANTHROPIC_MODEL', 'claude-opus-4-7'),
    },
    telegram: {
      botToken: telegramBotToken,
      chatId: telegramChatId,
      enabled: telegramEnabled,
    },
    symbols: {
      core: parseSymbols(coreSymbolsRaw),
      major: parseSymbols(majorSymbolsRaw),
      watch: watchSymbolsRaw !== '' ? parseSymbols(watchSymbolsRaw) : [],
    },
    database: {
      url: optionalEnv('DATABASE_URL', 'file:./session-overview.db'),
    },
    server: {
      port,
    },
    scheduler: {
      enabled: optionalEnv('SCHEDULER_ENABLED', 'true') === 'true',
      timezone: optionalEnv('SCHEDULER_TIMEZONE', 'Europe/Sofia'),
      cronAsia: optionalEnv('SCHEDULER_CRON_ASIA', '30 1 * * *'),
      cronEurope: optionalEnv('SCHEDULER_CRON_EUROPE', '30 8 * * *'),
      cronUs: optionalEnv('SCHEDULER_CRON_US', '0 15 * * *'),
    },
  };
}
