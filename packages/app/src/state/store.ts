import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ConditionSlug } from "../rules/conditions.js";
import type { Combatant, Encounter, Entry, Player } from "./types.js";

/** Fields a caller supplies to create a combatant; the rest is derived. */
export interface CombatantSeed {
  kind: "pc" | "creature";
  name: string;
  creatureId?: string;
  label?: string;
  hp: { current: number; max: number } | null;
  ac: number | null;
  saves: { fortitude: number; reflex: number; will: number } | null;
  level: number;
}

let combatantSeq = 0;
let entrySeq = 0;

function nextCombatantId(): string {
  combatantSeq += 1;
  return `c${combatantSeq}`;
}

function nextEntryId(): string {
  entrySeq += 1;
  return `e${entrySeq}`;
}

function emptyEncounter(): Encounter {
  return {
    name: "",
    round: 1,
    activeEntryIndex: 0,
    entries: [],
    combatants: {},
    targetId: null,
    acknowledgedPrompts: [],
  };
}

function makeCombatant(id: string, seed: CombatantSeed): Combatant {
  return {
    id,
    kind: seed.kind,
    name: seed.name,
    creatureId: seed.creatureId,
    label: seed.label,
    hp: seed.hp,
    ac: seed.ac,
    saves: seed.saves,
    level: seed.level,
    conditions: [],
    strikesMade: 0,
    reactionSpent: false,
    defeated: false,
  };
}

/** Entries stay sorted by initiative descending; Array#sort is stable, and
 * new entries are always appended before sorting, so ties preserve
 * insertion order. */
function sortEntries(entries: Entry[]): void {
  entries.sort((a, b) => b.initiative - a.initiative);
}

interface EncounterStore {
  encounter: Encounter;
  players: Player[];
  addCombatant(seed: CombatantSeed, initiative: number): string;
  addMany(seed: CombatantSeed, quantity: number, initiative: number): string[];
  applyDamage(id: string, amount: number): void;
  applyHealing(id: string, amount: number): void;
  addCondition(id: string, slug: ConditionSlug, value: number): void;
  removeCondition(id: string, slug: ConditionSlug): void;
  recordStrike(id: string): void;
  resetStrikes(id: string): void;
  setReactionSpent(id: string, spent: boolean): void;
  setTarget(id: string | null): void;
  nextTurn(): void;
  acknowledgePrompt(promptId: string): void;
  group(ids: string[], name: string, initiative: number): void;
  setPlayers(players: Player[]): void;
  reset(): void;
}

export const useEncounter = create<EncounterStore>()(
  immer((set) => ({
    encounter: emptyEncounter(),
    players: [],

    addCombatant: (seed, initiative) => {
      const id = nextCombatantId();
      set((state) => {
        state.encounter.combatants[id] = makeCombatant(id, seed);
        state.encounter.entries.push({
          id: nextEntryId(),
          initiative,
          combatantIds: [id],
          groupName: null,
        });
        sortEntries(state.encounter.entries);
      });
      return id;
    },

    addMany: (seed, quantity, initiative) => {
      const ids: string[] = [];
      set((state) => {
        for (let i = 1; i <= quantity; i++) {
          const id = nextCombatantId();
          ids.push(id);
          state.encounter.combatants[id] = makeCombatant(id, { ...seed, label: String(i) });
          state.encounter.entries.push({
            id: nextEntryId(),
            initiative,
            combatantIds: [id],
            groupName: null,
          });
        }
        sortEntries(state.encounter.entries);
      });
      return ids;
    },

    applyDamage: (id, amount) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c || c.hp === null) return;
        c.hp.current = Math.max(0, c.hp.current - amount);
        if (c.hp.current === 0) c.defeated = true;
      }),

    applyHealing: (id, amount) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c || c.hp === null) return;
        c.hp.current = Math.min(c.hp.max, c.hp.current + amount);
        c.defeated = false;
      }),

    addCondition: (id, slug, value) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c) return;
        const existing = c.conditions.find((cond) => cond.slug === slug);
        if (existing) existing.value = value;
        else c.conditions.push({ slug, value });
      }),

    removeCondition: (id, slug) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c) return;
        c.conditions = c.conditions.filter((cond) => cond.slug !== slug);
      }),

    recordStrike: (id) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (c) c.strikesMade += 1;
      }),

    resetStrikes: (id) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (c) c.strikesMade = 0;
      }),

    setReactionSpent: (id, spent) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (c) c.reactionSpent = spent;
      }),

    setTarget: (id) =>
      set((state) => {
        state.encounter.targetId = id;
      }),

    nextTurn: () =>
      set((state) => {
        const enc = state.encounter;
        if (enc.entries.length === 0) return;

        let nextIndex = enc.activeEntryIndex + 1;
        if (nextIndex >= enc.entries.length) {
          nextIndex = 0;
          enc.round += 1;
        }
        enc.activeEntryIndex = nextIndex;

        const active = enc.entries[nextIndex];
        if (!active) return;
        for (const cid of active.combatantIds) {
          const c = enc.combatants[cid];
          if (c) {
            c.strikesMade = 0;
            c.reactionSpent = false;
          }
        }
        enc.acknowledgedPrompts = enc.acknowledgedPrompts.filter(
          (pid) => !active.combatantIds.some((cid) => pid.startsWith(`${cid}:`)),
        );
      }),

    acknowledgePrompt: (promptId) =>
      set((state) => {
        if (!state.encounter.acknowledgedPrompts.includes(promptId)) {
          state.encounter.acknowledgedPrompts.push(promptId);
        }
      }),

    group: (ids, name, initiative) =>
      set((state) => {
        const enc = state.encounter;
        const idSet = new Set(ids);
        const activeEntry = enc.entries[enc.activeEntryIndex];
        // If every combatant in the active entry is joining the group, that
        // entry is dissolved entirely and the new group entry inherits the
        // active turn. Otherwise the active entry survives (possibly with
        // fewer combatantIds) and keeps the turn — resolved below by id,
        // never by position, since grouping can reorder the entries array.
        const activeFullyAbsorbed =
          activeEntry !== undefined && activeEntry.combatantIds.every((cid) => idSet.has(cid));
        const activeEntryId = activeEntry?.id ?? null;

        const groupEntryId = nextEntryId();
        const remaining: Entry[] = [];
        for (const entry of enc.entries) {
          const keep = entry.combatantIds.filter((cid) => !idSet.has(cid));
          if (keep.length === 0) continue;
          entry.combatantIds = keep;
          remaining.push(entry);
        }
        remaining.push({ id: groupEntryId, initiative, combatantIds: [...ids], groupName: name });
        sortEntries(remaining);
        enc.entries = remaining;

        const targetId = activeFullyAbsorbed ? groupEntryId : activeEntryId;
        const newIndex = targetId === null ? -1 : enc.entries.findIndex((e) => e.id === targetId);
        enc.activeEntryIndex = newIndex >= 0 ? newIndex : 0;
      }),

    setPlayers: (players) =>
      set((state) => {
        state.players = players;
      }),

    reset: () => {
      combatantSeq = 0;
      entrySeq = 0;
      set((state) => {
        state.encounter = emptyEncounter();
        state.players = [];
      });
    },
  })),
);
