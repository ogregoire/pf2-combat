import type { Action, Attack } from "@pf2/schema";
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
  /** `null` before the GM has typed a roll — sorts above every rolled
   * entry (see `sortEntries`) and renders as an em dash rather than a 0,
   * which would read as a real (terrible) roll instead of "not rolled". */
  initiative: number | null;
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
  /** Sort key for the turn order, distinct from the displayed initiative.
   * Starts equal to `initiative` and is reset to it whenever an initiative
   * is set. Delay's return and a manual drag both assign a value *between*
   * two neighbours, which equal integer initiatives plus a stable sort
   * cannot express. */
  orderKey: number;
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
