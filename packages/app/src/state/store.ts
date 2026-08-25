import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Action, Attack } from "@pf2/schema";
import { applyEndOfTurn, type ConditionSlug } from "../rules/conditions.js";
import { applyIwr, type Iwr } from "../rules/damage.js";
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
  /** Populated from the creature record when added from the dataset. */
  iwr?: Iwr | null;
  /** Populated from the creature record when added from the dataset. */
  reactions?: { name: string; trigger: string }[];
  /** Populated from the creature record when added from the dataset. */
  attacks?: Attack[];
  /** Populated from the creature record when added from the dataset. */
  actions?: Action[];
  /** Populated from the creature record's `perception` when added from the
   * dataset, or carried over from `Player.initiativeModifier` for a PC. */
  initiativeModifier?: number | null;
  /** Set for a `kind: "pc"` seed: which roster player this combatant is. */
  playerId?: string;
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
    initiativeModifier: seed.initiativeModifier ?? null,
    playerId: seed.playerId,
  };
}

/** `orderKey` is defaulted from `initiative` for any entry persisted before
 * the field existed — SCHEMA_VERSION deliberately did not move. */
function keyOf(e: Entry): number {
  return e.orderKey ?? e.initiative ?? 0;
}

/** How many entries still have no rolled initiative. A fight where someone
 * never rolled is a mistake to surface, not to route around, so `nextTurn`
 * refuses rather than skipping them. */
export function unrolledCount(enc: Encounter): number {
  return enc.entries.filter((e) => e.initiative === null).length;
}

/** The IWR-filtering, floor-at-0, mark-defeated computation `applyDamage`
 * does — pulled out so `nextTurn` can apply persistent damage through the
 * exact same path instead of re-implementing it, per the brief. Takes the
 * combatant directly (rather than an id + store lookup) so it works equally
 * from inside `applyDamage`'s own `set` and from inside `nextTurn`'s. */
function dealDamage(c: Combatant, amount: number, damageType?: string): void {
  if (c.hp === null) return;
  const applied = applyIwr(amount, damageType ?? "none", c.iwr);
  c.hp.current = Math.max(0, c.hp.current - applied);
  if (c.hp.current === 0) c.defeated = true;
}

/**
 * Fires the end-of-turn condition hooks for every combatant in `entry` and
 * lands any persistent damage. Pulled out of `nextTurn` because Delay is the
 * second caller: RAW, "any persistent damage or other negative effects that
 * normally occur at the start or end of your turn occur immediately when you
 * use the Delay action" — which is precisely what stops Delay being a free
 * way to skip a turn of persistent damage. Sharing the function (rather than
 * having `delay` call `nextTurn`) is also what keeps the hooks firing
 * *once*: `delay` runs this itself and then advances with `advanceTurn`,
 * which never runs it.
 */
function endTurnEffects(enc: Encounter, entry: Entry): void {
  for (const cid of entry.combatantIds) {
    const c = enc.combatants[cid];
    if (!c) continue;
    const { conditions, persistentDamage } = applyEndOfTurn(c.conditions);
    c.conditions = conditions;
    // Persistent damage carries no damage type (see AppliedCondition.formula's
    // own comment), so it goes through dealDamage exactly as an untyped
    // ("none") hit would — IWR is deliberately not applied, same as
    // applyDamage's own default.
    if (persistentDamage > 0) dealDamage(c, persistentDamage);
  }
}

/**
 * Moves the turn pointer to the next entry, wrapping the round, and resets
 * the incoming combatants' per-turn counters. Deliberately does *not* fire
 * end-of-turn hooks: both callers (`nextTurn` and `delay`) have already
 * settled the outgoing turn their own way before calling this.
 */
