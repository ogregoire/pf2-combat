import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookCatalogEntry, Creature, IndexEntry } from "@pf2/schema";
import type { FetchFn } from "../src/data/catalog.js";
import { EncounterScreen } from "../src/components/EncounterScreen.js";
import { useEncounter } from "../src/state/store.js";

describe("EncounterScreen", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("renders all three panes", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 78, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByTestId("combatant-list")).toBeDefined();
    expect(screen.getByTestId("active-combatant")).toBeDefined();
    expect(screen.getByTestId("turn-manager")).toBeDefined();
  });

  it("does not let the turn-manager pane itself scroll — only its reaction list does", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 78, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    const pane = screen.getByTestId("turn-manager");
    expect(pane.style.overflowY).toBe("");
    expect(pane.style.minHeight).toBe("0");
  });

  const twoLevelFourPlayers = () =>
    useEncounter.getState().setPlayers([
      { id: "p1", name: "A", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true, initiativeModifier: null },
      { id: "p2", name: "B", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true, initiativeModifier: null },
    ]);

  const addStagLord = () =>
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 } },
      19,
    );

  // The old single "XP each" badge conflated what the fight is worth with what
  // the party has actually earned, so a half-finished encounter read as though
  // it had already paid out in full.
  it("shows the encounter total separately from the XP earned so far", () => {
    twoLevelFourPlayers();
    addStagLord();
    render(<EncounterScreen />);

    // Level 6 against party level 4 is +2 => 80 XP on the table...
    expect(screen.getByTestId("xp-total").textContent).toMatch(/80/);
    // ...and nothing earned while it is still standing.
    expect(screen.getByTestId("xp-earned").textContent).toMatch(/^0XP/);
  });

  it("moves XP into the earned award as creatures are defeated, and never divides it by party size", () => {
    twoLevelFourPlayers();
    const stagLord = addStagLord();
    const bandit = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Bandit", level: 2, ac: 15,
        saves: { fortitude: 6, reflex: 7, will: 4 }, hp: { current: 16, max: 16 } },
      12,
    );
    // Stag Lord (+2) 80 + Bandit (-2) 20 = 100 on the table.
    const view = render(<EncounterScreen />);
    expect(screen.getByTestId("xp-total").textContent).toMatch(/100/);
    expect(screen.getByTestId("xp-earned").textContent).toMatch(/^0XP/);

    // Drop the bandit: its 20 XP moves into the award, the total is unchanged
    // (a defeated creature is still part of what the encounter was worth), and
    // the award is the full 20 rather than a per-player share of it.
    useEncounter.getState().applyDamage(bandit, 999);
    view.rerender(<EncounterScreen />);
    expect(screen.getByTestId("xp-total").textContent).toMatch(/100/);
    expect(screen.getByTestId("xp-earned").textContent).toMatch(/20/);

    // Finish the fight and the two figures meet.
    useEncounter.getState().applyDamage(stagLord, 999);
    view.rerender(<EncounterScreen />);
    expect(screen.getByTestId("xp-earned").textContent).toMatch(/100/);
  });

  it("labels the two XP figures so they can't be mistaken for one another", () => {
    twoLevelFourPlayers();
    addStagLord();
    render(<EncounterScreen />);
    expect(screen.getByTestId("xp-total").textContent).toMatch(/on the table/i);
    expect(screen.getByTestId("xp-earned").textContent).toMatch(/earned each/i);
  });

  it("runs a whole turn end to end", async () => {
    const user = userEvent.setup();
    const a = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Alpha", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      20,
    );
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      10,
    );
    render(<EncounterScreen />);

    // "Alpha" is the active combatant, so its name renders twice by design —
    // once in the list, once in the centre stat-block header. Scope the query.
    const list = within(screen.getByTestId("combatant-list"));
    await user.hover(list.getByText("Alpha"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Damage" }));
    expect(useEncounter.getState().encounter.combatants[a]!.hp!.current).toBe(15);

    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });

  it("applies a condition through the row popover and shows the resulting prompt in TurnManager", async () => {
    // The whole point of C1: nothing before this wired addCondition to any
    // UI, so this drives the real path (hover -> click the condition's tag)
    // and checks the effect reaches all the way to a rendered prompt. A
    // click applies a valued condition at 1, which is exactly what's needed
    // here — no separate value entry.
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Alpha", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      20,
    );
    render(<EncounterScreen />);

    const list = within(screen.getByTestId("combatant-list"));
    await user.hover(list.getByText("Alpha"));
    await user.click(screen.getByRole("button", { name: "Slowed" }));

    expect(
      within(screen.getByTestId("turn-manager")).getByText(/Lose 1 action/),
    ).toBeDefined();
  });

  it("spends the action pool when the GM uses an action, and Next becomes prominent at zero", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Alpha", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 },
        actions: [
          { name: "Stride", cost: "1", category: "basic", traits: [], trigger: null,
            requirements: null, frequency: null, description: "Move up to your Speed." },
        ] },
      20,
    );
    render(<EncounterScreen />);

    const next = screen.getByRole("button", { name: /next combatant/i });
    expect(next.style.background).not.toBe("var(--accent-bg)");
    expect(screen.getByText("3 actions")).toBeDefined();

    // Selecting the ability reveals its Use button; Use is what spends. The
    // card stays selected between presses, so the button can be pressed
    // three times to drain the pool.
    await user.click(screen.getByRole("button", { name: /stride/i }));
    const use = screen.getByRole("button", { name: /^Use / });
    await user.click(use);
    await user.click(use);
    await user.click(use);

    expect(screen.getByText("0 actions")).toBeDefined();
    expect(next.style.background).toBe("var(--accent-bg)");
  });

  it("selects a target by clicking a combatant row and reaches the roll assistant", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Archer", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 },
        attacks: [
          { name: "Shortbow", kind: "ranged", bonus: 8, traits: [],
            damage: [{ formula: "1d6+2", type: "piercing", category: null }], effects: [] },
        ] },
      20,
    );
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Bandit", level: 1, ac: 17,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 16, max: 16 } },
      10,
    );
    render(<EncounterScreen />);

    // Archer is active with no target yet — the roll assistant is stuck on
    // its placeholder, which is exactly the gap the reviewer caught.
    expect(screen.getByText(/select a target/i)).toBeDefined();

    // Bandit is not the active combatant, so its name is unambiguous — click
    // its row (not a hover) to set it as the target.
    const list = within(screen.getByTestId("combatant-list"));
    await user.click(list.getByText("Bandit"));

    await user.click(screen.getByRole("button", { name: /Shortbow/ }));

    expect(screen.queryByText(/select a target/i)).toBeNull();
    expect(screen.getByText("1d20 + 8")).toBeDefined();
    // Exact match: the roll box also has a "vs AC 17" span, and Bandit's own
    // list row (a different pane) reads "AC 17" too.
    expect(within(screen.getByTestId("active-combatant")).getByText("AC 17")).toBeDefined();

    // Clicking the same row again clears the target.
    await user.click(list.getByText("Bandit"));
    expect(screen.getByText(/select a target/i)).toBeDefined();
  });

  describe("the add-a-creature loop, against injected fake fetches", () => {
    const book: BookCatalogEntry = {
      pack: "test-book",
      title: "Test Book",
      license: "OGL",
      remaster: false,
      creatureCount: 1,
      indexPath: "index/test-book.json",
      mixed: false,
    };

    const indexEntry: IndexEntry = {
      id: "test-book/goblin",
      slug: "goblin",
      name: "Test Goblin",
      level: 1,
      rarity: "common",
      size: "small",
      traits: ["goblin"],
      ac: 16,
      hp: 6,
      remaster: false,
      book: "Test Book",
    };

    const creature: Creature = {
      id: "test-book/goblin",
      foundryId: "abc123",
      name: "Test Goblin",
      level: 1,
      rarity: "common",
      size: "small",
      traits: ["goblin"],
      source: { pack: "test-book", book: "Test Book", license: "OGL", remaster: false },
      ac: 16,
      acDetails: null,
      hp: 6,
      hpDetails: null,
      saves: {
        fortitude: { value: 5, detail: null },
        reflex: { value: 6, detail: null },
        will: { value: 2, detail: null },
      },
      immunities: [],
      weaknesses: [],
      resistances: [],
      perception: 4,
      senses: [],
      languages: [],
      skills: {},
      abilityMods: {},
      speeds: [{ type: "land", value: 25 }],
      attacks: [
        { name: "Shortsword", kind: "melee", bonus: 8,
          damage: [{ formula: "1d6+2", type: "piercing", category: null }],
          traits: ["agile", "finesse"], effects: [] },
      ],
      actions: [],
      spellcasting: [],
      gear: [],
      publicNotes: "",
    };

    const fakeFetch: FetchFn = (url) => {
      if (url.includes("books.json")) return Promise.resolve(new Response(JSON.stringify([book])));
      if (url.includes("index/test-book.json")) return Promise.resolve(new Response(JSON.stringify([indexEntry])));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    };

    it("loads books, finds a creature by search, and adds it with populated attacks and saves", async () => {
      const user = userEvent.setup();
      render(<EncounterScreen fetchFn={fakeFetch} loadCreatureFn={async () => creature} />);

      await user.click(screen.getByRole("button", { name: "+ Add" }));
      await waitFor(() => expect(screen.getByLabelText(/search/i)).toBeDefined());

      await user.type(screen.getByLabelText(/search/i), "goblin");
      expect(screen.getByText("Test Goblin")).toBeDefined();

      await user.click(screen.getByRole("button", { name: /add test goblin/i }));
      await user.click(screen.getByRole("button", { name: /^add 1 test goblin$/i }));

      await waitFor(() => {
        const combatants = Object.values(useEncounter.getState().encounter.combatants);
        expect(combatants).toHaveLength(1);
        expect(combatants[0]!.attacks).toHaveLength(1);
        expect(combatants[0]!.attacks[0]!.name).toBe("Shortsword");
        expect(combatants[0]!.saves).toEqual({ fortitude: 5, reflex: 6, will: 2 });
      });
    });
  });
});
