import type { OverviewOutput } from './ports.js';

function fmtRegime(regime: string): string {
  return regime.replace(/_/g, ' ');
}

function fmtRotation(state: string): string {
  return state.replace(/_/g, ' ');
}

function extractEthBtcDirection(vsbtc: string): string | null {
  const lower = vsbtc.toLowerCase();
  if (lower.includes('rising')) return 'rising';
  if (lower.includes('falling')) return 'falling';
  if (lower.includes('sideways')) return 'sideways';
  return null;
}

function changed(prev: string, curr: string): boolean {
  return prev.trim().toLowerCase() !== curr.trim().toLowerCase();
}

function keyLevelSignature(levels: string[]): string {
  return levels.map((level) => level.trim().toLowerCase()).filter(Boolean).join('|');
}

function liquiditySignature(output: OverviewOutput): string {
  return [
    output.liquidity.immediateUpside,
    output.liquidity.recoveryZone,
    output.liquidity.largerUpsideMagnet,
    output.liquidity.downsideVulnerability,
    ...output.liquidity.bullets,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim().toLowerCase())
    .join('|');
}

export function computeWhatChanged(
  previous: OverviewOutput,
  current: OverviewOutput,
): string[] {
  const bullets: string[] = [];

  // Enum fields — fully deterministic comparison
  if (previous.marketRegime !== current.marketRegime) {
    bullets.push(
      `Regime: ${fmtRegime(previous.marketRegime)} → ${fmtRegime(current.marketRegime)}`,
    );
  }

  if (previous.briefConfidence !== current.briefConfidence) {
    bullets.push(`Confidence: ${previous.briefConfidence} → ${current.briefConfidence}`);
  }

  if (previous.btc.structure !== current.btc.structure) {
    bullets.push(`BTC 4H structure: ${previous.btc.structure} → ${current.btc.structure}`);
  }

  if (changed(previous.btc.position, current.btc.position)) {
    bullets.push(`BTC position: ${previous.btc.position} → ${current.btc.position}`);
  }

  if (keyLevelSignature(previous.btc.keyLevels) !== keyLevelSignature(current.btc.keyLevels)) {
    bullets.push('BTC key levels changed.');
  }

  if (previous.alts.rotationState !== current.alts.rotationState) {
    bullets.push(
      `Alt rotation: ${fmtRotation(previous.alts.rotationState)} → ${fmtRotation(current.alts.rotationState)}`,
    );
  }

  if (changed(previous.alts.breadth, current.alts.breadth)) {
    bullets.push(`Alt breadth: ${previous.alts.breadth} → ${current.alts.breadth}`);
  }

  // New upcoming events (by title)
  const prevTitles = new Set(previous.events.upcoming.map((e) => e.title));
  for (const ev of current.events.upcoming) {
    if (!prevTitles.has(ev.title)) {
      bullets.push(`New event: ${ev.title} (${ev.importance})`);
    }
  }

  // Events that have passed or been removed
  const currentTitles = new Set(current.events.upcoming.map((e) => e.title));
  for (const ev of previous.events.upcoming) {
    if (!currentTitles.has(ev.title)) {
      bullets.push(`Event resolved/removed: ${ev.title}`);
    }
  }

  // Derivatives funding shift — only flag when moving to or from an extreme reading
  const prevFunding = previous.derivatives.funding;
  const currFunding = current.derivatives.funding;
  if (prevFunding !== currFunding) {
    bullets.push(`Funding shift: ${prevFunding} → ${currFunding}`);
  }

  if (changed(previous.derivatives.oi, current.derivatives.oi)) {
    bullets.push(`OI shift: ${previous.derivatives.oi} → ${current.derivatives.oi}`);
  }

  if (changed(previous.derivatives.positioning, current.derivatives.positioning)) {
    bullets.push(`Positioning shift: ${previous.derivatives.positioning} → ${current.derivatives.positioning}`);
  }

  // ETH/BTC trend direction change
  const prevEthDir = extractEthBtcDirection(previous.eth.vsbtc);
  const currEthDir = extractEthBtcDirection(current.eth.vsbtc);
  if (prevEthDir !== null && currEthDir !== null && prevEthDir !== currEthDir) {
    bullets.push(`ETH/BTC trend: ${prevEthDir} → ${currEthDir}`);
  } else if (prevEthDir === null || currEthDir === null) {
    if (changed(previous.eth.vsbtc, current.eth.vsbtc)) {
      bullets.push(`ETH/BTC read: ${previous.eth.vsbtc} → ${current.eth.vsbtc}`);
    }
  }

  if (liquiditySignature(previous) !== liquiditySignature(current)) {
    bullets.push('Liquidity map changed.');
  }

  if (bullets.length === 0) {
    bullets.push('No significant structural changes since previous brief.');
  }

  return bullets.slice(0, 8);
}

export function firstBriefBullets(): string[] {
  return ['No previous brief available for this session — initial reading.'];
}
