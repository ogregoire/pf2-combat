export function mapPenalty(strikesMade: number, agile: boolean): number {
  const step = agile ? 4 : 5;
  if (strikesMade <= 0) return 0;
  if (strikesMade === 1) return -step;
  return -step * 2;
}

export function mapLadder(bonus: number, agile: boolean): number[] {
  return [0, 1, 2].map((n) => bonus + mapPenalty(n, agile));
}
