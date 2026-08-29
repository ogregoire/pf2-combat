import { conditionModifiers, type AppliedCondition, type ConditionSlug } from "./conditions.js";
import { damageTypeName } from "./damage.js";
import { dieBands, type Degree } from "./degrees.js";
import { mapPenalty } from "./map.js";
import { resolveModifiers, type Modifier, type ModifierResult } from "./modifiers.js";
import { STRINGS_EN } from "../i18n/en.js";
import { STRINGS_FR } from "../i18n/fr.js";

interface ParsedDice {
  count: number;
  size: number;
  flat: number;
}

/** Parses a `NdM(+F|-F)?` formula. `-1` in the flat modifier is a real case
 * (e.g. `1d4-1`) — this captures the sign, unlike the old hand-rolled regex
 * that only matched `+`. */
function parseDice(formula: string): ParsedDice | null {
  const m = /^(\d+)d(\d+)\s*([+-]\s*\d+)?$/.exec(formula.trim());
  if (m === null) return null;
  const flat = m[3] === undefined ? 0 : Number(m[3].replace(/\s+/g, ""));
  return { count: Number(m[1]), size: Number(m[2]), flat };
}

function formatDice(count: number, size: number, flat: number): string {
  const flatText = flat === 0 ? "" : flat > 0 ? `+${flat}` : `${flat}`;
  return `${count}d${size}${flatText}`;
}

/** `1d8+5` → `2d8+10`, `1d4-1` → `2d4-2`. Dice count and flat modifier both
 * double on a crit, sign included. */
export function doubleFormula(formula: string): string {
  const dice = parseDice(formula);
  if (dice !== null) return formatDice(dice.count * 2, dice.size, dice.flat * 2);
  const flat = /^(\d+)$/.exec(formula.trim());
  if (flat !== null) return String(Number(flat[1]) * 2);
  return `(${formula}) x2`;
}

/** `deadly-d8` (implicit count 1) or `deadly-2d10` (bestiary stat blocks
 * bake the die count in directly). Adds that many extra dice of the listed
 * size on a crit — on top of normal crit doubling, never doubled itself. */
function findDeadly(traits: string[]): { count: number; size: number } | null {
  for (const t of traits) {
    const m = /^deadly-(\d*)d(\d+)$/.exec(t);
    if (m !== null) return { count: m[1] === "" ? 1 : Number(m[1]), size: Number(m[2]) };
  }
  return null;
}

/** `fatal-d10`: on a crit the weapon's own damage die becomes a d10 (before
 * doubling), and one extra d10 is added on top. */
function findFatal(traits: string[]): { size: number } | null {
  for (const t of traits) {
    const m = /^fatal-d(\d+)$/.exec(t);
    if (m !== null) return { size: Number(m[1]) };
  }
  return null;
}

/** Applies deadly/fatal to the weapon's own crit damage — traits only ever
 * modify the base weapon damage entry (index 0), never bonus dice like
 * persistent or splash damage tacked on beside it. */
function critBaseDamage(formula: string, traits: string[]): string {
  const fatal = findFatal(traits);
  const deadly = findDeadly(traits);

  const base = parseDice(formula);
  const withFatal = fatal !== null && base !== null ? formatDice(base.count, fatal.size, base.flat) : formula;
  const doubled = doubleFormula(withFatal);
  if (fatal !== null) {
    const doubledParsed = parseDice(doubled);
    if (doubledParsed !== null) {
      // The doubled formula already counts the weapon's normal crit dice;
      // fatal adds one more of the fatal size on top of that.
      return formatDice(doubledParsed.count + 1, fatal.size, doubledParsed.flat);
    }
  }
  if (deadly === null) return doubled;
  const doubledParsed = parseDice(doubled);
  if (doubledParsed !== null && doubledParsed.size === deadly.size) {
    return formatDice(doubledParsed.count + deadly.count, deadly.size, doubledParsed.flat);
  }
  return `${doubled}+${deadly.count}d${deadly.size}`;
}

export interface StrikeDamageEntry {
  formula: string;
  type: string;
  /** null/undefined is ordinary damage. "persistent" and "splash" are
   * labelled in the outcome text; splash additionally never doubles on a
   * crit — see damageText. */
  category?: string | null;
}

export interface StrikeInput {
  bonus: number;
  kind: "melee" | "ranged";
  agile: boolean;
  strikesMade: number;
  attackerConditions: AppliedCondition[];
  targetConditions: AppliedCondition[];
  targetAc: number;
  damage: StrikeDamageEntry[];
  /** The Strike's own traits — read here only for deadly-dX/fatal-dX. */
  traits?: string[];
  precision?: { formula: string; when: ConditionSlug };
  /** Display language for `StrikeOutcome.damage`'s composed text (type name,
   * category label). Optional and defaulting to "en" so the many callers in
   * strike.test.ts that don't care about localisation — this is a rules
   * test, not an i18n one — don't all need updating for a French-only
   * concern. */
  lang?: "en" | "fr";
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

/**
 * The category label for a damage component ("persistent", "splash") in
 * `lang`. Only those two values are known categories the app itself ever
 * produces (see StrikeDamageEntry's own doc comment) — anything else in the
 * dataset's free-form `category` string passes through unchanged, the same
 * "unrecognised input renders plainly" stance damageTypeName takes for an
 * unknown damage type.
 */
function categoryLabel(category: string, lang: "en" | "fr"): string {
  const s = lang === "fr" ? STRINGS_FR : STRINGS_EN;
  if (category === "persistent") return s.DAMAGE_CATEGORY_PERSISTENT;
  if (category === "splash") return s.DAMAGE_CATEGORY_SPLASH;
  return category;
}

const damageText = (
  input: StrikeInput,
  crit: boolean,
  precisionActive: boolean,
): string => {
  const traits = input.traits ?? [];
  const lang = input.lang ?? "en";
  const parts = input.damage.map((d, i) => {
    // Splash damage is never multiplied, even on a crit (core rule) — every
    // other category doubles normally.
    const doubles = crit && d.category !== "splash";
    const formula = doubles
      ? i === 0
        ? critBaseDamage(d.formula, traits)
        : doubleFormula(d.formula)
      : d.formula;
    const label = d.category ? `${categoryLabel(d.category, lang)} ` : "";
    return `${formula} ${label}${damageTypeName(d.type, lang)}`;
  });
  if (precisionActive && input.precision !== undefined) {
    const f = crit
      ? doubleFormula(input.precision.formula)
      : input.precision.formula;
    parts.push(`${f} ${damageTypeName("precision", lang)}`);
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
