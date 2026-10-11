import { compareStrings } from "./compare.js";
import { rollFormula, type Rng } from "./dice.js";
import type { Modifier } from "./modifiers.js";

export type Attribute = "str" | "dex" | "con" | "int" | "wis" | "cha";

/**
 * What a condition's modifier names, after Foundry pf2e's own selectors
 * (the FlatModifier rules on its condition items, the dataset's source):
 * a check answers to several — a Reflex save is "reflex", "saving-throw"
 * and "dex-based" at once — and a condition applies when it names any of
 * them. The `CHECKS` table and the strike/skill helpers below list each
 * check's selectors, mirroring Foundry's statistic domains.
 */
export type Selector =
  /** Every attack roll: Strikes and spell attacks (prone). */
  | "attack"
  | "ac"
  | "saving-throw"
  | "fortitude"
  | "reflex"
  | "will"
  | "perception"
  | "skill"
  | "spell-attack"
  | "spell-dc"
  | `${Attribute}-based`
  /** Strength-based damage: melee Strikes, thrown and propulsive weapons. */
  | "str-damage"
  /** Every Strike's damage. */
  | "damage"
  /** The DCs a creature's abilities print ("DC 28 Will save"). */
  | "class-dc";

/** Each check's selectors. Spells answer to their casting attribute, which
 * upstream states for 10 of 696 NPC entries (all Wisdom or Charisma);
 * Foundry reads the rest as Charisma. Only stupefied ever names a casting
 * attribute, and it names all three mental ones, so Charisma for every
 * entry is exact. */
export const CHECKS = {
  ac: ["ac", "dex-based"],
  fortitude: ["fortitude", "saving-throw", "con-based"],
  reflex: ["reflex", "saving-throw", "dex-based"],
  will: ["will", "saving-throw", "wis-based"],
  perception: ["perception", "wis-based"],
  spellAttack: ["attack", "spell-attack", "cha-based"],
  spellDc: ["spell-dc", "cha-based"],
} as const satisfies Record<string, readonly Selector[]>;

/** Player Core's skill attributes. Lore skills are Intelligence. */
const SKILL_ATTRIBUTES: Record<string, Attribute> = {
  acrobatics: "dex", arcana: "int", athletics: "str", crafting: "int", deception: "cha",
  diplomacy: "cha", intimidation: "cha", medicine: "wis", nature: "wis", occultism: "int",
  performance: "cha", religion: "wis", society: "int", stealth: "dex", survival: "wis",
  thievery: "dex",
};

export function skillChecks(slug: string): Selector[] {
  return ["skill", `${SKILL_ATTRIBUTES[slug] ?? "int"}-based`];
}

interface StrikeLike {
  kind: string;
  traits: string[];
}

/** The attribute a creature's Strike attacks with, as Foundry reads an NPC
 * attack: melee is Strength, finesse melee Dexterity; ranged is Dexterity,
 * brutal ranged Strength. Clumsy and enfeebled follow it. */
export function strikeAttribute(attack: StrikeLike): Attribute {
  if (attack.kind === "melee") return attack.traits.includes("finesse") ? "dex" : "str";
  return attack.traits.includes("brutal") ? "str" : "dex";
}

export function strikeChecks(attack: StrikeLike): Selector[] {
  return ["attack", `${strikeAttribute(attack)}-based`];
}

/** A Strike adds Strength to damage in melee, thrown (unless splash) and
 * propulsive — the damage enfeebled lowers. */
export function strikeDamageChecks(attack: StrikeLike): Selector[] {
  const thrown = attack.traits.some((t) => t === "thrown" || t.startsWith("thrown-"));
  const strength =
    attack.kind === "melee" || (thrown && !attack.traits.includes("splash")) || attack.traits.includes("propulsive");
  return strength ? ["damage", "str-damage"] : ["damage"];
}

