import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Action, Attack } from "@pf2/schema";
import type { ConditionSlug } from "../rules/conditions.js";
import { applyIwr, type Iwr } from "../rules/damage.js";
import type { Combatant, Encounter, Entry, Player } from "./types.js";

export type Lang = "en" | "fr";

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
  /** Populated from the creature record when added from the dataset. */
  iwr?: Iwr | null;
  /** Populated from the creature record when added from the dataset. */
  reactions?: { name: string; trigger: string }[];
  /** Populated from the creature record when added from the dataset. */
  attacks?: Attack[];
  /** Populated from the creature record when added from the dataset. */
  actions?: Action[];
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

/** Ids are always `c<n>`/`e<n>` from the counters above — parses the number
 * back out, or null for anything else (defensive; every id the store itself
 * ever produces matches). */
function seqOf(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const n = Number(id.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

/**
 * `combatantSeq`/`entrySeq` are module-level counters, so a page reload
 * starts them back at 0 while IndexedDB still holds combatants/entries
 * numbered far higher — the very next add would then mint an id that
 * collides with one already on screen. Called once, right after a
 * persisted encounter is loaded (see main.tsx), to fast-forward both
 * counters past the highest id already in use.
 */
export function restoreCombatantSequences(encounter: Encounter): void {
  for (const id of Object.keys(encounter.combatants)) {
    const n = seqOf(id, "c");
    if (n !== null && n > combatantSeq) combatantSeq = n;
  }
  for (const entry of encounter.entries) {
    const n = seqOf(entry.id, "e");
    if (n !== null && n > entrySeq) entrySeq = n;
  }
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
    iwr: seed.iwr ?? null,
    reactions: seed.reactions ?? [],
    attacks: seed.attacks ?? [],
    actions: seed.actions ?? [],
    conditions: [],
    strikesMade: 0,
    actionsSpent: 0,
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
  lang: Lang;
  setLang(lang: Lang): void;
  addCombatant(seed: CombatantSeed, initiative: number, trueInitiative?: number): string;
  addMany(
    seed: CombatantSeed,
    quantity: number,
    initiative: number,
    trueInitiative?: number,
  ): string[];
  removeCombatant(id: string): void;
  setInitiative(entryId: string, initiative: number): void;
  applyDamage(id: string, amount: number, damageType?: string): void;
  applyHealing(id: string, amount: number): void;
  addCondition(id: string, slug: ConditionSlug, value: number, formula?: string): void;
  removeCondition(id: string, slug: ConditionSlug): void;
  recordStrike(id: string): void;
  resetStrikes(id: string): void;
  spendActions(id: string, cost: number): void;
  setReactionSpent(id: string, spent: boolean): void;
  setTarget(id: string | null): void;
  nextTurn(): void;
  acknowledgePrompt(promptId: string): void;
  group(ids: string[], name: string, initiative: number): void;
  setPlayers(players: Player[]): void;
  /** Removes every `kind: "creature"` combatant; the fight keeps running
   * (round, turn order, PCs untouched). */
  clearEnemies(): void;
  /** Empties the player roster and removes any `kind: "pc"` combatant
   * already in the encounter — a cleared roster and a lingering PC in the
   * turn order would disagree about who's playing. */
  clearPlayers(): void;
  /** Clears all combatants, resets the round to 1, empties the turn order,
   * drops the target and any acknowledged prompts — but leaves the player
   * roster alone, unlike `reset()`. */
  resetEncounter(): void;
  reset(): void;
}

export const useEncounter = create<EncounterStore>()(
  immer((set, get) => ({
    encounter: emptyEncounter(),
    players: [],
    lang: "en",

    setLang: (lang) =>
      set((state) => {
        state.lang = lang;
      }),

    addCombatant: (seed, initiative, trueInitiative) => {
      const id = nextCombatantId();
      set((state) => {
        const enc = state.encounter;
        // Same fix as group(): capture the active entry's id before
        // re-sorting and recompute its position afterward, so inserting a
        // higher-initiative combatant can't silently shift the turn onto
        // whoever now lands on the old numeric position.
        const activeEntryId = enc.entries[enc.activeEntryIndex]?.id ?? null;
        enc.combatants[id] = makeCombatant(id, seed);
        enc.entries.push({
          id: nextEntryId(),
          initiative,
          combatantIds: [id],
          groupName: null,
          trueInitiative: trueInitiative ?? null,
        });
        sortEntries(enc.entries);
        if (activeEntryId !== null) {
          const newIndex = enc.entries.findIndex((e) => e.id === activeEntryId);
          enc.activeEntryIndex = newIndex >= 0 ? newIndex : 0;
        }
      });
      return id;
    },

    addMany: (seed, quantity, initiative, trueInitiative) => {
      const ids: string[] = [];
      set((state) => {
        const enc = state.encounter;
        const activeEntryId = enc.entries[enc.activeEntryIndex]?.id ?? null;
        for (let i = 1; i <= quantity; i++) {
          const id = nextCombatantId();
          ids.push(id);
          enc.combatants[id] = makeCombatant(id, { ...seed, label: String(i) });
          enc.entries.push({
            id: nextEntryId(),
            initiative,
            combatantIds: [id],
            groupName: null,
            trueInitiative: trueInitiative ?? null,
          });
        }
        sortEntries(enc.entries);
        if (activeEntryId !== null) {
          const newIndex = enc.entries.findIndex((e) => e.id === activeEntryId);
          enc.activeEntryIndex = newIndex >= 0 ? newIndex : 0;
        }
      });
      return ids;
    },

    removeCombatant: (id) =>
      set((state) => {
        const enc = state.encounter;
        if (!(id in enc.combatants)) return;

        const oldActiveIndex = enc.activeEntryIndex;
        const activeEntry = enc.entries[oldActiveIndex];
        const activeEntryDissolves =
          activeEntry !== undefined &&
          activeEntry.combatantIds.length === 1 &&
          activeEntry.combatantIds[0] === id;

        // Identity, not position, is what survives a removal — same
        // convention as addCombatant/group. If the active entry merely
        // shrinks (a non-active combatant removed, or one member of a
        // multi-member active entry), pin its own id. If the active entry
        // itself dissolves, pin whichever entry is *next* in turn order —
        // the same target nextTurn would advance to — wrapping to the
        // front (and counting that as a new round) if it was last.
        let pinnedEntryId: string | null;
        let wrapsRound = false;
        if (activeEntryDissolves) {
          let nextIndex = oldActiveIndex + 1;
          if (nextIndex >= enc.entries.length) {
            nextIndex = 0;
            wrapsRound = true;
          }
          // The dissolving entry can't be its own "next" (it has no other
          // combatants to survive the filter below), so this is always a
          // different, surviving entry — or null if it was the only entry.
          pinnedEntryId = enc.entries[nextIndex]?.id ?? null;
        } else {
          pinnedEntryId = activeEntry?.id ?? null;
        }

        delete enc.combatants[id];
        if (enc.targetId === id) enc.targetId = null;

        const remaining: Entry[] = [];
        for (const entry of enc.entries) {
          const keep = entry.combatantIds.filter((cid) => cid !== id);
          if (keep.length > 0) {
            entry.combatantIds = keep;
            remaining.push(entry);
          }
        }
        enc.entries = remaining;

        if (enc.entries.length === 0) {
          enc.activeEntryIndex = 0;
          return;
        }

        if (wrapsRound) enc.round += 1;

        const idx = pinnedEntryId === null ? -1 : enc.entries.findIndex((e) => e.id === pinnedEntryId);
        enc.activeEntryIndex = idx >= 0 ? idx : 0;
      }),

    setInitiative: (entryId, initiative) =>
      set((state) => {
        const enc = state.encounter;
        const entry = enc.entries.find((e) => e.id === entryId);
        if (!entry) return;
        const activeEntryId = enc.entries[enc.activeEntryIndex]?.id ?? null;
        entry.initiative = initiative;
        // An explicit GM edit is authoritative — it overrides any pending
        // "acts this round instead" restoration.
        entry.trueInitiative = null;
        sortEntries(enc.entries);
        if (activeEntryId !== null) {
          const idx = enc.entries.findIndex((e) => e.id === activeEntryId);
          enc.activeEntryIndex = idx >= 0 ? idx : 0;
        }
      }),

    applyDamage: (id, amount, damageType) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c || c.hp === null) return;
        const applied = applyIwr(amount, damageType ?? "none", c.iwr);
        c.hp.current = Math.max(0, c.hp.current - applied);
        if (c.hp.current === 0) c.defeated = true;
      }),

    applyHealing: (id, amount) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c || c.hp === null) return;
        c.hp.current = Math.min(c.hp.max, c.hp.current + amount);
        c.defeated = false;
      }),

    addCondition: (id, slug, value, formula) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c) return;
        const existing = c.conditions.find((cond) => cond.slug === slug);
        if (existing) {
          existing.value = value;
          existing.formula = formula;
        } else {
          c.conditions.push({ slug, value, formula });
        }
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

    spendActions: (id, cost) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (c) c.actionsSpent += cost;
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

          // The round just wrapped — restore the true typed initiative for
          // any entry that was only acting this round early (see
          // Entry.trueInitiative), then re-sort. Index 0 of the freshly
          // sorted order is exactly who should lead the new round, so
          // there's no identity to preserve here (unlike addCombatant/
          // group, which insert mid-round and must not steal the turn from
          // whoever the GM is already resolving).
          if (enc.entries.some((e) => e.trueInitiative !== null)) {
            for (const e of enc.entries) {
              if (e.trueInitiative !== null) {
                e.initiative = e.trueInitiative;
                e.trueInitiative = null;
              }
            }
            sortEntries(enc.entries);
          }
        }
        enc.activeEntryIndex = nextIndex;

        const active = enc.entries[nextIndex];
        if (!active) return;
        for (const cid of active.combatantIds) {
          const c = enc.combatants[cid];
          if (c) {
            c.strikesMade = 0;
            c.actionsSpent = 0;
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
        remaining.push({
          id: groupEntryId,
          initiative,
          combatantIds: [...ids],
          groupName: name,
          trueInitiative: null,
        });
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

    // Both reuse `removeCombatant` one id at a time rather than a fresh
    // batch implementation — that's the function that already carries the
    // identity-preserving active-entry logic (see its own comment), and
    // this app has shipped three separate bugs from a positional clamp
    // reinventing that. Calling it in a loop composes correctly: each call
    // resolves the active pointer from the *current* state, so it's exactly
    // as if the GM removed the same combatants one at a time by hand.
    clearEnemies: () => {
      const ids = Object.values(get().encounter.combatants)
        .filter((c) => c.kind === "creature")
        .map((c) => c.id);
      for (const id of ids) get().removeCombatant(id);
    },

    clearPlayers: () => {
      const ids = Object.values(get().encounter.combatants)
        .filter((c) => c.kind === "pc")
        .map((c) => c.id);
      for (const id of ids) get().removeCombatant(id);
      set((state) => {
        state.players = [];
      });
    },

    resetEncounter: () =>
      set((state) => {
        state.encounter = emptyEncounter();
      }),

    reset: () => {
      combatantSeq = 0;
      entrySeq = 0;
      set((state) => {
        state.encounter = emptyEncounter();
        state.players = [];
        state.lang = "en";
      });
    },
  })),
);
