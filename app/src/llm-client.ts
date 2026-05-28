import type { LlmOverviewClient, LlmGenerateResult, OverviewInput } from '../../service/src/ports.js';
import { OverviewOutputSchema } from '../../core/src/overview/overview-output.schema.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_RETRIES = 2;

const SYSTEM_PROMPT = `You are a professional crypto market analyst producing session overviews.

STRICT RULES — violation causes the response to be rejected:
1. Return ONLY valid JSON. No markdown code blocks, no explanations, no text outside JSON.
2. FORBIDDEN trading-instruction phrases: "buy here", "sell here", "go long", "go short", "enter at",
   "exit at", "take a position", "place a trade". Descriptive terms like "long-heavy", "short-heavy",
   "positioning", "long exposure" are ALLOWED when describing market conditions. Describe what the market
   IS doing, not what a trader SHOULD do.
3. Use ONLY data provided in the input. Do not hallucinate levels, events, or prices.
4. If collectors are marked failed in dataQuality, say "data unavailable" — do not invent events.
5. Timeframes: only Weekly, Daily, 4H, Session. Never reference 1H, 15m, 5m.

Your response MUST exactly match this TypeScript type:
{
  reportId: string,
  createdAt: string (ISO 8601),
  session: 'ASIA_CRYPTO' | 'EUROPE_CRYPTO' | 'US_CRYPTO',
  timezone: string,
  overview: {
    marketTone: 'constructive' | 'constructive_but_extended' | 'neutral' | 'mixed' | 'weak' | 'volatile' | 'unknown',
    sessionRead: string,
    confidence: 'low' | 'medium' | 'high'
  },
  btcContext: { summary: string, keyLevels: string[], currentPosition: string },
  ethContext: { summary: string, ethVsBtc: string },
  altcoinContext: { summary: string, rotationState: 'broad_rotation' | 'selective_rotation' | 'no_rotation' | 'weak' | 'unknown' },
  derivativesContext: { summary: string, fundingRead: string, oiRead: string, positioningRead: string },
  eventsContext: { summary: string, importantEvents: Array<{ title: string, importance: 'critical' | 'high' | 'medium', relevance: string }> },
  assetsInFocus: Array<{ symbol: string, reason: string }>,
  setupsInFocus: Array<{ setupId: string, symbol: string, reason: string }>,
  levelsToWatch: Array<{ symbol: string, levelType: 'weekly' | 'daily' | '4h' | 'session', level: string, reason: string }>,
  sessionNotes: string[],
  humanSummary: string
}`;

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
};

type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  usage?: AnthropicUsage;
};

export class AnthropicLlmClient implements LlmOverviewClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  get modelName(): string {
    return this.model;
  }

  async generateOverview(input: OverviewInput): Promise<LlmGenerateResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const t0 = Date.now();
      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: JSON.stringify(input) }],
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Anthropic API error ${response.status}: ${text}`);
        }

        const data = (await response.json()) as AnthropicResponse;
        const durationMs = Date.now() - t0;

        const textBlock = data.content.find((c) => c.type === 'text');
        if (textBlock === undefined || textBlock.text === undefined) {
          throw new Error('Anthropic API returned no text content');
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(textBlock.text);
        } catch {
          throw new Error(`Failed to parse LLM response as JSON: ${textBlock.text.slice(0, 200)}`);
        }

        const result = OverviewOutputSchema.safeParse(parsed);
        if (!result.success) {
          throw new Error(`LLM response failed schema validation: ${result.error.message}`);
        }

        const usage = data.usage !== undefined ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          durationMs,
        } : undefined;

        return {
          output: result.data,
          ...(usage !== undefined ? { usage } : {}),
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error('LLM generation failed after retries');
  }
}