export type ConditionSlug =
  | "off-guard" | "frightened" | "sickened" | "clumsy" | "enfeebled"
  | "stupefied" | "drained" | "slowed" | "stunned" | "quickened"
  | "prone" | "grabbed" | "restrained" | "immobilized" | "blinded"
  | "dazzled" | "deafened" | "fatigued" | "doomed" | "dying"
  | "wounded" | "persistent-damage"
  | "unconscious" | "paralyzed" | "petrified" | "fleeing" | "confused"
  | "invisible" | "concealed" | "hidden" | "undetected" | "encumbered"
  | "fascinated" | "broken" | "controlled" | "cursebound" | "observed"
  | "unnoticed";

export interface ConditionDef {
  slug: ConditionSlug;
  name: string;
  valued: boolean;
  /** Selectors this condition penalises, given its value. */
  affects: (value: number) => { selectors: Selector[]; mod: Modifier } | null;
  startOfTurn?: "reduce-actions" | "recovery-check";
  endOfTurn?: "decrement" | "persistent-damage";
  implies?: ConditionSlug[];
}

// "All your checks and DCs" (data/conditions.json, frightened/sickened;
// Foundry's "all") — AC is a DC, and so are spell DCs. Not damage.
const ALL_CHECKS: Selector[] = [
  "attack", "ac", "saving-throw", "perception", "skill", "spell-attack", "spell-dc", "class-dc",
];

const status = (value: number, source: string): Modifier => ({
  value: -value,
  type: "status",
  source,
});

const circumstance = (value: number, source: string): Modifier => ({
  value: -value,
  type: "circumstance",
  source,
});

const def = (d: ConditionDef): ConditionDef => d;

