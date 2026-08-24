import { beforeEach, describe, expect, it } from "vitest";
import { useEncounter } from "../src/state/store.js";

const reset = () => useEncounter.getState().reset();

const addCreature = (name: string, initiative: number, hp = 20): string => {
  const id = useEncounter.getState().addCombatant({
    kind: "creature", name, level: 1, ac: 15,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    hp: { current: hp, max: hp },
  }, initiative);
  return id;
};

describe("encounter store", () => {
  beforeEach(reset);

  it("orders entries by initiative descending", () => {
    addCreature("low", 5);
    addCreature("high", 20);
    expect(
      useEncounter.getState().encounter.entries.map((e) => e.initiative),
    ).toEqual([20, 5]);
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
});
