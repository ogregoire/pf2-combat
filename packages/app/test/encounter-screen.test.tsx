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

  it("shows the XP award, which does not change with party size", () => {
    useEncounter.getState().setPlayers([
      { id: "p1", name: "A", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
      { id: "p2", name: "B", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
    ]);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByText(/80/)).toBeDefined();
    expect(screen.getByText(/XP each/i)).toBeDefined();
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
