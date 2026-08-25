import type { Action, Attack, CreatureI18n } from "@pf2/schema";
import type { AppliedCondition } from "../rules/conditions.js";
import type { Iwr } from "../rules/damage.js";

export interface Player {
  id: string;
  name: string;
  level: number;
  ac: number;
  saves: { fortitude: number; reflex: number; will: number };
  hp?: number;
  present: boolean;
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
  /**
   * The French overlay for this creature, fetched alongside the creature
   * record when it was added (see AddCombatants/QuickAdd) and only when
   * `lang` was "fr" at that moment. `null` for every PC, and for a
   * creature added while `lang` was "en" or with no overlay file at all —
   * both render in English, but only the latter is a genuine translation
   * gap; the fallback marker (StatBlockHeader) doesn't distinguish them,
   * since either way the tracker is showing English while French is on.
   */
  i18n: CreatureI18n | null;
  conditions: AppliedCondition[];
  strikesMade: number;
  /** Actions spent so far this turn, out of the pool `actionPool()` computes
   * from conditions. Reset to 0 at the start of the combatant's turn. */
  actionsSpent: number;
  reactionSpent: boolean;
  defeated: boolean;
}

export interface Entry {
  id: string;
  initiative: number;
  combatantIds: string[];
  groupName: string | null;
  /**
   * Set only while a combatant added mid-round is acting this round instead
   * of waiting for the next one ("act this round instead" in AddCombatants):
   * `initiative` is temporarily lowered so turn order reaches them today,
   * and the GM's real typed value is parked here rather than overwritten.
   * Restored into `initiative` (and cleared) the next time the round wraps.
   */
  trueInitiative: number | null;
}

export interface Encounter {
  name: string;
  round: number;
  activeEntryIndex: number;
  entries: Entry[];
  combatants: Record<string, Combatant>;
  targetId: string | null;
  acknowledgedPrompts: string[];
}
