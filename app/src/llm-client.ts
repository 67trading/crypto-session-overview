import type { LlmOverviewClient, LlmGenerateResult, OverviewInput } from '../../service/src/ports.js';
import { OverviewOutputSchema } from '../../core/src/overview/overview-output.schema.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_RETRIES = 2;

const SYSTEM_PROMPT = `You are a professional crypto market analyst writing pre-session desk briefs for experienced traders.

STRICT RULES — violation causes the response to be rejected:
1. Return ONLY valid JSON matching the schema below. No markdown, no code blocks, no text outside the JSON.
2. FORBIDDEN trading-instruction phrases: "buy here", "sell here", "go long", "go short", "enter at",
   "exit at", "take a position", "place a trade". Descriptive terms like "long-heavy", "short-heavy",
   "positioning", "long exposure" are ALLOWED when describing market conditions. Describe what the market
   IS doing, not what a trader SHOULD do.
3. Use ONLY data provided in the input. Do not hallucinate levels, events, or prices.
4. dataStatus is pre-computed — copy it VERBATIM from input.dataStatus. Do not re-derive it
   from dataQuality. If input.dataStatus is absent, derive from dataQuality as a fallback.
4b. marketRegime and briefConfidence are pre-computed — copy them VERBATIM from
    input.precomputedRegime.marketRegime and input.precomputedRegime.briefConfidence.
    If input.precomputedRegime is absent, derive them from market data as a fallback.
4c. alts.rotationState and alts.breadth are pre-computed — copy them VERBATIM from
    input.altsBreadth.rotationState and input.altsBreadth.breadthLabel if present.
    If input.altsBreadth is absent or totalTracked is 0, derive from market data as a fallback.
4d. derivatives.funding, derivatives.oi, and derivatives.positioning are pre-computed — copy
    them VERBATIM from input.derivativesNarrative if present and not "data unavailable".
    Focus your derivatives.summary on synthesizing the overall read, not repeating sub-fields.
4e. events.upcoming is pre-computed and deduplicated — copy the list VERBATIM from
    input.precomputedEvents.upcomingEvents if present and non-empty. Do not add, remove, or
    reorder entries. Write events.summary as a 1-2 sentence synthesis of the upcoming list.
4f. eth.vsbtc is pre-computed — copy it VERBATIM from input.crossMarket.ethBtcTrendLabel if
    present and not "data unavailable". Use input.crossMarket.dominanceLabel and
    topOutperformers/topUnderperformers as context for the eth.summary and majorAssets sections.
5. If a source status is "failed" or "unavailable", write "data unavailable" in that section's
   summary — do not invent data.
6. Timeframes: only Weekly, Daily, 4H, Session. Never reference 1H, 15m, 5m.
7. scenarios must always contain all three fields: reclaim, rejection, chop.
8. whatChanged: if input.previousBrief is present, list 1–8 concise bullets describing what changed
   vs that prior brief (regime, structure, key level breaks, new/removed events, etc.).
   If input.previousBrief is absent, use exactly:
   ["No previous brief available for this session — initial reading."]
   NOTE: the runner post-processes whatChanged deterministically — your output is used as a fallback
   only. Prefer accurate, concise bullets over the fallback string.

Required JSON schema (all fields required):
{
  "briefId": "string — generate a unique ID like 'brief-<session>-<timestamp>'",
  "generatedAtUtc": "string — ISO 8601, copy from input.request.createdAt",
  "session": "ASIA_CRYPTO | EUROPE_CRYPTO | US_CRYPTO",
  "marketRegime": "risk_on_expansion | constructive_but_extended | defensive_range_bound | range_compression | long_heavy_near_resistance | short_heavy_near_support | risk_off | event_driven | mixed | unknown",
  "briefConfidence": "low | medium | high",
  "dataStatus": {
    "price": "COPY from input.dataStatus.price",
    "events": "COPY from input.dataStatus.events",
    "derivatives": "COPY from input.dataStatus.derivatives",
    "liquidations": "COPY from input.dataStatus.liquidations (always 'unavailable' until liq data is added)"
  },
  "whatChanged": ["string — max 8 items, each a concise bullet describing change vs previous brief"],
  "btc": {
    "summary": "string — 1-2 sentences describing current price conditions only",
    "keyLevels": ["string — e.g. '97400 (previous week high)'"],
    "position": "string — e.g. 'above daily midpoint, below weekly high'",
    "structure": "bullish | bearish | range | transition | unknown"
  },
  "eth": {
    "summary": "string — 1-2 sentences",
    "vsbtc": "string — relative strength vs BTC, e.g. 'slight underperformance on 24h'",
    "keyLevels": ["string"]
  },
  "majorAssets": [
    { "symbol": "string", "summary": "string — 1 sentence", "keyLevels": ["string"] }
  ],
  "alts": {
    "summary": "string — 1-2 sentences on altcoin conditions",
    "rotationState": "broad_rotation | selective_rotation | no_rotation | weak | unknown",
    "breadth": "string — e.g. '65% of top 50 green on 24h' or 'data unavailable'"
  },
  "derivatives": {
    "summary": "string — 1 sentence overall read, or empty string",
    "funding": "string — e.g. 'positive elevated across BTC/ETH'",
    "oi": "string — e.g. 'rising slowly, no extreme buildup'",
    "positioning": "string — e.g. 'long-heavy but not at flush levels'"
  },
  "events": {
    "summary": "string — overall macro/crypto event context, or 'No significant events for this session'",
    "upcoming": [
      { "title": "string", "time": "string — UTC time or date", "importance": "critical | high | medium | low" }
    ]
  },
  "scenarios": {
    "reclaim": "string — what plays out if price reclaims the key resistance/level",
    "rejection": "string — what plays out on rejection from the key level",
    "chop": "string — what plays out in a range/no-resolution scenario"
  },
  "note": "string — closing note on data quality, key watchpoints, or caveats; always present"
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
