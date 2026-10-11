import { describe, expect, it } from "vitest";
import {
  CHECKS,
  CONDITIONS,
  conditionModifiers,
  skillChecks,
  strikeChecks,
  strikeDamageChecks,
  type ConditionSlug,
  type Selector,
} from "../src/rules/conditions.js";
import { resolveModifiers } from "../src/rules/modifiers.js";
import { resolveStrike } from "../src/rules/strike.js";

/**
 * Every condition, applied at value 2, against every check the app shows a
 * number for — pinned against Player Core's condition text and the
 * FlatModifier rules on Foundry pf2e's condition items (the dataset's
 * source). A cell left out is 0. Adding a condition means adding a row:
 * the completeness test below fails until it has one.
 */
const CHECK_LISTS: Record<string, readonly Selector[]> = {
  ac: CHECKS.ac,
  fortitude: CHECKS.fortitude,
  reflex: CHECKS.reflex,
  will: CHECKS.will,
  perception: CHECKS.perception,
  athletics: skillChecks("athletics"),
  acrobatics: skillChecks("acrobatics"),
  arcana: skillChecks("arcana"),
  medicine: skillChecks("medicine"),
  deception: skillChecks("deception"),
  melee: strikeChecks({ kind: "melee", traits: [] }),
  finesse: strikeChecks({ kind: "melee", traits: ["finesse"] }),
  ranged: strikeChecks({ kind: "ranged", traits: [] }),
  brutal: strikeChecks({ kind: "ranged", traits: ["brutal"] }),
  spellAttack: CHECKS.spellAttack,
  spellDc: CHECKS.spellDc,
  meleeDamage: strikeDamageChecks({ kind: "melee", traits: [] }),
  rangedDamage: strikeDamageChecks({ kind: "ranged", traits: [] }),
  thrownDamage: strikeDamageChecks({ kind: "ranged", traits: ["thrown-20"] }),
};
type Check = keyof typeof CHECK_LISTS;

const every = (v: number, checks: Check[]): Partial<Record<Check, number>> =>
  Object.fromEntries(checks.map((c) => [c, v]));
const ALL_CHECKS: Check[] = [
  "ac", "fortitude", "reflex", "will", "perception", "athletics", "acrobatics", "arcana", "medicine",
  "deception", "melee", "finesse", "ranged", "brutal", "spellAttack", "spellDc",
];
const ALL_SKILLS: Check[] = ["athletics", "acrobatics", "arcana", "medicine", "deception"];
const ALL_ATTACKS: Check[] = ["melee", "finesse", "ranged", "brutal", "spellAttack"];
const UNCONSCIOUS = { ac: -6, reflex: -4, perception: -4 };

const EXPECTED: Record<ConditionSlug, Partial<Record<Check, number>>> = {
  // −2 circumstance to AC.
  "off-guard": { ac: -2 },
  // "Status penalty equal to the value to all your checks and DCs."
  frightened: every(-2, ALL_CHECKS),
  sickened: every(-2, ALL_CHECKS),
  // Dexterity-based: AC, Reflex, ranged attacks, Acrobatics/Stealth/
  // Thievery — and a finesse melee Strike.
  clumsy: every(-2, ["ac", "reflex", "acrobatics", "finesse", "ranged"]),
  // Strength-based: melee attacks (not finesse), brutal ranged, Athletics,
  // and Strength-based damage (melee, thrown).
  enfeebled: every(-2, ["athletics", "melee", "brutal", "meleeDamage", "thrownDamage"]),
  // Intelligence/Wisdom/Charisma: Will, Perception, mental skills, spells.
  stupefied: every(-2, ["will", "perception", "arcana", "medicine", "deception", "spellAttack", "spellDc"]),
  // Constitution-based: Fortitude. (Its Hit Points: the store.)
  drained: { fortitude: -2 },
  // −2 circumstance to attack rolls, and off-guard.
  prone: { ...every(-2, ALL_ATTACKS), ac: -2 },
  grabbed: { ac: -2 },
  restrained: { ac: -2 },
  paralyzed: { ac: -2 },
  confused: { ac: -2 },
  // −4 status to Perception.
  blinded: { perception: -4 },
  // −4 status to AC, Perception and Reflex; blinded (Perception, which
  // doesn't stack) and off-guard (AC, which does: circumstance).
  unconscious: UNCONSCIOUS,
  dying: UNCONSCIOUS,
  // −1 status to AC and saving throws.
  fatigued: every(-1, ["ac", "fortitude", "reflex", "will"]),
  // Clumsy 1.
  encumbered: every(-1, ["ac", "reflex", "acrobatics", "finesse", "ranged"]),
  // −2 status to Perception and skill checks.
  fascinated: { ...every(-2, ALL_SKILLS), perception: -2 },
  // No number of their own: actions, visibility, death, narrative.
  slowed: {}, stunned: {}, quickened: {}, immobilized: {}, dazzled: {},
  // Deafened's −2 Perception is for initiative only, which the GM rolls.
  deafened: {},
  doomed: {}, wounded: {}, "persistent-damage": {}, petrified: {}, fleeing: {},
  invisible: {}, concealed: {}, hidden: {}, undetected: {}, broken: {},
  controlled: {}, cursebound: {}, observed: {}, unnoticed: {},
};

describe("every condition's bonus or malus, check by check", () => {
  it("has a row for every condition", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(CONDITIONS).sort());
  });

  for (const slug of Object.keys(CONDITIONS) as ConditionSlug[]) {
    it(`${slug} 2`, () => {
      const actual = Object.fromEntries(
        Object.entries(CHECK_LISTS)
          .map(([check, selectors]) => [check, resolveModifiers(conditionModifiers([{ slug, value: 2 }], selectors)).total])
          .filter(([, total]) => total !== 0),
      );
      expect(actual).toEqual(EXPECTED[slug]);
    });
  }

  it("lowers a melee Strike's damage under enfeebled, before a critical hit doubles it", () => {
    const r = resolveStrike({
      bonus: 15, kind: "melee", agile: false, strikesMade: 0,
      attackerConditions: [{ slug: "enfeebled", value: 2 }], targetConditions: [], targetAc: 20,
      damage: [{ formula: "1d8+5", type: "slashing" }, { formula: "1d6", type: "fire" }],
    });
    expect(r.modifier).toBe(13);
    expect(r.damageLedger.total).toBe(-2);
    expect(r.outcomes[1]!.damage).toBe("1d8+3 slashing + 1d6 fire");
    expect(r.outcomes[0]!.damage).toBe("2d8+6 slashing + 2d6 fire");
  });
});