function advanceTurn(enc: Encounter): void {
  let nextIndex = enc.activeEntryIndex + 1;
  if (nextIndex >= enc.entries.length) {
    nextIndex = 0;
    enc.round += 1;

    // The round just wrapped — restore the true typed initiative for any
    // entry that was only acting this round early (see
    // Entry.trueInitiative), then re-sort. Index 0 of the freshly sorted
    // order is exactly who should lead the new round, so there's no identity
    // to preserve here (unlike addCombatant/group, which insert mid-round
    // and must not steal the turn from whoever the GM is already resolving).
    // Delayed entries are deliberately skipped. A delayed entry holds no
    // position in the order at all, so there is no slot for a pending "act
    // this round instead" value to be restored into yet — and moving one
    // here would break the invariant the expiry rule below depends on: that
    // a delayed entry never moves, so the order *arriving* at its slot
    // really does mean a full round has passed. Without this, an entry that
    // Delays while last gets re-sorted to index 0 by this very sort and then
    // has `delayed` cleared by the check below on the same advance, with
    // zero intervening turns — Delay as a no-op, the exact failure the
    // slot-based rule exists to prevent. The restore isn't lost, only
    // deferred: `trueInitiative` stays armed and lands at the next wrap
    // after the Delay resolves, which is right, because the entry spent this
    // round outside the order.
    if (enc.entries.some((e) => e.trueInitiative !== null && !e.delayed)) {
      for (const e of enc.entries) {
        if (e.trueInitiative !== null && !e.delayed) {
          e.initiative = e.trueInitiative;
          e.orderKey = e.trueInitiative;
          e.trueInitiative = null;
        }
      }
      sortEntries(enc.entries);
    }
  }
  enc.activeEntryIndex = nextIndex;

  const active = enc.entries[nextIndex];
  if (!active) return;

  // Arriving back at a delayed entry's own slot is what "Delay an entire
  // round without returning" means — the order has come all the way round to
  // where it left. Note this is measured from the delayer's slot back to
  // that same slot, NOT from the round counter ticking over: an entry that
  // delays from the middle of the order is still legitimately delaying while
  // the round counter increments and the entries above it take their round-2
  // turns. RAW then says the delayed turn's actions are lost and "your
  // initiative doesn't change" — so there is nothing to restore (Delay never
  // moved `initiative` or `orderKey` in the first place; only returning
  // does), and this entry simply takes an ordinary turn here and now. The
  // lost actions are lost by never having been made available, which is why
  // actionsSpent is reset below exactly as for any other incoming turn.
  if (active.delayed) active.delayed = false;

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
}

/** Entries stay sorted by `orderKey` descending; Array#sort is stable, and
 * new entries are always appended before sorting, so ties preserve
 * insertion order. An entry with no initiative rolled yet is placed above
 * every rolled entry regardless of `orderKey` — it hasn't earned a spot in
 * the numeric order, so it waits at the top rather than defaulting into the
 * middle of the pack at `orderKey` 0. */
function sortEntries(entries: Entry[]): void {
  entries.sort((a, b) => {
    if (a.initiative === null && b.initiative !== null) return -1;
    if (a.initiative !== null && b.initiative === null) return 1;
    return keyOf(b) - keyOf(a);
  });
}

