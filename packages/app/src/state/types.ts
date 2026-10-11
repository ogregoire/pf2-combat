import type { Action, Attack, CreatureI18n, Spellcasting } from "@pf2/schema";
import type { AppliedCondition } from "../rules/conditions.js";
import type { Iwr } from "../rules/damage.js";
import type { Adjustment } from "../rules/adjustment.js";

export interface Player {
  id: string;
  name: string;
  level: number;
  ac: number;
  saves: { fortitude: number; reflex: number; will: number };
  hp?: number;
  present: boolean;
  /** What gets added to the die when rolling initiative for this PC. Lives
   * on the roster rather than the combatant so it survives between fights.
   * Null when unknown. */
  initiativeModifier: number | null;
}

export interface Combatant {
  id: string;
  kind: "pc" | "creature";
  name: string;
  creatureId?: string;
  label?: string;
  hp: { current: number; max: number } | null;
  ac: number | null;
  saves: { fortitude: number; reflex: number; will: number } | null;
  level: number;
  iwr: Iwr | null;
  reactions: { name: string; trigger: string }[];
  attacks: Attack[];
  actions: Action[];
  /** Denormalised from the creature record, like `attacks`. Optional: a
   * combatant persisted before spells were carried has none. */
  spellcasting?: Spellcasting[];
  /** Casts spent so far, by pool (rules/spells.ts's `CastLimit.key`): a
   * spontaneous rank's slots, a prepared copy, an innate spell's daily
   * uses, the shared Focus Point pool. Absent until the first cast. */
  spellUses?: Record<string, number>;
  /** What the combatant is concentrating on: the spells and abilities it
   * Sustains. Absent until the first one. */
  sustaining?: SustainedEffect[];
  /**
   * The French overlay for this creature, IF a caller already seeded one
   * directly into the store — used by tests, never by production code:
   * QuickAdd no longer fetches an overlay at add time at all
   * (that used to depend on `lang` being "fr" at the moment of adding,
   * which meant a combatant added in English could never become French
   * later). `null` for every PC, and for essentially every creature added
   * through the real UI. Render-time consumers don't read this field
   * directly — they call `useCombatantI18n`
   * (packages/app/src/hooks/useCombatantI18n.ts), which uses this field
   * when it's already populated and otherwise resolves the overlay from
   * `creatureId` on demand (cached, component-local — never written back
   * here) whenever `lang` is "fr".
   */
  i18n: CreatureI18n | null;
  conditions: AppliedCondition[];
  strikesMade: number;
  /** Actions spent so far this turn, out of the pool `actionPool()` computes
   * from conditions. Reset to 0 at the start of the combatant's turn. */
  actionsSpent: number;
  reactionSpent: boolean;
  defeated: boolean;
  /** What gets added to the die when rolling initiative. Creatures use
   * Perception; a PC's lives on the roster (`Player.initiativeModifier`)
   * so it survives between fights, and for a PC this field is only a
   * snapshot of it, copied in when the combatant was added. The roster is
   * authoritative wherever it can be resolved through `playerId` — see
   * RowPopover — so this answers for a creature, and for a PC with no
   * roster entry left to read. Null when unknown. */
  initiativeModifier: number | null;
  /** Set on `kind: "pc"` combatants: which roster player this is. Lets a
   * modifier entered mid-fight be written back, and lets Quick add know who
   * is already in the order. */
  playerId?: string;
  /** Set while a creature is elite or weak (GM Core). Its stats above
   * already carry the adjustment; this records which one, and the printed
   * level to take it back off from. Absent for a normal creature. */
  adjustment?: Adjustment;
}

