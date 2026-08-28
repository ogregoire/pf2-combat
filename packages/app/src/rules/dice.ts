/**
 * There is no general dice/expression evaluator anywhere in this codebase —
 * damage formulas (strike.ts) are otherwise only ever manipulated as text
 * (doubled, deadly/fatal dice added) and displayed, never rolled. This is
 * the first thing that needs an actual result, for persistent damage at end
 * of turn (see conditions.ts). Rather than build a general evaluator, this
 * parses exactly the shapes the dataset uses for persistent damage —
 * `NdM`, `NdM+K`, `NdM-K` — and rejects anything else predictably (returns
 * null) instead of guessing at how to evaluate it.
 */

/** `rng` must return a value in [0, 1), same contract as `Math.random`. */
export type Rng = () => number;

/**
 * Rolls `formula` using `rng` (defaulting to `Math.random`) for each die.
 * The `rng` parameter exists so callers — and, critically, tests — can get
 * a deterministic result instead of asserting only "> 0" and hoping the
 * random roll happened to be positive.
 *
 * Returns null, never throws, for anything that isn't a bare `NdM(+/-K)`
 * formula: undefined/missing, a multi-term expression, a zero die count or
 * size, or plain garbage. The caller (conditions.ts) decides what "no
 * result" means for persistent damage; this function only parses and rolls.
 */
export function rollFormula(formula: string | undefined, rng: Rng = Math.random): number | null {
  if (formula === undefined) return null;
  const m = /^(\d+)d(\d+)\s*([+-]\s*\d+)?$/.exec(formula.trim());
  if (m === null) return null;

  const count = Number(m[1]);
  const size = Number(m[2]);
  if (count <= 0 || size <= 0) return null;

  const flat = m[3] === undefined ? 0 : Number(m[3].replace(/\s+/g, ""));
  let total = flat;
  for (let i = 0; i < count; i++) {
    total += Math.floor(rng() * size) + 1;
  }
  return total;
}
