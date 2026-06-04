import type { SessionContext } from '../../core/src/index.js';
import { getSessionDisplay } from './session-display.js';

export type SessionLevel = {
  value: number;
  label: string;
};

export type SessionLevelsPresentation = {
  recovery?: SessionLevel;
  resistance?: SessionLevel;
  vulnerability?: SessionLevel;
  previousRange?: {
    label: string;
    high: number;
    low: number;
    midpoint: number;
  };
};

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

export function formatSessionLevelValue(value: number): string {
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatSessionLevel(level: SessionLevel): string {
  return `${formatSessionLevelValue(level.value)} (${level.label})`;
}

export function buildSessionLevelsPresentation(
  sessionContext: SessionContext | null | undefined,
): SessionLevelsPresentation | undefined {
  if (sessionContext === null || sessionContext === undefined) return undefined;
  const previous = sessionContext.previousSessionHighLow;
  if (previous === undefined) return undefined;

  const display = getSessionDisplay(sessionContext.currentSession);
  const recovery = isFiniteNumber(sessionContext.currentSessionOpen)
    ? {
        value: sessionContext.currentSessionOpen,
        label: `${display.currentSessionLabel} session open`,
      }
    : {
        value: previous.high,
        label: `${display.previousSessionLabel} session high`,
      };

  return {
    recovery,
    resistance: {
      value: previous.high,
      label: `${display.previousSessionLabel} session high`,
    },
    vulnerability: {
      value: previous.low,
      label: `${display.previousSessionLabel} session low`,
    },
    previousRange: {
      label: `${display.previousSessionLabel} session range`,
      high: previous.high,
      low: previous.low,
      midpoint: previous.midpoint,
    },
  };
}
