export function normalizeFundingPer8h(rate: number, intervalHours?: number): number | undefined {
  if (intervalHours === undefined || intervalHours <= 0) return undefined;
  return rate * (8 / intervalHours);
}
