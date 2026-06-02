import type { OverviewOutput, CryptoSession } from './ports.js';

const SESSION_LABEL: Record<CryptoSession, string> = {
  ASIA_CRYPTO: 'Asia',
  EUROPE_CRYPTO: 'Europe',
  US_CRYPTO: 'US',
};

const FRANKFURT_TZ = 'Europe/Berlin';

const IMPORTANCE_SYMBOL: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

function toUtcDatetime(utcIso: string): string {
  const date = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
}

function toFrankfurtHHmm(utcIso: string): string {
  const date = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: FRANKFURT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export class OverviewFormatter {
  format(output: OverviewOutput): string {
    const { session } = output;
    const label = SESSION_LABEL[session];

    const lines: string[] = [];

    // Header
    lines.push(`Crypto ${label} Brief`);
    lines.push(`Generated: ${toUtcDatetime(output.generatedAtUtc)} UTC / ${toFrankfurtHHmm(output.generatedAtUtc)} Frankfurt`);
    lines.push('');

    // Regime + confidence
    const regimeDisplay = output.marketRegime.replace(/_/g, ' ');
    lines.push(`Market regime: ${regimeDisplay}`);
    lines.push(`Brief confidence: ${output.briefConfidence}`);
    lines.push('');

    // What changed
    lines.push('📌 What changed');
    for (const bullet of output.whatChanged) {
      lines.push(`• ${bullet}`);
    }
    lines.push('');

    // BTC
    lines.push('₿ BTC');
    lines.push(output.btc.summary);
    if (output.btc.keyLevels.length > 0) {
      lines.push(`Key levels: ${output.btc.keyLevels.join(' · ')}`);
    }
    lines.push(`Position: ${output.btc.position}  |  Structure: ${output.btc.structure}`);
    lines.push('');

    // ETH
    lines.push('Ξ ETH');
    lines.push(output.eth.summary);
    lines.push(`vs BTC: ${output.eth.vsbtc}`);
    if (output.eth.keyLevels.length > 0) {
      lines.push(`Key levels: ${output.eth.keyLevels.join(' · ')}`);
    }
    lines.push('');

    // Alts
    lines.push('🌊 Alts');
    lines.push(output.alts.summary);
    lines.push(
      `Rotation: ${output.alts.rotationState.replace(/_/g, ' ')}  |  Breadth: ${output.alts.breadth}`,
    );
    lines.push('');

    // Derivatives
    lines.push('📊 Derivatives');
    lines.push(
      `Funding: ${output.derivatives.funding}  |  OI: ${output.derivatives.oi}  |  Positioning: ${output.derivatives.positioning}`,
    );
    if (output.derivatives.summary.trim() !== '') {
      lines.push(output.derivatives.summary);
    }
    lines.push('');

    // Liquidity
    lines.push('Liquidity:');
    const structuredLiquidity = [
      output.liquidity.immediateUpside !== undefined
        ? `Immediate upside resistance / liquidity: ${output.liquidity.immediateUpside}`
        : undefined,
      output.liquidity.recoveryZone !== undefined
        ? `Recovery confirmation zone: ${output.liquidity.recoveryZone}`
        : undefined,
      output.liquidity.largerUpsideMagnet !== undefined
        ? `Larger upside magnet / options area: ${output.liquidity.largerUpsideMagnet}`
        : undefined,
      output.liquidity.downsideVulnerability !== undefined
        ? `Downside vulnerability: ${output.liquidity.downsideVulnerability}`
        : undefined,
    ].filter((line): line is string => line !== undefined);
    for (const b of structuredLiquidity) {
      lines.push(`* ${b}`);
    }
    const structuredText = new Set(structuredLiquidity.map((line) => line.toLowerCase()));
    for (const b of output.liquidity.bullets) {
      if (structuredText.has(b.toLowerCase())) continue;
      lines.push(`* ${b}`);
    }
    lines.push('');

    // Events (omit section if no upcoming and no summary)
    if (output.events.upcoming.length > 0 || output.events.summary.trim() !== '') {
      lines.push('📅 Events');
      if (output.events.summary.trim() !== '') {
        lines.push(output.events.summary);
      }
      for (const ev of output.events.upcoming) {
        const sym = IMPORTANCE_SYMBOL[ev.importance] ?? '⚪';
        lines.push(`${sym} ${ev.title}  |  ${ev.time}`);
      }
      lines.push('');
    }

    // Scenarios (always present)
    lines.push('⚡ Scenarios');
    lines.push(`▶ Reclaim: ${output.scenarios.reclaim}`);
    lines.push(`▶ Rejection: ${output.scenarios.rejection}`);
    lines.push(`▶ Chop: ${output.scenarios.chop}`);
    lines.push('');

    // Footer
    lines.push('─────────────────────');
    lines.push(output.note);

    return lines.join('\n');
  }

  splitForTelegram(report: string, maxLength = 4096): string[] {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw new Error('maxLength must be a positive integer');
    }
    if (report.length <= maxLength) return [report];

    const chunks: string[] = [];
    const lines = report.split('\n');
    let current = '';

    const pushCurrent = (): void => {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
    };

    const appendLine = (line: string): void => {
      const newSection = current.length === 0 ? line : `${current}\n${line}`;
      if (newSection.length > maxLength) {
        pushCurrent();
        current = line;
      } else {
        current = newSection;
      }
    };

    for (const line of lines) {
      if (line.length <= maxLength) {
        appendLine(line);
        continue;
      }

      pushCurrent();
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
    }
    pushCurrent();
    return chunks;
  }
}
