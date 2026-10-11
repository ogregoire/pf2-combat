import { dieBands, type Degree } from "./degrees.js";

export const DEGREES: Degree[] = ["critical-success", "success", "failure", "critical-failure"];

/** How many of the twenty d20 faces give each degree on a save of
 * `modifier` against `dc` — naturals 1 and 20 included. */
export function degreeFaces(modifier: number, dc: number): Record<Degree, number> {
  const bands = dieBands(modifier, dc);
  const count = (d: Degree): number => (bands[d] ? bands[d]!.to - bands[d]!.from + 1 : 0);
  return { "critical-success": count("critical-success"), success: count("success"), failure: count("failure"), "critical-failure": count("critical-failure") };
}

/** A basic save's damage at each degree (Player Core): none on a critical
 * success, half (rounded down) on a success, full on a failure, double on
 * a critical failure. */
export function basicSaveDamage(amount: number, degree: Degree): number {
  switch (degree) {
    case "critical-success": return 0;
    case "success": return Math.floor(amount / 2);
    case "failure": return amount;
    case "critical-failure": return amount * 2;
  }
}

/** The first damage roll a spell's text states — `@Damage[(2d6+4)[fire]]`
 * — as a formula and a type; null when there's none. */
export function firstDamage(description: string): { formula: string; type: string } | null {
  const m = /@Damage\[\(?([0-9d+\-\s]+?)\)?\[([a-z-]+)(?:,[a-z-]+)*\]/.exec(description);
  return m ? { formula: m[1]!.replace(/\s+/g, ""), type: m[2]! } : null;
}
