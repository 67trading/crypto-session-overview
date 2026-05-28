import type { OverviewOutput, CryptoSession } from './ports.js';

const SESSION_EMOJI: Record<CryptoSession, string> = {
  ASIA_CRYPTO: '🌏',
  EUROPE_CRYPTO: '🌍',
  US_CRYPTO: '🌎',
};

const SESSION_LABEL: Record<CryptoSession, string> = {
  ASIA_CRYPTO: 'Asia',
  EUROPE_CRYPTO: 'Europe',
  US_CRYPTO: 'US',
};

const SOFIA_TZ = 'Europe/Sofia';

const IMPORTANCE_SYMBOL: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

function toSofiaTime(utcIso: string): string {
  const date = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SOFIA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
}

export class OverviewFormatter {
  format(output: OverviewOutput): string {
    const { session } = output;
    const emoji = SESSION_EMOJI[session];
    const label = SESSION_LABEL[session];
    const sofiaTime = toSofiaTime(output.generatedAtUtc);

    const lines: string[] = [];

    // Header
    lines.push(`${emoji} ${label} Crypto Brief  |  ${sofiaTime} Sofia`);
    lines.push('');

    // Data status
    const { dataStatus } = output;
    lines.push(
      `📊 Price: ${dataStatus.price}  |  Events: ${dataStatus.events}  |  OI/Funding: ${dataStatus.derivatives}  |  Liq: ${dataStatus.liquidations}`,
    );
    lines.push('');

    // Regime + confidence
    const regimeDisplay = output.marketRegime.replace(/_/g, ' ');
    lines.push(`🔴 Regime: ${regimeDisplay}  |  Confidence: ${output.briefConfidence}`);
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

    // Major assets (omit section if none)
    if (output.majorAssets.length > 0) {
      lines.push('📈 Major Assets');
      for (const asset of output.majorAssets) {
        const levels = asset.keyLevels.length > 0 ? `  [${asset.keyLevels.join(' · ')}]` : '';
        lines.push(`${asset.symbol} — ${asset.summary}${levels}`);
      }
      lines.push('');
    }

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
    if (report.length <= maxLength) return [report];

    const chunks: string[] = [];
    const lines = report.split('\n');
    let current = '';

    for (const line of lines) {
      const newSection = current.length === 0 ? line : `${current}\n${line}`;
      if (newSection.length > maxLength) {
        if (current.length > 0) chunks.push(current);
        current = line;
      } else {
        current = newSection;
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }
}