export const CONDITIONS: Record<ConditionSlug, ConditionDef> = {
  "off-guard": def({
    slug: "off-guard", name: "Off-Guard", valued: false,
    affects: () => ({ selectors: ["ac"], mod: circumstance(2, "off-guard") }),
  }),
  frightened: def({
    slug: "frightened", name: "Frightened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `frightened ${v}`) }),
    endOfTurn: "decrement",
  }),
  sickened: def({
    slug: "sickened", name: "Sickened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `sickened ${v}`) }),
  }),
  clumsy: def({
    slug: "clumsy", name: "Clumsy", valued: true,
    // "Dexterity-based rolls and DCs, including AC, Reflex saves, ranged
    // attack rolls, and skill checks using Acrobatics, Stealth, and
    // Thievery" — and a finesse melee Strike, which attacks with Dexterity.
    affects: (v) => ({ selectors: ["dex-based"], mod: status(v, `clumsy ${v}`) }),
  }),
  enfeebled: def({
    slug: "enfeebled", name: "Enfeebled", valued: true,
    // "Strength-based rolls and DCs, including Strength-based melee attack
    // rolls, Strength-based damage rolls, and Athletics checks".
    affects: (v) => ({ selectors: ["str-based", "str-damage"], mod: status(v, `enfeebled ${v}`) }),
  }),
  stupefied: def({
    slug: "stupefied", name: "Stupefied", valued: true,
    // "Intelligence-, Wisdom-, and Charisma-based rolls and DCs, including
    // Will saving throws, spell attack modifiers, spell DCs, and skill
    // checks that use these attribute modifiers" — Perception is Wisdom.
    // The flat check to cast (DC 5 + value) is `stupefiedCastDc` below.
    affects: (v) => ({ selectors: ["int-based", "wis-based", "cha-based"], mod: status(v, `stupefied ${v}`) }),
  }),
  drained: def({
    slug: "drained", name: "Drained", valued: true,
    // "Constitution-based rolls and DCs, such as Fortitude saves". The Hit
    // Points it takes are the store's (`applyDrainedChange`).
    affects: (v) => ({ selectors: ["con-based"], mod: status(v, `drained ${v}`) }),
  }),
  slowed: def({
    slug: "slowed", name: "Slowed", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  stunned: def({
    slug: "stunned", name: "Stunned", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  quickened: def({
    slug: "quickened", name: "Quickened", valued: false, affects: () => null,
  }),
  prone: def({
    slug: "prone", name: "Prone", valued: false,
    // "−2 circumstance penalty to attack rolls" — spell attacks included.
    affects: () => ({ selectors: ["attack"], mod: circumstance(2, "prone") }),
    implies: ["off-guard"],
  }),
  grabbed: def({
    slug: "grabbed", name: "Grabbed", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  restrained: def({
    slug: "restrained", name: "Restrained", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  immobilized: def({
    slug: "immobilized", name: "Immobilized", valued: false, affects: () => null,
  }),
  blinded: def({
    slug: "blinded", name: "Blinded", valued: false,
    // "If vision is your only precise sense, you take a −4 status penalty
    // to Perception checks" — Foundry applies it unconditionally, and so
    // does this: a creature with another precise sense is the GM's call.
    affects: () => ({ selectors: ["perception"], mod: status(4, "blinded") }),
    // No `implies: ["off-guard"]` here, deliberately. Blinded's own text in
    // data/conditions.json never mentions off-guard; a blinded creature
    // reaches off-guard only because it can't see, so its targets are
    // undetected to it, and you're off-guard to undetected creatures. That
    // link runs through the visibility system, which this app does not
    // model — and it doesn't always hold (a creature with a precise
    // non-visual sense, e.g. tremorsense, would not be off-guard at all).
    // Don't shortcut it back in; let the GM apply off-guard explicitly.
  }),
  dazzled: def({ slug: "dazzled", name: "Dazzled", valued: false, affects: () => null }),
  deafened: def({ slug: "deafened", name: "Deafened", valued: false, affects: () => null }),
  fatigued: def({
    slug: "fatigued", name: "Fatigued", valued: false,
    affects: () => ({
      selectors: ["ac", "saving-throw"],
      mod: status(1, "fatigued"),
    }),
  }),
  doomed: def({ slug: "doomed", name: "Doomed", valued: true, affects: () => null }),
  dying: def({
    slug: "dying", name: "Dying", valued: true, affects: () => null,
    startOfTurn: "recovery-check",
    // "While you have this condition, you are Unconscious" (data/conditions.json).
    implies: ["unconscious"],
  }),
  wounded: def({ slug: "wounded", name: "Wounded", valued: true, affects: () => null }),
  "persistent-damage": def({
    // data/conditions.json marks this isValued: false — not an oversight.
    // Persistent damage carries dice (1d6, 2d4, ...), which an integer
    // `value` can't express. The dice live in AppliedCondition.formula
    // instead; see below.
    slug: "persistent-damage", name: "Persistent Damage", valued: false,
    affects: () => null, endOfTurn: "persistent-damage",
  }),
  unconscious: def({
    slug: "unconscious", name: "Unconscious", valued: false,
    // "-4 status penalty to AC, Perception, and Reflex saves" (data/conditions.json)
    // — not all-checks; only those three. "You can't act" and "fall Prone
    // and drop items you're holding" (on gain, and unless positioned
    // otherwise) are narrative/one-time, not ongoing selector modifiers, so
    // they aren't encoded here.
    affects: () => ({
      selectors: ["ac", "perception", "reflex"],
      mod: status(4, "unconscious"),
    }),
    // "you have the Blinded and Off-Guard conditions" is stated outright —
    // unlike Prone, which the text describes only as a one-time event on
    // gaining the condition ("you fall Prone"), not as a condition you
    // continuously have. So only Blinded and Off-Guard are implied here.
    implies: ["blinded", "off-guard"],
  }),
  paralyzed: def({
    slug: "paralyzed", name: "Paralyzed", valued: false, affects: () => null,
    // "You have the Off-Guard condition and can't act except to Recall
    // Knowledge..." — the inability to act (and to Seek) is a narrative
    // restriction this app doesn't model; Off-Guard is the only stated
    // ongoing condition.
    implies: ["off-guard"],
  }),
  petrified: def({
    // "You can't act, nor can you sense anything. You become an object with
    // ... AC 9, Hardness 8..." — AC 9 replaces the creature's AC outright
    // rather than modifying it, so it isn't a Modifier: `acOverride` below
    // carries it. Hardness 8 isn't modelled. Nothing in the text grants
    // Off-Guard or any other condition.
    slug: "petrified", name: "Petrified", valued: false, affects: () => null,
  }),
  fleeing: def({
    // "You must spend each of your actions trying to escape ... You can't
    // Delay or Ready" — entirely a restriction on which actions you can
    // take, not a modifier on any selector.
    slug: "fleeing", name: "Fleeing", valued: false, affects: () => null,
  }),
  confused: def({
    slug: "confused", name: "Confused", valued: false, affects: () => null,
    // "You are Off-Guard, you don't treat anyone as your ally..., and you
    // can't Delay, Ready, or use reactions." Off-Guard is the only stated
    // ongoing condition; the rest (forced Strikes, random targeting, the
    // recover-on-damage flat check) is narrative/GM-adjudicated.
    implies: ["off-guard"],
  }),
  invisible: def({
    // "You're Undetected to everyone" is a direct statement of what you
    // are, not a numeric effect, so it's modelled as an implication like
    // prone/off-guard. The rest of the entry (becoming Hidden to a
    // successful Seeker, needing to Sneak, etc.) is state-transition detail
    // this app's flat condition list doesn't track.
    slug: "invisible", name: "Invisible", valued: false, affects: () => null,
    implies: ["undetected"],
  }),
  concealed: def({
    // "A creature that you're concealed from must succeed at a DC 5 flat
    // check when targeting you ... If the check fails, you aren't
    // affected." That flat check is rolled by the *attacker* targeting this
    // creature — it's not a modifier on any of this creature's own
    // selectors, so there's nothing to return here.
    slug: "concealed", name: "Concealed", valued: false, affects: () => null,
  }),
  hidden: def({
    // "A creature you're hidden from is Off-Guard to you, and it must
    // succeed at a DC 11 flat check when targeting you..." — both the
    // Off-Guard and the flat check land on the *attacker*, not on this
    // creature. This app's conditions describe effects on the creature that
    // holds them, so there's no self-modifier to encode.
    slug: "hidden", name: "Hidden", valued: false, affects: () => null,
  }),
  undetected: def({
    // "That creature is Off-Guard to you" and the DC 11 secret flat check
    // both describe the *attacker's* disadvantage, not a modifier on this
    // creature's own selectors — same shape as Hidden, above.
    slug: "undetected", name: "Undetected", valued: false, affects: () => null,
  }),
  encumbered: def({
    // "You're Clumsy 1" is a real, stated value — but `implies` (see
    // expandImplied below) only ever attaches an implied condition at value
    // 0, which would silently understate this to Clumsy 0 instead of
    // Clumsy 1. So the Clumsy 1 penalty is reproduced directly here, using
    // the same selectors as the `clumsy` entry above (Dex-based: AC,
    // Reflex, ranged attacks) at magnitude 1. The "10-foot penalty to all
    // your Speeds" from the same sentence isn't modelled — this app has no
    // notion of Speed.
    slug: "encumbered", name: "Encumbered", valued: false,
    affects: () => ({ selectors: ["dex-based"], mod: status(1, "encumbered (clumsy 1)") }),
  }),
  fascinated: def({
    // "You take a -2 status penalty to Perception and skill checks" is a
    // real selector modifier. The concentrate-action restriction and the
    // "ends if a creature uses hostile actions" trigger are narrative/GM
    // calls this app doesn't automate — nothing here auto-removes a
    // condition (persistent damage's DC 15 flat check isn't automated
    // either; see applyEndOfTurn's doc comment).
    slug: "fascinated", name: "Fascinated", valued: false,
    affects: () => ({ selectors: ["perception", "skill"], mod: status(2, "fascinated") }),
  }),
  broken: def({
    // "Broken is a condition that affects only objects," not creatures —
    // and even for an object, the AC penalty depends on the armor's
    // category (-1/-2/-3 light/medium/heavy), which this app doesn't track
    // per item. Nothing generic to encode.
    slug: "broken", name: "Broken", valued: false, affects: () => null,
  }),
  controlled: def({
    // "The controller dictates how you act and can make you use any of
    // your actions" — entirely narrative (an outside party choosing your
    // actions), no selector it modifies.
    slug: "controlled", name: "Controlled", valued: false, affects: () => null,
  }),
  cursebound: def({
    // "Your specific oracular curse imposes unique negative effects
    // depending on your cursebound value" — the dataset entry is explicit
    // that the effect is per-curse and not specified generically here, so
    // there is no universal number to encode.
    slug: "cursebound", name: "Cursebound", valued: true, affects: () => null,
  }),
  observed: def({
    // The default, unremarkable visibility state ("anything in plain view
    // is observed by you") — no penalty, bonus, or implication of its own.
    slug: "observed", name: "Observed", valued: false, affects: () => null,
  }),
  unnoticed: def({
    // "When you're unnoticed, you're also Undetected" is a direct stated
    // implication, same treatment as Invisible above.
    slug: "unnoticed", name: "Unnoticed", valued: false, affects: () => null,
    implies: ["undetected"],
  }),
};

/** Everything the GM can apply from the popover: the whole dataset minus
 * the attitude ladder, which describes an NPC's disposition and changes no
 * number in a fight. In `CONDITIONS`' own declaration order — NOT sorted
 * here, deliberately. This used to be sorted once, at module load, by
 * `.name` (the English name), which is why the picker read alphabetically
 * in English regardless of the active language — sorted French text is a
 * render-time concern (it needs the language *and* the translated name,
 * neither of which this module has), so it belongs to whichever UI renders
 * this list, not to the constant itself. See RowPopover.tsx's picker row. */
export const PICKABLE_CONDITIONS: ConditionDef[] = Object.values(CONDITIONS);

export interface AppliedCondition {
  slug: ConditionSlug;
  value: number;
  /** Dice formula for persistent damage (e.g. "2d6") — see the ruling above. */
  formula?: string;
  /** Persistent damage's type ("fire", "bleed"…), so resistances and
   * weaknesses apply to it; untyped when absent. */
  damageType?: string;
  /** When it ends on its own, if it does (see rules/effects.ts's Expiry). */
  expires?: Expiry;
}

/** When a timed condition or effect ends: at the start or the end of the
 * turn of `combatantId` (whose turn it was when it was set — usually the
 * creature causing it) in `round`. PF2 counts durations in rounds from the
 * start of the turn of the creature that created the effect. */
export interface Expiry {
  round: number;
  combatantId: string;
  at: "start" | "end";
}

/**
 * `implies` is declared on prone/grabbed/restrained/dying/... but was never
 * consumed — their own condition text states off-guard (and, for
 * grabbed/restrained, immobilized) without a value ever applying it. This
 * expands the applied set with those implied conditions (synthetic, value
 * 0 — every implied condition in the curated set is unvalued) before
 * modifiers are computed, so the effect actually lands wherever conditions
 * are read.
 *
 * Transitive: this walks a growing worklist, not just the originally
 * applied conditions, so a chain like dying -> unconscious -> blinded/
 * off-guard resolves fully rather than stopping after one hop. (An earlier
 * version iterated only `applied` and silently dropped the second hop —
 * dying reported unconscious's synthetic entry but never unconscious's own
 * implied blinded/off-guard, so a dying combatant's AC came out 2 points
 * too generous. Caught by the reviewer, not by a test at the time.)
 *
 * Idempotent through the whole chain: a condition already present (explicit
 * or already implied, at any depth) is never added or queued twice, so
 * off-guard's -2 circumstance penalty doesn't stack with itself when e.g.
 * both prone and grabbed apply, or when a chain and an explicit condition
 * both reach the same implied slug.
 */
function expandImplied(applied: AppliedCondition[]): AppliedCondition[] {
  const present = new Set(applied.map((c) => c.slug));
  const expanded = [...applied];
  const queue = [...applied];
  while (queue.length > 0) {
    const c = queue.shift()!;
    for (const implied of CONDITIONS[c.slug].implies ?? []) {
      if (present.has(implied)) continue;
      present.add(implied);
      const syntheticEntry = { slug: implied, value: 0 };
      expanded.push(syntheticEntry);
      queue.push(syntheticEntry);
    }
  }
  return expanded;
}

/** Whether `slug` applies, directly or through what another condition
 * implies (invisible brings undetected, unconscious blinded…). */
export function hasCondition(applied: AppliedCondition[], slug: ConditionSlug): boolean {
  return expandImplied(applied).some((c) => c.slug === slug);
}

/**
 * The flat check an attacker must pass before a Strike or a targeted spell
 * can affect its target (Player Core, Detecting Creatures): DC 5 against a
 * concealed target — or any target, for a dazzled attacker; DC 11 against a
 * hidden or undetected one — or any, for a blinded attacker (both "if
 * vision is your only precise sense", which this assumes). The higher
 * applies. Null when none does.
 */
export function targetingFlatCheck(
  attacker: AppliedCondition[],
  target: AppliedCondition[],
): { dc: number; reason: ConditionSlug } | null {
  const reasons: { dc: number; reason: ConditionSlug }[] = [];
  if (hasCondition(target, "undetected")) reasons.push({ dc: 11, reason: "undetected" });
  if (hasCondition(target, "hidden")) reasons.push({ dc: 11, reason: "hidden" });
  if (hasCondition(attacker, "blinded")) reasons.push({ dc: 11, reason: "blinded" });
  if (hasCondition(target, "concealed")) reasons.push({ dc: 5, reason: "concealed" });
  if (hasCondition(attacker, "dazzled")) reasons.push({ dc: 5, reason: "dazzled" });
  return reasons[0] ?? null;
}

/** Whether the target is off-guard to this attacker because it can't see
 * it: "a creature you're hidden from (or undetected by) is off-guard to
 * you". */
export function attackerUnseen(attacker: AppliedCondition[]): boolean {
  return hasCondition(attacker, "hidden") || hasCondition(attacker, "undetected");
}

/**
 * The dying value at which a combatant dies, per data/conditions.json,
 * doomed: "The Dying value at which you die is reduced by your doomed
 * value. If your maximum dying value is reduced to 0, you instantly die."
 * Floored at 0 — a negative max has no meaning, and 0 is already the
 * instant-death case the doomed text describes.
 */
export function dyingMax(conditions: AppliedCondition[]): number {
  const doomed = conditions.find((c) => c.slug === "doomed");
  return Math.max(0, 4 - (doomed?.value ?? 0));
}

/**
 * Applies `amount` to a combatant's dying value, per data/conditions.json,
 * dying: "Dying always includes a value... Your dying condition increases
 * by 1 if you take damage while dying, or by 2 if you take damage from an
 * enemy's critical hit or a critical failure on your save."
 *
 * The wounded interaction — data/conditions.json, wounded: "If you gain the
 * dying condition while wounded, increase your dying condition value by
 * your wounded value" — is scoped to *gaining* dying, i.e. going from not
 * dying to dying. It deliberately does not fire here on top of an existing
 * dying value: the paragraph above already covers further increases while
 * already dying (taking more damage), and says nothing about wounded there.
 * Conflating the two would double-apply the wounded bonus on every hit
 * after the first, not just the one that starts the dying condition.
 *
 * Not clamped to dyingMax here — that reduction, and the death it can
 * trigger, is the caller's job (see store.ts's addCondition), since this
 * function has no way to also flip Combatant.defeated.
 */
export function dyingOnGain(
  conditions: AppliedCondition[],
  amount: number,
): AppliedCondition[] {
  const existingDying = conditions.find((c) => c.slug === "dying");
  const wounded = conditions.find((c) => c.slug === "wounded");
  const woundedBonus = existingDying === undefined ? (wounded?.value ?? 0) : 0;
  const newValue = (existingDying?.value ?? 0) + amount + woundedBonus;

  const withoutDying = conditions.filter((c) => c.slug !== "dying");
  return [...withoutDying, { slug: "dying", value: newValue }];
}

/**
 * Removes dying and applies its wounded fallout, per data/conditions.json,
 * dying: "Any time you lose the dying condition, you gain the Wounded 1
 * condition, or increase your wounded condition value by 1 if you already
 * have that condition." Fires on every loss of dying, not just recovery via
 * a successful check — the dataset text draws no such distinction.
 *
 * Guarded on dying actually being present: the rule only triggers on
 * losing the condition, and this is now a public rules-module function
 * other code can call directly, not just the one store.ts call site that
 * already knows dying was there — so it can't assume its caller only ever
 * invokes it on a combatant who was actually dying.
 */
export function woundedOnRecover(conditions: AppliedCondition[]): AppliedCondition[] {
  if (!conditions.some((c) => c.slug === "dying")) return conditions;
  const withoutDying = conditions.filter((c) => c.slug !== "dying");
  const existingWounded = withoutDying.find((c) => c.slug === "wounded");
  if (existingWounded) {
    return withoutDying.map((c) =>
      c.slug === "wounded" ? { ...c, value: c.value + 1 } : c,
    );
  }
  return [...withoutDying, { slug: "wounded", value: 1 }];
}

/**
 * The Unconscious half of a PC dropping to 0 Hit Points, per
 * data/conditions.json's "dying" entry: "While you have this condition, you
 * are Unconscious." Added directly here, rather than left to
 * `expandImplied`, because that expansion only runs inside
 * `conditionModifiers` at selector-modifier computation time — a reader of
 * the stored `conditions` array itself (a combatant row, a save file) would
 * never see it there otherwise. Idempotent: does nothing if already present
 * (repeated damage at 0 HP, e.g. a second hit the same round).
 *
 * The dying value itself, its doomed-reduced cap, and the resulting
 * `defeated` flag are not this function's job: they're `dyingOnGain`'s and
 * the caller's (store.ts's `applyDyingGain`, shared with `addCondition`'s
 * "dying" branch) — this only ever runs after that gain has already been
 * applied to the conditions it's handed.
 */
export function onDroppedToZero(conditions: AppliedCondition[]): AppliedCondition[] {
  if (conditions.some((c) => c.slug === "unconscious")) return conditions;
  return [...conditions, { slug: "unconscious", value: 0 }];
}

/**
 * Conditions a PC loses on being healed back above 0 Hit Points, per
 * data/conditions.json's "unconscious" entry: "If you are restored to 1 Hit
 * Point or more, you lose the dying and unconscious conditions." Reuses
 * `woundedOnRecover` for the dying-loss/wounded-gain half (see its own doc
 * comment), then drops Unconscious too.
 *
 * Guarded on dying actually being present, same as `woundedOnRecover`: this
 * models only "healed while dying", the case the task-3 brief scopes it to.
 * A combatant unconscious for an unrelated reason (asleep, knocked out by an
 * effect, never dying) is untouched — nothing here assumes every Unconscious
 * combatant is dying.
 */
export function onHealedAboveZero(conditions: AppliedCondition[]): AppliedCondition[] {
  if (!conditions.some((c) => c.slug === "dying")) return conditions;
  return woundedOnRecover(conditions).filter((c) => c.slug !== "unconscious");
}

/** The modifiers `applied` puts on a check answering to `selectors` (one,
 * or a check's list from `CHECKS` and the helpers above) — each condition
 * once, however many of them it names. */
export function conditionModifiers(
  applied: AppliedCondition[],
  selectors: Selector | readonly Selector[],
): Modifier[] {
  const wanted: readonly Selector[] = typeof selectors === "string" ? [selectors] : selectors;
  const mods: Modifier[] = [];
  for (const c of expandImplied(applied)) {
    const effect = CONDITIONS[c.slug].affects(c.value);
    if (effect === null) continue;
    if (!effect.selectors.some((x) => wanted.includes(x))) continue;
    mods.push(effect.mod);
  }
  return mods.sort((a, b) => compareStrings(a.source, b.source));
}

/**
 * Fires every condition's `endOfTurn` hook once, for the combatant whose
 * turn just ended. `startOfTurn`/`endOfTurn` have been declared on
 * ConditionDef since before this function existed, but nothing ever read
 * them — frightened never ticked down on its own, and persistent damage
 * never rolled. This is their only reader. It is reached from two places in
 * store.ts, both through `settleEndOfTurn`: `nextTurn`, when a turn ends,
 * and `delay`, which fires it immediately (RAW: on Delay those effects
 * "occur immediately when you use the Delay action"). That shared gate is
 * what keeps a delayed turn from resolving them twice.
 *
 * "decrement" lowers the value by 1 and drops the condition once it would
 * reach 0 — matches the existing GM-facing "Frightened decreases" prompt
 * text in prompts.ts. "persistent-damage" rolls `c.formula` and adds it to
 * the running total; the condition itself is NOT removed here, since ending
 * persistent damage takes its own DC 15 flat check (see prompts.ts) that
 * this hook doesn't model. Every other condition passes through unchanged.
 *
 * `rng` is injectable (defaults to Math.random via rollFormula) so callers —
 * and tests — can get a deterministic persistentDamage instead of only
 * knowing it was ">= 0".
 */
export function applyEndOfTurn(
  applied: AppliedCondition[],
  rng?: Rng,
): { conditions: AppliedCondition[]; persistentDamage: number } {
  const conditions: AppliedCondition[] = [];
  let persistentDamage = 0;

  for (const c of applied) {
    const hook = CONDITIONS[c.slug].endOfTurn;

    if (hook === "decrement") {
      const next = c.value - 1;
      if (next > 0) conditions.push({ ...c, value: next });
      continue; // next <= 0: condition ends, dropped from the result
    }

    if (hook === "persistent-damage") {
      const rolled = rollFormula(c.formula, rng);
      if (rolled === null) {
        // A formula that's missing or doesn't parse as NdM(+/-K) can't just
        // deal 0 damage silently — that would look identical to "rolled a
        // 0", which persistent damage dice can never actually produce. It
        // also can't throw and crash the turn over what's fundamentally bad
        // input data (a condition added without a formula, or a typo). So:
        // trace it loudly (console.warn — there's no GM-facing error
        // channel this deep in the rules layer) and contribute nothing.
        console.warn(
          `applyEndOfTurn: persistent-damage condition has an unrollable formula: ${JSON.stringify(c.formula)}`,
        );
      } else {
        persistentDamage += rolled;
      }
      conditions.push(c);
      continue;
    }

    conditions.push(c);
  }

  return { conditions, persistentDamage };
}

/** An AC a condition sets outright, replacing the creature's and every
 * modifier on it: petrified's "AC 9" — an object's, which no penalty to a
 * creature reaches. Null when none applies. */
export const PETRIFIED_AC = 9;

export function acOverride(applied: AppliedCondition[]): number | null {
  return expandImplied(applied).some((c) => c.slug === "petrified") ? PETRIFIED_AC : null;
}

/**
 * Whether a combatant can use a reaction at all, whatever it has left.
 * Confused says it outright ("you can't Delay, Ready, or use reactions");
 * Unconscious, Paralyzed and Petrified can't act, and a reaction is an
 * action. Implied conditions count too (dying -> unconscious).
 */
export function canReact(applied: AppliedCondition[]): boolean {
  const blocking: ConditionSlug[] = ["confused", "unconscious", "paralyzed", "petrified"];
  return !expandImplied(applied).some((c) => blocking.includes(c.slug));
}

/** Whether a combatant may Delay or Ready: Confused and Fleeing both say
 * "you can't Delay or Ready". */
export function canDelayOrReady(applied: AppliedCondition[]): boolean {
  return !applied.some((c) => c.slug === "confused" || c.slug === "fleeing");
}

/** Stupefied: "Any time you attempt to Cast a Spell while stupefied, the
 * spell is disrupted unless you succeed at a flat check with a DC equal to
 * 5 + your stupefied value." Null when not stupefied. */
export function stupefiedCastDc(applied: AppliedCondition[]): number | null {
  const stupefied = applied.find((c) => c.slug === "stupefied");
  return stupefied ? 5 + stupefied.value : null;
}
