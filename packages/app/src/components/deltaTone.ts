/**
 * The colour of a value a condition has moved, measured against the value
 * without it: green when the final value is higher, red when it is lower,
 * the ordinary text colour when nothing moved it (or the moves cancel out).
 * Every adjusted number — AC, saves, Perception, skills, spell DC and
 * attack, Strike bonuses — takes its colour from here, so a green or red
 * figure means the same thing wherever it appears.
 */
export type DeltaTone = "ok" | "danger";

export function deltaTone(delta: number): DeltaTone | null {
  if (delta > 0) return "ok";
  if (delta < 0) return "danger";
  return null;
}

export function deltaColor(delta: number): string | undefined {
  const tone = deltaTone(delta);
  return tone === null ? undefined : `var(--${tone})`;
}