export interface Entry {
  id: string;
  /** `null` before the GM has typed a roll — sorts above every rolled
   * entry (see `sortEntries`) and renders as an em dash rather than a 0,
   * which would read as a real (terrible) roll instead of "not rolled". */
  initiative: number | null;
  combatantIds: string[];
  groupName: string | null;
  /**
   * Set only while a combatant added mid-round is acting this round instead
   * of waiting for the next one ("act this round instead" in QuickAdd):
   * `initiative` is temporarily lowered so turn order reaches them today,
   * and the GM's real typed value is parked here rather than overwritten.
   * Restored into `initiative` (and cleared) the next time the round wraps.
   */
  trueInitiative: number | null;
  /** Sort key for the turn order, distinct from the displayed initiative.
   * Starts equal to `initiative` and is reset to it whenever an initiative
   * is set. Delay's return and a manual drag both assign a value *between*
   * two neighbours, which equal integer initiatives plus a stable sort
   * cannot express. */
  orderKey: number;
  /**
   * True between using Delay and either returning to the order or losing
   * the delayed turn (Player Core p. 416). The entry stays in `entries` at
   * its original `orderKey` throughout — nothing about its position moves
   * until it returns — so this flag is what marks it as holding no place in
   * the order: it can't use reactions, and reaching its own slot again means
   * a full round has elapsed and the delayed turn is forfeit.
   */
  delayed: boolean;
  /**
   * The initiative this entry held before a Delay *return* rewrote it, kept
   * purely as a record for the row to show struck through. Null unless a
   * return has actually changed the number — in particular it stays null
   * while an entry is merely delayed (nothing has been rewritten yet) and
   * when a delayed turn expires unused (RAW: "your initiative doesn't
   * change"). Returning is permanent; this is never restored into
   * `initiative`, unlike `trueInitiative` above.
   */
  initiativeBeforeDelay: number | null;
  /**
   * The round in which this entry's end-of-turn effects were last resolved,
   * or null if they never have been. A combatant gets one such resolution
   * per round, so this answers the only question anyone asks: has this
   * entry's turn already been resolved *in the round we are in now*?
   *
   * It exists because Delay resolves a turn early — RAW, those effects
   * "occur immediately when you use the Delay action" — and the turn the
   * delayer takes when it returns is that same turn arriving late. Without
   * a record, its end resolves them a second time in one round.
   *
   * Deliberately a round number rather than a boolean, which was the shape
   * this carried through three separate bugs. A boolean has to be cleared
   * to stay correct — when the turn ends, when a Delay lapses, when a GM
   * placement moves the entry past the turn pointer — and every clear
   * discards the fact that the next question needs. A GM who types a
   * position above the active entry and then corrects it to below cannot
   * have the suppression restored, because nothing remembers there was
   * anything to restore. A round stamp is never cleared at all: whether the
   * entry moves, moves back, lapses, or returns, the comparison against
   * `Encounter.round` still gives the right answer.
   */
  endOfTurnResolvedRound: number | null;
}

/**
 * A spell or ability its user keeps going by Sustaining it (Player Core,
 * Sustain: 1 action, concentrate — the effect lasts until the end of the
 * user's next turn). Cast or Sustained this turn, it lasts through the end
 * of the next one; a turn that ends without Sustaining it ends it.
 */
export interface SustainedEffect {
  /** `${kind}:${name}` — one entry per spell or ability. */
  id: string;
  kind: "spell" | "action";
  /** The English name, as the creature record has it. */
  name: string;
  /** A spell: its details file, and its row in the French overlay's
   * flattened spell list. */
  slug?: string;
  flatIndex?: number;
  /** An ability: its position in `Combatant.actions`. */
  actionIndex?: number;
  /** Cast or Sustained during the user's current turn. */
  sustainedThisTurn: boolean;
}

/** Something a condition did as a turn ended — what the end-of-turn
 * dialog lists, one line each. */
export type EndOfTurnEvent =
  | { kind: "decreased"; combatantId: string; name: string; slug: AppliedCondition["slug"]; from: number; to: number }
  | {
      kind: "persistent-damage";
      combatantId: string;
      name: string;
      formula: string;
      rolled: number;
      /** Hit Points either side of the damage; null for a combatant whose
       * HP the app doesn't track (a PC). */
      hp: { before: number; after: number } | null;
      /** Dropped to 0 by it: dying for a PC, dead otherwise. */
      down: boolean;
    }
  /** A Sustained effect its user didn't Sustain this turn: it ends. */
  | { kind: "sustain-ended"; combatantId: string; name: string; effect: SustainedEffect };

export interface Encounter {
  name: string;
  round: number;
  activeEntryIndex: number;
  entries: Entry[];
  combatants: Record<string, Combatant>;
  targetId: string | null;
  acknowledgedPrompts: string[];
}
