import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Action, Attack } from "@pf2/schema";
import {
  applyEndOfTurn,
  dyingMax,
  dyingOnGain,
  woundedOnRecover,
  type ConditionSlug,
} from "../rules/conditions.js";
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
 * having `delay` call `nextTurn`) is half of what keeps the hooks firing
 * *once*: `delay` runs this itself and then advances with `advanceTurn`,
 * which never runs it. The other half is `settleEndOfTurn` below — call
 * that, not this, from anywhere a turn ends.
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
 * The one gate every end-of-turn resolution goes through, so a combatant's
 * turn is resolved exactly once per round no matter which path reaches it
 * first. `delay` resolves it early (RAW: on Delay those effects "occur
 * immediately"), `nextTurn` resolves it when the turn actually ends, and a
 * delayed turn reaches both — Delay up front, and again when the delayer
 * returns and finishes that very same turn.
 *
 * The whole question is "already done in the round we are in now?", and
 * `endOfTurnResolvedRound` answers it directly. Nothing anywhere clears the
 * stamp; a later round simply stops matching it. That is what makes the
 * answer survive a GM placing the entry above the turn pointer and then
 * correcting it back below — where the boolean this replaced lost the fact
 * it needed, three times running (see the field's own comment).
 */
function settleEndOfTurn(enc: Encounter, entry: Entry): void {
  if (entry.endOfTurnResolvedRound === enc.round) return;
  endTurnEffects(enc, entry);
  entry.endOfTurnResolvedRound = enc.round;
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
    // Delayed entries are deliberately skipped — and not because there is
    // nowhere to restore into. A delayed entry keeps its initiative, its
    // orderKey and its place in this array, exactly as `delay` left them;
    // that is the point. The expiry rule below reads position as elapsed
    // time — the order *arriving* at an entry's slot is what counts as a
    // full round — and that proxy holds only while the entry doesn't move.
    // This restore rewrites orderKey and re-sorts, so it moves one.
    // Concretely, without the skip: an entry that Delays while last is
    // re-sorted to index 0 by this very sort, and the check below then
    // clears `delayed` on the same advance with zero intervening turns —
    // Delay as a no-op, the exact failure the slot-based rule exists to
    // prevent. The restore isn't lost, only deferred: `trueInitiative`
    // stays armed and lands at the next wrap after the Delay resolves,
    // which is right, because the creature spent that round out of the
    // initiative order.
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
  // Nothing to unwind for the early resolution Delay made: the stamp records
  // which round it was for, which settles this on its own either way.
  //
  // Usually the order wrapped to get back here, so the round has moved on,
  // the stamp no longer matches, and the fresh turn starting here resolves
  // at its own end like any other. Not always, though — and the tempting
  // proof that it must (a delayed entry never moves on its own, and every
  // placement of one clears `delayed`) is wrong, because it only accounts
  // for the delayed entry moving. Moving the *active* entry above a delayed
  // one carries the pointer above it too, and the next advance then walks
  // down onto this slot inside the same round.
  //
  // In that case the stamp still matches and the lapsed turn resolves
  // nothing, which is right: this entry's effects already happened this
  // round, when it Delayed, and one resolution per round is the invariant.
  // Pinned by a test. The oddity there is the extra turn the placement hands
  // out, which is setInitiative's long-standing behaviour, not this branch's.
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
/**
 * The nearest entry from `start`, stepping by `step`, that has a rolled
 * initiative — or undefined if there is none that way.
 *
 * Only a rolled entry carries a meaningful `orderKey`: `sortEntries` pins an
 * unrolled one above every rolled entry on `initiative === null` alone,
 * whatever its key says, and that key is normally 0 (`orderKey: initiative
 * ?? 0` at creation). So an unrolled entry is not a point in the numeric
 * order at all, and `moveEntry` must not measure a drop against one — 0 is
 * the worst number it could pick up, dragging the computed key to the
 * bottom of the order. Skipping them is also what makes "before this row"
 * mean what it looks like on screen: the unrolled block is not part of the
 * numeric order, so the position above it is simply the top of the rolled
 * order.
 */
function nearestRolled(entries: Entry[], start: number, step: -1 | 1): Entry | undefined {
  for (let i = start; i >= 0 && i < entries.length; i += step) {
    const entry = entries[i];
    if (entry !== undefined && entry.initiative !== null) return entry;
  }
  return undefined;
}

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
  /** The GM's rules-free override for the turn order: drags `entryId` to sit
   * immediately before `beforeEntryId`, or to the very end when
   * `beforeEntryId` is null. Only `orderKey` ever moves the entry —
   * `initiative` is never touched, because a drag is a placement override,
   * not a re-roll. It's still authoritative enough to retire every pending
   * automatic reposition, same as setInitiative and returnFromDelay: clears
   * `trueInitiative` (so a later round wrap can't silently undo the drag)
   * and, for a delayed entry, `delayed` and its stale `initiativeBeforeDelay`. */
  moveEntry(entryId: string, beforeEntryId: string | null): void;
  acknowledgePrompt(promptId: string): void;
  group(ids: string[], name: string, initiative: number | null): void;
  ungroup(entryId: string): void;
  renameGroup(entryId: string, name: string): void;
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
          endOfTurnResolvedRound: null,
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
            endOfTurnResolvedRound: null,
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
        // Typing a position for a delayed entry is the manual equivalent of
        // returning it: the GM has named where this creature acts, which is
        // exactly what returning does, so it rejoins the order there rather
        // than staying out of it at a number the GM just chose. It also has
        // to clear for a mechanical reason — this edit re-sorts, and the
        // expiry rule in advanceTurn reads "the order arrived at this
        // entry's slot" as "a full round has passed", which only holds while
        // a delayed entry stays put. Leaving it delayed *and* moving it
        // would expire the Delay after a single turn or never at all,
        // depending on which side of the active entry it landed.
        entry.delayed = false;
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
        if (slug === "dying") {
          // Dying is additive, not a set-to-absolute like every other
          // valued condition here — `value` is the amount just gained (1
          // on dropping to 0 HP, 2 on a critical hit while dying), which is
          // what dyingOnGain expects; see its own doc comment for the
          // wounded interaction it applies.
          const updated = dyingOnGain(c.conditions, value);
          const max = dyingMax(c.conditions);
          const dyingEntry = updated.find((cond) => cond.slug === "dying")!;
          dyingEntry.value = Math.min(dyingEntry.value, max);
          c.conditions = updated;
          // data/conditions.json, dying: "if it ever reaches dying 4, you
          // die." Reuses the existing `defeated` flag the row already
          // renders rather than inventing a parallel notion of dead.
          if (dyingEntry.value >= max) c.defeated = true;
          return;
        }
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
        if (slug === "dying") {
          // data/conditions.json, dying: "Any time you lose the dying
          // condition, you gain the Wounded 1 condition, or increase your
          // wounded condition value by 1 ..." — a bare filter would drop
          // that fallout.
          c.conditions = woundedOnRecover(c.conditions);
          return;
        }
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
        if (endingEntry) settleEndOfTurn(enc, endingEntry);

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

        settleEndOfTurn(enc, entry);
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

    moveEntry: (entryId, beforeEntryId) =>
      set((state) => {
        const enc = state.encounter;
        const from = enc.entries.findIndex((e) => e.id === entryId);
        if (from < 0 || entryId === beforeEntryId) return;

        const activeEntryId = enc.entries[enc.activeEntryIndex]?.id ?? null;

        const [moved] = enc.entries.splice(from, 1);
        const target = beforeEntryId === null ? -1 : enc.entries.findIndex((e) => e.id === beforeEntryId);
        // A stale/unknown beforeEntryId (shouldn't happen from the UI, which
        // only ever passes another entry's live id or null) falls back to
        // the end, same as an explicit null — there's no better place to
        // guess than last.
        const insertAt = target < 0 ? enc.entries.length : target;

        // Same midpoint-between-neighbours placement returnFromDelay uses,
        // and for the same reason: entries commonly share an initiative
        // (addMany gives every member of a batch the same roll), so the key
        // alone can't always separate two ties. Splicing `moved` into the
        // array at the drop position *before* the stable re-sort below is
        // what actually settles a tie in the GM's favour — the array
        // position, not the number, decides who acts first among equals.
        // Nearest *rolled* neighbours, not simply adjacent ones — see
        // nearestRolled for why an unrolled entry is no place to measure
        // from. An unrolled entry always sits at the top of the list, so it
        // is the neighbour of whatever the GM drops into the first slot:
        // this is the common path, not an edge case.
        const above = nearestRolled(enc.entries, insertAt - 1, -1);
        const below = nearestRolled(enc.entries, insertAt, 1);
        moved!.orderKey =
          above !== undefined && below !== undefined
            ? (keyOf(above) + keyOf(below)) / 2
            : above !== undefined
              ? keyOf(above) - 1
              : below !== undefined
                ? keyOf(below) + 1
                : moved!.orderKey;

        // An explicit GM placement is authoritative and retires every
        // pending automatic reposition — the same rule setInitiative and
        // returnFromDelay already apply to a typed initiative and a Delay
        // return, and a drag is the most explicit placement of the three.
        // Concretely: an entry added mid-round with "act this round
        // instead" carries a real typed initiative parked in
        // trueInitiative, waiting for the next round wrap to restore it
        // (see addCombatant/advanceTurn). Left armed, that restore would
        // silently overwrite wherever the GM just dragged the entry to, the
        // next time the round turns over — the GM would see the row land
        // where dropped and then, one wrap later, watch it jump away with
        // no explanation. Clearing it here is what makes the drag actually
        // stick.
        moved!.trueInitiative = null;

        // A delayed entry holds no position in the order — advanceTurn's
        // round-wrap expiry rule reads "the order arrived back at this
        // slot" as "a full round passed while delayed" (see that function's
        // own comment), which only holds if a delayed entry never moves.
        // Dragging it elsewhere breaks that invariant exactly the way a
        // typed initiative used to, before setInitiative started treating
        // the edit as a manual return (see there). This does the same
        // thing here: the GM has just told the app precisely where this
        // combatant acts, which is a return in every sense but the number —
        // and the number is deliberately left alone, unlike setInitiative,
        // because a drag never carries a new initiative to assign.
        if (moved!.delayed) {
          moved!.delayed = false;
          // initiativeBeforeDelay is only meant to record the number this
          // entry held immediately before a *just-happened* Delay return,
          // so the row can show it struck through. delay() doesn't clear it
          // on a second Delay, so an entry that returned once, delayed
          // again, and is now dragged could still be carrying that old
          // value — which this un-delay didn't produce and has nothing to
          // do with. Left in place, it would resurface as a struck-through
          // number the GM never asked to see.
          moved!.initiativeBeforeDelay = null;
        }

        enc.entries.splice(insertAt, 0, moved!);
        sortEntries(enc.entries);

        // Same identity-not-position rule as addCombatant/group/
        // returnFromDelay: a reorder must never hand the turn to whoever
        // now sits at the old active index.
        if (activeEntryId !== null) {
          const idx = enc.entries.findIndex((e) => e.id === activeEntryId);
          enc.activeEntryIndex = idx >= 0 ? idx : 0;
        }
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
          endOfTurnResolvedRound: null,
        });
        sortEntries(remaining);
        enc.entries = remaining;

        const targetId = activeFullyAbsorbed ? groupEntryId : activeEntryId;
        const newIndex = targetId === null ? -1 : enc.entries.findIndex((e) => e.id === targetId);
        enc.activeEntryIndex = newIndex >= 0 ? newIndex : 0;
      }),

    ungroup: (entryId) =>
      set((state) => {
        const enc = state.encounter;
        const groupEntry = enc.entries.find((e) => e.id === entryId);
        if (!groupEntry || groupEntry.groupName === null) return;

        const activeEntry = enc.entries[enc.activeEntryIndex];
        const activeFullyDissolves = activeEntry?.id === entryId;
        const activeEntryId = activeEntry?.id ?? null;

        const newEntries: Entry[] = [];
        for (const entry of enc.entries) {
          if (entry.id === entryId) {
            for (const cid of entry.combatantIds) {
              newEntries.push({
                id: nextEntryId(),
                initiative: entry.initiative,
                combatantIds: [cid],
                groupName: null,
                trueInitiative: entry.trueInitiative,
                orderKey: entry.orderKey,
                delayed: entry.delayed,
                initiativeBeforeDelay: entry.initiativeBeforeDelay,
                // Each member inherits the group's delay state wholesale,
                // this stamp included: if the group's turn was already
                // resolved early by Delay this round, ungrouping must not
                // hand every member a second resolution.
                endOfTurnResolvedRound: entry.endOfTurnResolvedRound,
              });
            }
          } else {
            newEntries.push(entry);
          }
        }
        sortEntries(newEntries);
        enc.entries = newEntries;

        const targetId = activeFullyDissolves ? null : activeEntryId;
        const newIndex = targetId === null ? -1 : enc.entries.findIndex((e) => e.id === targetId);
        enc.activeEntryIndex = newIndex >= 0 ? newIndex : 0;
      }),

    renameGroup: (entryId, name) =>
      set((state) => {
        const enc = state.encounter;
        const entry = enc.entries.find((e) => e.id === entryId);
        if (entry && entry.groupName !== null) {
          entry.groupName = name;
        }
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
