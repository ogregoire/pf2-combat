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
  conditions: AppliedCondition[];
  strikesMade: number;
  reactionSpent: boolean;
  defeated: boolean;
}

export interface Entry {
  id: string;
  initiative: number;
  combatantIds: string[];
  groupName: string | null;
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
