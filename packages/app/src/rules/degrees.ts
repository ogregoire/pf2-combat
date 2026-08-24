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