interface EncounterStore {
  encounter: Encounter;
  players: Player[];
  addCombatant(seed: CombatantSeed, initiative: number | null, trueInitiative?: number): string;
  addMany(
    seed: CombatantSeed,
    quantity: number,
    initiative: number | null,
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
  /** Delay (Player Core p. 416) for the entry whose turn it currently is:
   * fires its end-of-turn effects immediately and hands the turn on, leaving
   * the entry parked in place with no position in the order. */
  delay(entryId: string): void;
  /** Returns a delayed entry to the order directly behind the creature
   * currently acting, permanently rewriting its initiative to match. */
  returnFromDelay(entryId: string): void;
  acknowledgePrompt(promptId: string): void;
  group(ids: string[], name: string, initiative: number | null): void;
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
          orderKey: initiative ?? 0,
          combatantIds: [id],
          groupName: null,
          trueInitiative: trueInitiative ?? null,
          delayed: false,
          initiativeBeforeDelay: null,
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
            orderKey: initiative ?? 0,
            combatantIds: [id],
            groupName: null,
            trueInitiative: trueInitiative ?? null,
            delayed: false,
            initiativeBeforeDelay: null,
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
        // A typed initiative resets orderKey too, so a stale mid-round
        // placement (drag or delay) doesn't outlive the value the GM just
        // overwrote it with.
        entry.orderKey = initiative;
        // An explicit GM edit is authoritative — it overrides any pending
        // "acts this round instead" restoration, and retires the record of
        // what a Delay return replaced, which now describes a number the GM
        // has overwritten by hand.
        entry.trueInitiative = null;
        entry.initiativeBeforeDelay = null;
        sortEntries(enc.entries);
        if (activeEntryId !== null) {
          const idx = enc.entries.findIndex((e) => e.id === activeEntryId);
          enc.activeEntryIndex = idx >= 0 ? idx : 0;
        }
      }),

    applyDamage: (id, amount, damageType) =>
      set((state) => {
        const c = state.encounter.combatants[id];
        if (!c) return;
        dealDamage(c, amount, damageType);
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
        if (unrolledCount(enc) > 0) return;

        // Fire end-of-turn condition hooks for the entry whose turn is
        // ENDING — the one still active, before advanceTurn moves off it —
        // not the entry about to become active.
        const endingEntry = enc.entries[enc.activeEntryIndex];
        if (endingEntry) endTurnEffects(enc, endingEntry);

        advanceTurn(enc);
      }),

    delay: (entryId) =>
      set((state) => {
        const enc = state.encounter;
        // Delaying advances the turn, so it inherits nextTurn's refusal to
        // move while anyone is unrolled — the GM sees UnrolledNotice either
        // way, and Delay must not be a back door around that guard.
        if (unrolledCount(enc) > 0) return;
        // RAW trigger: "Your turn begins." Only the entry whose turn it
        // actually is can Delay, so this resolves the active entry and
        // checks the caller meant that one, rather than trusting the id.
        const entry = enc.entries[enc.activeEntryIndex];
        if (!entry || entry.id !== entryId || entry.delayed) return;

        endTurnEffects(enc, entry);
        // Nothing about the entry's position changes here. It keeps its
        // initiative and orderKey (and so its place in the list) until it
        // either returns — which rewrites both — or the order comes back
        // round to this slot and the delayed turn is simply lost.
        entry.delayed = true;
        advanceTurn(enc);
      }),

    returnFromDelay: (entryId) =>
      set((state) => {
        const enc = state.encounter;
        const entry = enc.entries.find((e) => e.id === entryId);
        if (!entry || !entry.delayed) return;

        // RAW: you return "triggered by the end of any other creature's
        // turn". The creature the GM is resolving right now is that other
        // creature, so the returning entry slots in directly behind it —
        // which is also the only placement the GM can express with one
        // click, at the moment they'd say it out loud at the table.
        const activeIndex = enc.activeEntryIndex;
        const active = enc.entries[activeIndex];
        // An unrolled active entry has no initiative to inherit; copying its
        // null would make the returning entry unrolled too and freeze the
        // whole turn order. Only reachable by adding a combatant with no
        // roll while someone is delayed, and the same condition disables the
        // Return button (see TurnManager).
        if (!active || active.id === entryId || active.initiative === null) return;

        // The entry immediately below the active one in the order, skipping
        // the returning entry itself — it is still parked at its pre-delay
        // key and is about to move.
        const belowIndex = enc.entries.findIndex((e, i) => i > activeIndex && e.id !== entryId);
        const activeKey = keyOf(active);
        // Halfway between the two neighbours, or a whole step below the
        // active entry when it is last in the order and there is no lower
        // neighbour to split the difference with.
        const belowKey = belowIndex >= 0 ? keyOf(enc.entries[belowIndex]!) : activeKey - 2;
        const newKey = (activeKey + belowKey) / 2;

        entry.initiativeBeforeDelay = entry.initiative;
        entry.initiative = active.initiative;
        entry.orderKey = newKey;
        entry.delayed = false;
        // RAW: returning "permanently changes your initiative" — so, exactly
        // as setInitiative does for a typed value, this retires any pending
        // "act this round instead" restoration. An entry added mid-round
        // still carries the GM's real typed initiative in trueInitiative;
        // left armed, the next round wrap would restore it straight over the
        // top of the position just returned to, and the permanent change
        // would silently last less than a round.
        entry.trueInitiative = null;

        // Splicing the entry into place *and* setting orderKey looks
        // redundant, and for distinct initiatives it is — but tied ones are
        // the norm here (addMany gives every member of a batch the same
        // roll), and then the midpoint above equals both neighbours' key.
        // sortEntries is stable, so with a tie it is this array position,
        // not the number, that decides who acts first.
        const from = enc.entries.findIndex((e) => e.id === entryId);
        const [moved] = enc.entries.splice(from, 1);
        const behindActive = enc.entries.findIndex((e) => e.id === active.id) + 1;
        enc.entries.splice(behindActive, 0, moved!);

        // Same identity-not-position rule as addCombatant/group: the GM is
        // mid-turn with the active creature, and a re-sort must not hand the
        // turn to whoever now sits at the old index.
        sortEntries(enc.entries);
        const idx = enc.entries.findIndex((e) => e.id === active.id);
        enc.activeEntryIndex = idx >= 0 ? idx : 0;
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
          orderKey: initiative ?? 0,
          combatantIds: [...ids],
          groupName: name,
          trueInitiative: null,
          delayed: false,
          initiativeBeforeDelay: null,
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
      });
    },
  })),
);
