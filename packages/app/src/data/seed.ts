import type { Creature, IndexEntry } from "@pf2/schema";
import type { Iwr } from "../rules/damage.js";
import type { CombatantSeed } from "../state/store.js";

/**
 * The four fields `Combatant` carries but no producer has populated yet
 * (`iwr`, `reactions`, `attacks`, `actions`) all come from the full
 * `Creature` record, not the lightweight `IndexEntry` search results. This
 * is the one place that denormalises them onto a `CombatantSeed` — every
 * other consumer (the damage popover, reaction watch, roll assistant) just
 * reads what's already on the combatant.
 */
function toIwr(creature: Creature): Iwr {
  return {
    immunities: creature.immunities.map((i) => i.type),
    weaknesses: creature.weaknesses.map((w) => ({ type: w.type, value: w.value, exceptions: w.exceptions })),
    resistances: creature.resistances.map((r) => ({ type: r.type, value: r.value, exceptions: r.exceptions })),
  };
}

/** Reactions are just actions costed "reaction" — a trigger-less one (rare)
 * shows its name alone downstream, per ReactionWatch, so an absent trigger
 * becomes "" rather than null. */
function toReactions(creature: Creature): { name: string; trigger: string }[] {
  return creature.actions
    .filter((a) => a.cost === "reaction")
    .map((a) => ({ name: a.name, trigger: a.trigger ?? "" }));
}

/** Builds the seed for a combatant added from the catalog. `entry` must be
 * the RAW, unlocalized catalog entry — never the French-named copy the
 * search results render — so `name` is always stored in English; the
 * French name is resolved at render time (see `useCombatantI18n`, driven
 * off `creatureId`), never baked into the stored combatant. `creature` is
 * only present once `loadCreature` has resolved, so a null creature still
 * yields a valid seed with the four denormalised fields left empty, same
 * as any other seed. No `i18n` parameter: no production caller has one to
 * pass (the render layer resolves it from `creatureId` instead), and a
 * test that wants to seed one directly can still set `CombatantSeed.i18n`
 * on the result — see e.g. french-creature.test.tsx, which does exactly
 * that without going through this function at all. */
export function seedFromEntry(entry: IndexEntry, creature: Creature | null): CombatantSeed {
  return {
    kind: "creature",
    name: entry.name,
    creatureId: entry.id,
    hp: { current: entry.hp, max: entry.hp },
    ac: entry.ac,
    saves:
      creature !== null
        ? {
            fortitude: creature.saves.fortitude.value,
            reflex: creature.saves.reflex.value,
            will: creature.saves.will.value,
          }
        : null,
    level: entry.level,
    iwr: creature !== null ? toIwr(creature) : null,
    reactions: creature !== null ? toReactions(creature) : [],
    attacks: creature !== null ? creature.attacks : [],
    actions: creature !== null ? creature.actions : [],
    // A creature's Perception is its initiative modifier — PF2e always
    // rolls initiative with Perception unless the GM calls for a different
    // skill, which this app doesn't model. Null (not the four fields'
    // "empty" state) when no creature record has loaded yet, since there's
    // no reasonable default for a number the GM will roll against.
    initiativeModifier: creature?.perception ?? null,
  };
}
