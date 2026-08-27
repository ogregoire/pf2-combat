import { beforeEach, describe, expect, it } from "vitest";
import { useEncounter } from "../src/state/store.js";

const reset = () => useEncounter.getState().reset();

const addCreature = (name: string, initiative: number | null, hp = 20): string => {
  const id = useEncounter.getState().addCombatant({
    kind: "creature", name, level: 1, ac: 15,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    hp: { current: hp, max: hp },
  }, initiative);
  return id;
};

const addPc = (name: string, initiative: number): string =>
  useEncounter.getState().addCombatant({
    kind: "pc", name, level: 1, ac: 15,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    hp: { current: 20, max: 20 },
  }, initiative);

describe("encounter store", () => {
  beforeEach(reset);

  it("orders entries by initiative descending", () => {
    addCreature("low", 5);
    addCreature("high", 20);
    expect(
      useEncounter.getState().encounter.entries.map((e) => e.initiative),
    ).toEqual([20, 5]);
  });

  it("sorts an unrolled entry (initiative null) above every rolled entry, regardless of value", () => {
    addCreature("twenty", 20);
    addCreature("unrolled", null);
    addCreature("ten", 10);
    const names = useEncounter.getState().encounter.entries
      .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
    expect(names).toEqual(["unrolled", "twenty", "ten"]);
  });

  it("sorts by orderKey, so an entry can be placed between two equal initiatives", () => {
    addCreature("Alpha", 20);
    addCreature("Beta", 20);
    const [alpha, beta] = useEncounter.getState().encounter.entries;
    expect(alpha!.orderKey).toBe(20);
    expect(beta!.orderKey).toBe(20);

    // Placed between them without touching either initiative.
    useEncounter.setState((st) => {
      st.encounter.entries[1]!.orderKey = 19.5;
    });
    addCreature("Gamma", 20);
    const names = useEncounter.getState().encounter.entries
      .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
    expect(names).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  // Defence in depth behind persist.ts's migrate(), which is what actually
  // fills a missing orderKey in (see its own tests). This pins the sorter's
  // fallback itself: state that reaches it with no orderKey at all — an old
  // save read by some path that skipped the migration, or a hand-built
  // entry — still sorts by initiative rather than tying every entry at 0
  // and scrambling the order.
  it("falls back to initiative when an entry has no orderKey, rather than tying every entry at 0", () => {
    addCreature("Alpha", 20);
    addCreature("Beta", 15);
    addCreature("Gamma", 10);
    useEncounter.setState((st) => {
      for (const e of st.encounter.entries) delete (e as { orderKey?: number }).orderKey;
    });

    addCreature("Delta", 12); // any add re-sorts, which is what exercises keyOf

    const names = useEncounter.getState().encounter.entries
      .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
    expect(names).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
  });

  it("adds N copies with numbered labels", () => {
    useEncounter.getState().addMany(
      { kind: "creature", name: "Goblin Warrior", level: 1, ac: 16,
        saves: { fortitude: 5, reflex: 8, will: 3 }, hp: { current: 6, max: 6 } },
      3, 13,
    );
    const names = Object.values(useEncounter.getState().encounter.combatants).map((c) => c.label);
    expect(names).toEqual(["1", "2", "3"]);
  });

  it("applies damage without going below zero", () => {
    const id = addCreature("x", 10, 10);
    useEncounter.getState().applyDamage(id, 4);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(6);
    useEncounter.getState().applyDamage(id, 99);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(0);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(true);
  });

  it("heals without exceeding max", () => {
    const id = addCreature("x", 10, 10);
    useEncounter.getState().applyDamage(id, 8);
    useEncounter.getState().applyHealing(id, 99);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(10);
  });

  it("replaces a condition value rather than duplicating it", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "frightened", 1);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions).toEqual([{ slug: "frightened", value: 3 }]);
  });

  it("advances turns and increments the round on wrap", () => {
    addCreature("a", 20);
    addCreature("b", 10);
    const s = () => useEncounter.getState().encounter;
    expect(s().activeEntryIndex).toBe(0);
    useEncounter.getState().nextTurn();
    expect(s().activeEntryIndex).toBe(1);
    expect(s().round).toBe(1);
    useEncounter.getState().nextTurn();
    expect(s().activeEntryIndex).toBe(0);
    expect(s().round).toBe(2);
  });

  it("resets strikes and refreshes reactions when a turn begins", () => {
    const a = addCreature("a", 20);
    addCreature("b", 10);
    useEncounter.getState().recordStrike(a);
    useEncounter.getState().setReactionSpent(a, true);
    expect(useEncounter.getState().encounter.combatants[a]!.strikesMade).toBe(1);
    useEncounter.getState().nextTurn();
    useEncounter.getState().nextTurn();
    const c = useEncounter.getState().encounter.combatants[a]!;
    expect(c.strikesMade).toBe(0);
    expect(c.reactionSpent).toBe(false);
  });

  it("keeps acknowledged prompts until that combatant's turn comes round again", () => {
    const a = addCreature("a", 20);
    addCreature("b", 10);
    useEncounter.getState().acknowledgePrompt(`${a}:start:dying`);
    expect(useEncounter.getState().encounter.acknowledgedPrompts).toContain(`${a}:start:dying`);
    useEncounter.getState().nextTurn();
    expect(useEncounter.getState().encounter.acknowledgedPrompts).toContain(`${a}:start:dying`);
    useEncounter.getState().nextTurn();
    expect(useEncounter.getState().encounter.acknowledgedPrompts).not.toContain(`${a}:start:dying`);
  });

  it("keeps the active combatant unchanged when a higher-initiative combatant joins mid-combat", () => {
    addCreature("Alpha", 20);
    const beta = addCreature("Beta", 10);
    useEncounter.getState().nextTurn(); // Alpha -> Beta
    addCreature("Newcomer", 30);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.combatantIds).toEqual([beta]);
  });

  it("leaves the active combatant unchanged when the new combatant is slower", () => {
    addCreature("Alpha", 20);
    const beta = addCreature("Beta", 10);
    useEncounter.getState().nextTurn(); // Alpha -> Beta
    addCreature("Straggler", 5);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.combatantIds).toEqual([beta]);
  });

  it("keeps the active combatant unchanged when addMany inserts faster combatants", () => {
    addCreature("Alpha", 20);
    const beta = addCreature("Beta", 10);
    useEncounter.getState().nextTurn(); // Alpha -> Beta
    useEncounter.getState().addMany(
      { kind: "creature", name: "Goblin", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 6, max: 6 } },
      3, 30,
    );
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.combatantIds).toEqual([beta]);
  });

  it("groups combatants under one entry sharing an initiative", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    const entries = useEncounter.getState().encounter.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.groupName).toBe("Gate Watch");
    expect(entries[0]!.initiative).toBe(15);
    expect(entries[0]!.combatantIds).toHaveLength(2);
  });

  it("keeps the active combatant unchanged when the group is formed only from entries before it", () => {
    const a = addCreature("a", 40);
    const d = addCreature("d", 30);
    const b = addCreature("b", 20);
    addCreature("c", 10);
    useEncounter.getState().nextTurn(); // a -> d
    useEncounter.getState().nextTurn(); // d -> b
    useEncounter.getState().group([a, d], "Vanguard", 5);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.combatantIds).toEqual([b]);
  });

  it("keeps the active combatant unchanged when the group is formed only from entries after it", () => {
    const a = addCreature("a", 40);
    const d = addCreature("d", 30);
    const b = addCreature("b", 20);
    const c = addCreature("c", 10);
    const e = addCreature("e", 5);
    useEncounter.getState().nextTurn(); // a -> d
    useEncounter.getState().nextTurn(); // d -> b
    useEncounter.getState().group([c, e], "Rear Guard", 5);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.combatantIds).toEqual([b]);
  });

  it("moves the active turn onto the new group entry when the active entry is fully absorbed", () => {
    const a = addCreature("a", 40);
    const d = addCreature("d", 30);
    const b = addCreature("b", 20);
    const c = addCreature("c", 10);
    useEncounter.getState().nextTurn(); // a -> d
    useEncounter.getState().nextTurn(); // d -> b (active)
    useEncounter.getState().group([b, c], "Vanguard", 35);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.groupName).toBe("Vanguard");
    expect(active.combatantIds).toContain(b);
    expect(active.combatantIds).toContain(c);
  });

  it("keeps the original entry active when it is only partially absorbed", () => {
    const f = addCreature("f", 50);
    const g = addCreature("g", 20);
    const h = addCreature("h", 15);
    useEncounter.getState().group([g, h], "Squad", 25);
    useEncounter.getState().nextTurn(); // f -> Squad (active)
    const squadEntryId = useEncounter
      .getState()
      .encounter.entries.find((entry) => entry.groupName === "Squad")!.id;
    useEncounter.getState().group([g], "Just G", 30);
    const enc = useEncounter.getState().encounter;
    const active = enc.entries[enc.activeEntryIndex]!;
    expect(active.id).toBe(squadEntryId);
    expect(active.combatantIds).toEqual([h]);
  });

  it("removes a combatant, dissolving its entry", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().removeCombatant(a);
    const enc = useEncounter.getState().encounter;
    expect(enc.combatants[a]).toBeUndefined();
    expect(enc.entries).toHaveLength(1);
    expect(enc.entries[0]!.combatantIds).toEqual([b]);
  });

  it("clears the target when the targeted combatant is removed", () => {
    const a = addCreature("a", 20);
    useEncounter.getState().setTarget(a);
    useEncounter.getState().removeCombatant(a);
    expect(useEncounter.getState().encounter.targetId).toBeNull();
  });

  it("advances the active pointer to what comes next when the active combatant is removed", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    addCreature("c", 5);
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(0);
    useEncounter.getState().removeCombatant(a);
    const enc = useEncounter.getState().encounter;
    // b was next after a; removing a's entry shifts b into a's old slot.
    expect(enc.entries[enc.activeEntryIndex]!.combatantIds).toEqual([b]);
  });

  it("wraps the active pointer to the front when the last, active entry is removed", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().nextTurn(); // a -> b (active, last entry)
    useEncounter.getState().removeCombatant(b);
    const enc = useEncounter.getState().encounter;
    expect(enc.activeEntryIndex).toBe(0);
    expect(enc.entries[0]!.combatantIds).toEqual([a]);
  });

  it("wraps to the front (not the entry before it) when the last of three active entries is removed", () => {
    // Regression: with only two entries, min(oldActiveIndex, len-1) happens
    // to land on the same index a correct wrap would — masking a bug where
    // removing the last of a/b/c (c active) landed on b instead of
    // wrapping to a. Three entries is the minimum that can tell them apart.
    const a = addCreature("a", 30);
    const b = addCreature("b", 20);
    const c = addCreature("c", 10);
    useEncounter.getState().nextTurn(); // a -> b
    useEncounter.getState().nextTurn(); // b -> c (active, last entry)
    const roundBefore = useEncounter.getState().encounter.round;
    useEncounter.getState().removeCombatant(c);
    const enc = useEncounter.getState().encounter;
    expect(enc.entries[enc.activeEntryIndex]!.combatantIds).toEqual([a]);
    expect(enc.activeEntryIndex).toBe(0);
    expect(enc.round).toBe(roundBefore + 1);
    // b is still present, just no longer active.
    expect(enc.entries.some((e) => e.combatantIds.includes(b))).toBe(true);
  });

  it("keeps the active combatant unchanged when a different combatant is removed", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().nextTurn(); // a -> b (active)
    useEncounter.getState().removeCombatant(a);
    const enc = useEncounter.getState().encounter;
    expect(enc.entries[enc.activeEntryIndex]!.combatantIds).toEqual([b]);
  });

  it("clears every creature but keeps the round, turn order and PCs running", () => {
    const a = addCreature("a", 30);
    const pc = addPc("Valeria", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().nextTurn(); // a -> pc
    useEncounter.getState().nextTurn(); // pc -> b (active)
    const roundBefore = useEncounter.getState().encounter.round;

    useEncounter.getState().clearEnemies();

    const enc = useEncounter.getState().encounter;
    expect(Object.keys(enc.combatants)).toEqual([pc]);
    expect(enc.entries).toHaveLength(1);
    expect(enc.entries[0]!.combatantIds).toEqual([pc]);
    // b (active, last entry) dissolved along with a; the pointer wraps to
    // the only survivor, exactly as removeCombatant already would.
    expect(enc.activeEntryIndex).toBe(0);
    expect(enc.round).toBe(roundBefore + 1);
    expect(a in enc.combatants).toBe(false);
    expect(b in enc.combatants).toBe(false);
  });

  it("empties the player roster and removes any PC already in the encounter", () => {
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    const pc = addPc("Valeria", 20);
    const enemy = addCreature("Goblin", 10);

    useEncounter.getState().clearPlayers();

    expect(useEncounter.getState().players).toEqual([]);
    const enc = useEncounter.getState().encounter;
    expect(pc in enc.combatants).toBe(false);
    expect(enemy in enc.combatants).toBe(true);
  });

  it("resets the encounter to round 1 with no combatants, target or prompts, but keeps the players", () => {
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    const a = addCreature("a", 20);
    useEncounter.getState().setTarget(a);
    useEncounter.getState().nextTurn();
    useEncounter.getState().acknowledgePrompt(`${a}:dying`);

    useEncounter.getState().resetEncounter();

    const enc = useEncounter.getState().encounter;
    expect(enc.combatants).toEqual({});
    expect(enc.entries).toEqual([]);
    expect(enc.round).toBe(1);
    expect(enc.targetId).toBeNull();
    expect(enc.acknowledgedPrompts).toEqual([]);
    expect(useEncounter.getState().players).toHaveLength(1);
  });

  it("edits an entry's initiative and re-sorts", () => {
    addCreature("a", 20);
    const b = addCreature("b", 10);
    const entryId = useEncounter.getState().encounter.entries.find((e) => e.combatantIds[0] === b)!.id;
    useEncounter.getState().setInitiative(entryId, 30);
    const entries = useEncounter.getState().encounter.entries;
    expect(entries[0]!.combatantIds).toEqual([b]);
    expect(entries[0]!.initiative).toBe(30);
  });

  it("keeps the active combatant unchanged when an initiative edit reorders entries", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().nextTurn(); // a -> b (active)
    const aEntryId = useEncounter.getState().encounter.entries.find((e) => e.combatantIds[0] === a)!.id;
    useEncounter.getState().setInitiative(aEntryId, 5);
    const enc = useEncounter.getState().encounter;
    expect(enc.entries[enc.activeEntryIndex]!.combatantIds).toEqual([b]);
  });

  it("restores true initiative when a combatant acts this round, once the round wraps", () => {
    addCreature("Active", 15);
    const newcomerId = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Newcomer", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 10, max: 10 } },
      15, // slotted just behind the active entry this round…
      22, // …but the GM actually typed 22.
    );
    let enc = useEncounter.getState().encounter;
    const newcomerEntry = enc.entries.find((e) => e.combatantIds[0] === newcomerId)!;
    expect(newcomerEntry.initiative).toBe(15);
    expect(newcomerEntry.trueInitiative).toBe(22);

    useEncounter.getState().nextTurn(); // Active -> Newcomer (still round 1)
    useEncounter.getState().nextTurn(); // wraps to round 2 — restores 22
    enc = useEncounter.getState().encounter;
    const restored = enc.entries.find((e) => e.combatantIds[0] === newcomerId)!;
    expect(restored.initiative).toBe(22);
    expect(restored.trueInitiative).toBeNull();
    // 22 sorts above Active's 15, so Newcomer leads the new round.
    expect(enc.entries[0]!.combatantIds).toEqual([newcomerId]);
  });

  // The other half of the rule above: a pending restore is *pending*, and an
  // explicit GM edit retires it. moveEntry and returnFromDelay already have
  // their own tests for this same rule; setInitiative — where the rule was
  // written first — had none, and deleting the line left every test green.
  it("retires a pending 'act this round instead' restore when the GM types a new initiative", () => {
    addCreature("Active", 15);
    const newcomerId = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Newcomer", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 10, max: 10 } },
      15, // acting this round just behind Active…
      22, // …on a real typed 22, parked until the round wraps.
    );
    const entryId = useEncounter.getState().encounter.entries.find((e) => e.combatantIds[0] === newcomerId)!.id;

    // The GM thinks better of it and types 8 instead, mid-round.
    useEncounter.getState().setInitiative(entryId, 8);
    expect(useEncounter.getState().encounter.entries.find((e) => e.id === entryId)!.trueInitiative).toBeNull();

    useEncounter.getState().nextTurn();
    useEncounter.getState().nextTurn(); // round wraps — the old 22 must not come back

    const enc = useEncounter.getState().encounter;
    expect(enc.round).toBe(2);
    expect(enc.entries.find((e) => e.id === entryId)!.initiative).toBe(8);
    // 8 sorts below Active's 15 — a restored 22 would have led the round.
    expect(enc.entries.map((e) => e.initiative)).toEqual([15, 8]);
  });

  it("restores id counters from a persisted encounter, so a post-reload add cannot collide", async () => {
    const { restoreCombatantSequences } = await import("../src/state/store.js");
    addCreature("a", 20);
    addCreature("b", 10);
    const before = useEncounter.getState().encounter;
    useEncounter.getState().reset(); // simulates the module reloading with seq back at 0
    restoreCombatantSequences(before);
    const c = addCreature("c", 5);
    expect(c).toBe("c3");
    const ids = Object.keys(useEncounter.getState().encounter.combatants);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spends actions, accumulating across multiple spends", () => {
    const a = addCreature("a", 20);
    useEncounter.getState().spendActions(a, 1);
    useEncounter.getState().spendActions(a, 2);
    expect(useEncounter.getState().encounter.combatants[a]!.actionsSpent).toBe(3);
  });

  it("resets actions spent at the start of a turn", () => {
    const a = addCreature("a", 20);
    addCreature("b", 10);
    useEncounter.getState().spendActions(a, 2);
    expect(useEncounter.getState().encounter.combatants[a]!.actionsSpent).toBe(2);
    useEncounter.getState().nextTurn();
    useEncounter.getState().nextTurn();
    expect(useEncounter.getState().encounter.combatants[a]!.actionsSpent).toBe(0);
  });

  // These prove the dying/wounded/doomed rules fire through the store's
  // addCondition/removeCondition, not just in the rules module they're
  // built from — see rules/conditions.ts's dyingOnGain/dyingMax/
  // woundedOnRecover for the dataset text each is drawn from.
  it("applies the wounded bump through the store, not just in the rules module", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "wounded", 2);
    useEncounter.getState().addCondition(id, "dying", 1);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")!.value).toBe(3);
  });

  it("caps dying at 4 through the store and marks the combatant defeated on reaching it", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "dying", 4);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")!.value).toBe(4);
    expect(c.defeated).toBe(true);
  });

  it("clamps dying below 4 through the store when doomed reduces the cap", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "doomed", 1);
    useEncounter.getState().addCondition(id, "dying", 4);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")!.value).toBe(3);
    expect(c.defeated).toBe(true);
  });

  it("does not mark the combatant defeated while dying stays under the cap", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "dying", 2);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(false);
  });

  it("routes removing dying through the store into a wounded bump, not a bare removal", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "dying", 2);
    useEncounter.getState().removeCondition(id, "dying");
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")).toBeUndefined();
    expect(c.conditions.find((x) => x.slug === "wounded")!.value).toBe(1);
  });

  // Fix round 1, item 1: doomed's own text ("If your maximum dying value is
  // reduced to 0, you instantly die") kills on its own, with no dying gain
  // needed — previously only the dying branch of addCondition ever set
  // defeated, so a doomed-4 combatant sat alive and unmarked.
  it("marks a combatant defeated on applying doomed 4 alone, with no dying condition present", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "doomed", 4);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")).toBeUndefined();
    expect(c.defeated).toBe(true);
  });

  it("does not mark a combatant defeated on a doomed value that still leaves a positive dying max", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "doomed", 3);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(false);
  });

  // Fix round 1, item 3: clamping dying down to a max of 0 previously wrote
  // a literal "dying 0" into state — indistinguishable from not being dying
  // at all — for a combatant who is, per the rule above, already dead. Kept
  // as the raw (uncapped) accumulated value instead, so state still records
  // an actual dying number for a dead combatant.
  it("keeps the raw dying value, uncapped, rather than clamping to a nonsense 0 when doomed has zeroed the max", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "doomed", 4);
    useEncounter.getState().addCondition(id, "dying", 1);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "dying")!.value).toBe(1);
    expect(c.defeated).toBe(true);
  });

  // Fix round 1, item 2: guards the store's own call site the same way —
  // removing "dying" from a combatant who was never dying must not
  // fabricate a Wounded 1.
  it("does not fabricate wounded when removing dying from a combatant who was never dying", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().removeCondition(id, "dying");
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions.find((x) => x.slug === "wounded")).toBeUndefined();
  });

  // Task 3: dropping to 0 HP. Per data/conditions.json's "dying" entry —
  // "While you have this condition, you are Unconscious" — a PC starts
  // dying (which drags unconscious along) rather than being outright
  // defeated; an ordinary creature has no dying trauma rules (Player Core)
  // and simply dies.
  it("starts a PC dying at 0 HP but marks a creature defeated", () => {
    const pc = addPc("p", 20);
    useEncounter.getState().applyDamage(pc, 999);
    const pcAfter = useEncounter.getState().encounter.combatants[pc]!;
    expect(pcAfter.conditions.find((c) => c.slug === "dying")!.value).toBe(1);
    expect(pcAfter.conditions.some((c) => c.slug === "unconscious")).toBe(true);
    expect(pcAfter.defeated).toBe(false);

    const monster = addCreature("m", 19);
    useEncounter.getState().applyDamage(monster, 999);
    const monsterAfter = useEncounter.getState().encounter.combatants[monster]!;
    expect(monsterAfter.defeated).toBe(true);
    expect(monsterAfter.conditions.some((c) => c.slug === "dying")).toBe(false);
  });

  // Requirement (a) of the task-3 brief: end-of-turn persistent damage flows
  // through the same `dealDamage` choke point as a direct applyDamage call
  // (see the store's dealDamage/endTurnEffects comments), so it must trigger
  // dying too. "1d4+996" always rolls >= 997, guaranteeing the kill without
  // needing to inject a deterministic rng.
  it("starts a PC dying from persistent damage at end of turn, not just from a direct applyDamage call", () => {
    const pc = addPc("p", 20);
    useEncounter.getState().addCondition(pc, "persistent-damage", 0, "1d4+996");
    useEncounter.getState().nextTurn();
    const after = useEncounter.getState().encounter.combatants[pc]!;
    expect(after.hp!.current).toBe(0);
    expect(after.conditions.find((c) => c.slug === "dying")!.value).toBe(1);
  });

  it("clears dying when a PC is healed above 0", () => {
    const pc = addPc("p", 20);
    useEncounter.getState().applyDamage(pc, 999);
    useEncounter.getState().applyHealing(pc, 5);
    const after = useEncounter.getState().encounter.combatants[pc]!;
    expect(after.conditions.some((c) => c.slug === "dying")).toBe(false);
    expect(after.conditions.find((c) => c.slug === "wounded")!.value).toBe(1);
  });

  // Requirement (b): doomed's own instant-death rule ("If your maximum
  // dying value is reduced to 0, you instantly die" — data/conditions.json)
  // is permanent while doomed stays at that value; nothing about restoring
  // Hit Points changes doomed. Healing must not resurrect this combatant.
  it("does not resurrect a combatant killed by doomed alone when healed", () => {
    const id = addCreature("x", 20);
    useEncounter.getState().addCondition(id, "doomed", 4);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(true);

    useEncounter.getState().applyHealing(id, 5);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(true);
  });

  // The ordinary case healing must still cover: a ordinary creature felled
  // by damage (no doomed involved) comes back once healed above 0.
  it("clears defeated when healing an ordinarily-defeated creature back above 0", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().applyDamage(id, 99);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(true);

    useEncounter.getState().applyHealing(id, 5);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(false);
  });
});
