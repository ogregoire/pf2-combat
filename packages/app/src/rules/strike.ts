import { conditionModifiers, type AppliedCondition, type ConditionSlug } from "./conditions.js";
import { dieBands, type Degree } from "./degrees.js";
import { mapPenalty } from "./map.js";
import { resolveModifiers, type Modifier, type ModifierResult } from "./modifiers.js";

/** `1d8+5` → `2d8+10`. Dice count and flat bonus both double on a crit. */
export function doubleFormula(formula: string): string {
  const dice = /^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/.exec(formula.trim());
  if (dice !== null) {
    const count = Number(dice[1]) * 2;
    const flat = dice[3] === undefined ? "" : `+${Number(dice[3]) * 2}`;
    return `${count}d${dice[2]}${flat}`;
  }
  const flat = /^(\d+)$/.exec(formula.trim());
  if (flat !== null) return String(Number(flat[1]) * 2);
  return `(${formula}) x2`;
}

export interface StrikeInput {
  bonus: number;
  kind: "melee" | "ranged";
  agile: boolean;
  strikesMade: number;
  attackerConditions: AppliedCondition[];
  targetConditions: AppliedCondition[];
  targetAc: number;
  damage: { formula: string; type: string }[];
  precision?: { formula: string; when: ConditionSlug };
}

export interface StrikeOutcome {
  degree: Degree;
  dieFrom: number | null;
  dieTo: number | null;
  damage: string | null;
}

export interface StrikeResolution {
  modifier: number;
  ledger: ModifierResult;
  effectiveAc: number;
  acLedger: ModifierResult;
  outcomes: StrikeOutcome[];
}

const damageText = (
  input: StrikeInput,
  crit: boolean,
  precisionActive: boolean,
): string => {
  const parts = input.damage.map((d) =>
    `${crit ? doubleFormula(d.formula) : d.formula} ${d.type}`,
  );
  if (precisionActive && input.precision !== undefined) {
    const f = crit
      ? doubleFormula(input.precision.formula)
      : input.precision.formula;
    parts.push(`${f} precision`);
  }
  return parts.join(" + ");
};

export function resolveStrike(input: StrikeInput): StrikeResolution {
  const attackMods: Modifier[] = [
    { value: input.bonus, type: "untyped", source: "attack bonus" },
    ...conditionModifiers(
      input.attackerConditions,
      input.kind === "melee" ? "melee-attack" : "ranged-attack",
    ),
  ];
  const map = mapPenalty(input.strikesMade, input.agile);
  if (map !== 0) {
    attackMods.push({ value: map, type: "untyped", source: "multiple attack penalty" });
  }
  const ledger = resolveModifiers(attackMods);

  const acMods: Modifier[] = [
    { value: input.targetAc, type: "untyped", source: "target AC" },
    ...conditionModifiers(input.targetConditions, "ac"),
  ];
  const acLedger = resolveModifiers(acMods);

  const modifier = ledger.total;
  const effectiveAc = acLedger.total;
  const bands = dieBands(modifier, effectiveAc);

  const precisionActive =
    input.precision !== undefined &&
    input.targetConditions.some((c) => c.slug === input.precision!.when);

  const LADDER_ORDER: Degree[] = [
    "critical-success",
    "success",
    "failure",
    "critical-failure",
  ];

  const outcomes: StrikeOutcome[] = LADDER_ORDER.map((degree) => {
    const band = bands[degree];
    const hits = degree === "critical-success" || degree === "success";
    return {
      degree,
      dieFrom: band === null ? null : band.from,
      dieTo: band === null ? null : band.to,
      damage: hits
        ? damageText(input, degree === "critical-success", precisionActive)
        : null,
    };
  });

  return { modifier, ledger, effectiveAc, acLedger, outcomes };
}
