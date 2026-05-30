import type { OverviewOutput } from './ports.js';

// Mirrors rule 2 in the LLM system prompt — any of these appearing in LLM-written fields is a violation
export const FORBIDDEN_PHRASES = [
  'buy here',
  'sell here',
  'go long',
  'go short',
  'enter at',
  'exit at',
  'take a position',
  'place a trade',
] as const;

export type ForbiddenPhrase = (typeof FORBIDDEN_PHRASES)[number];

function collectWrittenStrings(output: OverviewOutput): string[] {
  return [
    output.btc.summary,
    output.btc.position,
    ...output.btc.keyLevels,
    output.eth.summary,
    output.eth.vsbtc,
    ...output.eth.keyLevels,
    ...output.majorAssets.flatMap((a) => [a.summary, ...a.keyLevels]),
    output.alts.summary,
    output.alts.breadth,
    output.derivatives.summary,
    output.derivatives.funding,
    output.derivatives.oi,
    output.derivatives.positioning,
    ...(output.liquidity?.bullets ?? []),
    output.events.summary,
    ...output.events.upcoming.map((e) => e.title),
    output.scenarios.reclaim,
    output.scenarios.rejection,
    output.scenarios.chop,
    output.note,
    ...output.whatChanged,
  ];
}

export function scanForForbiddenPhrases(output: OverviewOutput): string[] {
  const violations: string[] = [];
  for (const str of collectWrittenStrings(output)) {
    const lower = str.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase)) {
        violations.push(`"${phrase}" in: "${str.slice(0, 120)}"`);
      }
    }
  }
  return violations;
}

// Hard violations block Telegram publishing; soft violations are logged only
export function hasHardViolations(output: OverviewOutput): boolean {
  if (scanForForbiddenPhrases(output).length > 0) return true;
  if (!output.liquidity?.bullets?.length) return true;
  if (!output.scenarios.reclaim || !output.scenarios.rejection || !output.scenarios.chop) return true;
  if (!output.note) return true;
  return false;
}

export function checkOutputInvariants(output: OverviewOutput): string[] {
  const violations: string[] = [];

  if (output.whatChanged.length < 1) violations.push('whatChanged must have at least 1 item');
  if (output.whatChanged.length > 8) violations.push('whatChanged must have at most 8 items');

  if (!output.liquidity?.bullets?.length) violations.push('liquidity.bullets must be non-empty');

  if (!output.scenarios.reclaim) violations.push('scenarios.reclaim must be non-empty');
  if (!output.scenarios.rejection) violations.push('scenarios.rejection must be non-empty');
  if (!output.scenarios.chop) violations.push('scenarios.chop must be non-empty');

  if (!output.note) violations.push('note must be non-empty');

  if (!output.briefId) violations.push('briefId must be non-empty');
  if (!output.generatedAtUtc) violations.push('generatedAtUtc must be non-empty');

  violations.push(...scanForForbiddenPhrases(output));

  return violations;
}
