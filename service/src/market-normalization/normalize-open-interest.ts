export function normalizeOiUsd(input: {
  rawValue: number;
  rawUnit: 'contracts' | 'base' | 'quote' | 'usd' | 'unknown';
  markPrice?: number;
  contractSize?: number;
}): number | undefined {
  if (input.rawUnit === 'usd') return input.rawValue;
  if (input.rawUnit === 'quote') return input.rawValue;
  if (input.rawUnit === 'base' && input.markPrice !== undefined) return input.rawValue * input.markPrice;
  if (input.rawUnit === 'contracts' && input.contractSize !== undefined && input.markPrice !== undefined) {
    return input.rawValue * input.contractSize * input.markPrice;
  }
  return undefined;
}
