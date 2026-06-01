export type AppConfig = {
  bybit: {
    baseUrl: string;
  };
  fred?: { apiKey: string };
  bea?: { apiKey: string };
  mobula?: { apiKey: string };
  gemini: {
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
    apiToken?: string;
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
  const geminiApiKey = requireEnv('GEMINI_API_KEY');

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

  const fredApiKey = optionalEnv('FRED_API_KEY', '');
  const beaApiKey = optionalEnv('BEA_API_KEY', '');
  const mobulaApiKey = optionalEnv('MOBULA_API_KEY', '');
  const apiTokenRaw = process.env['SESSION_OVERVIEW_API_TOKEN'];
  const apiToken = apiTokenRaw?.trim();
  if (apiTokenRaw !== undefined && apiToken === '') {
    throw new Error('SESSION_OVERVIEW_API_TOKEN must be non-empty when set');
  }

  return {
    ...(fredApiKey !== '' ? { fred: { apiKey: fredApiKey } } : {}),
    ...(beaApiKey !== '' ? { bea: { apiKey: beaApiKey } } : {}),
    ...(mobulaApiKey !== '' ? { mobula: { apiKey: mobulaApiKey } } : {}),
    bybit: {
      baseUrl: optionalEnv('BYBIT_BASE_URL', 'https://api.bybit.com'),
    },
    gemini: {
      apiKey: geminiApiKey,
      model: optionalEnv('GEMINI_MODEL', 'gemini-2.5-pro'),
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
      url: optionalEnv('DATABASE_URL', 'postgresql://crypto:crypto@localhost:5432/crypto_session_overview?schema=public'),
    },
    server: {
      port,
      ...(apiToken !== undefined
        ? { apiToken }
        : {}),
    },
    scheduler: {
      enabled: optionalEnv('SCHEDULER_ENABLED', 'true') === 'true',
      timezone: optionalEnv('SCHEDULER_TIMEZONE', 'Europe/Berlin'),
      cronAsia: optionalEnv('SCHEDULER_CRON_ASIA', '30 1 * * *'),
      cronEurope: optionalEnv('SCHEDULER_CRON_EUROPE', '30 8 * * *'),
      cronUs: optionalEnv('SCHEDULER_CRON_US', '0 15 * * *'),
    },
  };
}
