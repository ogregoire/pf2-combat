export type Degree =
  | "critical-success"
  | "success"
  | "failure"
  | "critical-failure";

const LADDER: Degree[] = [
  "critical-failure",
  "failure",
  "success",
  "critical-success",
];

const shift = (degree: Degree, steps: number): Degree => {
  const i = LADDER.indexOf(degree);
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, i + steps))]!;
};

export function degreeOf(
  total: number,
  dc: number,
  naturalRoll?: number,
): Degree {
  let degree: Degree;
  if (total >= dc + 10) degree = "critical-success";
  else if (total >= dc) degree = "success";
  else if (total > dc - 10) degree = "failure";
  else degree = "critical-failure";

  if (naturalRoll === 20) degree = shift(degree, 1);
  else if (naturalRoll === 1) degree = shift(degree, -1);
  return degree;
}

export interface DieBand {
  from: number;
  to: number;
}

export type DieBands = Record<Degree, DieBand | null>;

/**
 * The d20 faces producing each degree, derived by asking `degreeOf` about all
 * twenty faces rather than by arithmetic on the DC.
 *
 * Arithmetic is where this goes wrong: the natural-20 and natural-1 shifts
 * apply to EVERY degree, not only the critical band, so a face that would
 * merely fail can succeed on a 20 and a face that would crit can drop to a
 * plain success on a 1. Deriving from the single function that encodes the
 * rules means the ladder and the bands can never disagree.
 */
export function dieBands(modifier: number, dc: number): DieBands {
  const bands: DieBands = {
    "critical-success": null,
    success: null,
    failure: null,
    "critical-failure": null,
  };

  for (let face = 1; face <= 20; face += 1) {
    const degree = degreeOf(face + modifier, dc, face);
    const held = bands[degree];
    if (held === null) bands[degree] = { from: face, to: face };
    else held.to = face;
  }

  return bands;
}

export interface DegreeTotalRange {
  degree: Degree;
  /** Lowest and highest `face + modifier` total any face produces for this
   * degree (equal when only one face does), both null when no face reaches
   * it at all. Converted straight from `dieBands`' face range — never
   * recomputed from DC arithmetic — so a degree reachable only through the
   * natural-1/natural-20 shift still gets the total that die roll actually
   * produces, and a degree no face reaches (arithmetically or via the
   * shift) is honestly reported as unreachable rather than printing a
   * range, like "30+", that the roll can never produce. */
  low: number | null;
  high: number | null;
}

const OUTCOME_ORDER: Degree[] = [
  "critical-success",
  "success",
  "failure",
  "critical-failure",
];

export function degreeTotalRanges(modifier: number, dc: number): DegreeTotalRange[] {
  const bands = dieBands(modifier, dc);
  return OUTCOME_ORDER.map((degree) => {
    const band = bands[degree];
    return {
      degree,
      low: band === null ? null : band.from + modifier,
      high: band === null ? null : band.to + modifier,
    };
  });
}
