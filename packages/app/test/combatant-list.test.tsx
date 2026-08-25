import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Creature } from "@pf2/schema";
import { CombatantList } from "../src/components/CombatantList.js";
import { useEncounter } from "../src/state/store.js";
import type { Iwr } from "../src/rules/damage.js";

const seed = (over = {}) => ({
  kind: "creature" as const, name: "Stag Lord Bandit", level: 0, ac: 15,
  saves: { fortitude: 6, reflex: 7, will: 4 },
  hp: { current: 16, max: 16 }, ...over,
});

// Loads a real creature record from the dataset, so tests exercising the
// damage-type filter reflect the actual shapes it has to handle rather than
// a hand-picked fixture.
// Vitest runs from the repo root (see the root vitest.config.ts's `include`).
const dataDir = resolve(process.cwd(), "data/creatures");
function loadCreatureIwr(relPath: string): Iwr {
  const creature = JSON.parse(readFileSync(resolve(dataDir, relPath), "utf-8")) as Creature;
  return {
    immunities: creature.immunities.map((i) => i.type),
    weaknesses: creature.weaknesses.map((w) => ({ type: w.type, value: w.value })),
    resistances: creature.resistances.map((r) => ({ type: r.type, value: r.value })),
  };
}

describe("CombatantList", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows initiative, name, HP, AC and saves", () => {
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);
    expect(screen.getByText("19")).toBeDefined();
    expect(screen.getByText("Stag Lord Bandit")).toBeDefined();
    expect(screen.getByText("16/16")).toBeDefined();
    expect(screen.getByText(/AC 15/)).toBeDefined();
    expect(screen.getByTitle("Fortitude").textContent).toBe("F+6");
    expect(screen.getByTitle("Reflex").textContent).toBe("R+7");
    expect(screen.getByTitle("Will").textContent).toBe("W+4");
  });

  it("renders condition chips", () => {
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<CombatantList />);
    expect(screen.getByText("FRIGHTENED 2")).toBeDefined();
  });

  it("opens the popover on hover and applies damage", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "7");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(9);
  });

  // Regression guard. The combatant list is a fixed-width `overflow-y: auto`
  // scroller, and CSS forces such a box's overflow-x to `auto` as well. The
  // popover used to be `position: absolute; left: calc(100% + 10px)`, i.e.
  // entirely outside that box, so a real browser clipped it to zero visible
  // width while jsdom — which does no layout — saw nothing wrong. Portalling
  // it to document.body is what keeps it out of any scroller's clip; assert
  // the structure, since jsdom can't assert the pixels.
  it("renders the desktop popover outside the scrolling list, as a child of document.body", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    const { container } = render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));

    const panel = screen.getByLabelText("amount").closest("div[style]");
    expect(panel).not.toBeNull();
    // Not anywhere inside the rendered list subtree...
    expect(container.contains(panel)).toBe(false);
    // ...and its own top-level ancestor is document.body itself.
    let top = panel as HTMLElement;
    while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
    expect(top.parentElement).toBe(document.body);
    // Fixed positioning is the other half of escaping the scroller.
    const positioned = screen.getByLabelText("amount").closest<HTMLElement>('[style*="position: fixed"]');
    expect(positioned).not.toBeNull();
  });

  // Regression guard for the follow-up bug to the portalling above: with the
  // panel placed at `left: rect.right + 10px`, those 10px were a dead zone
  // belonging to neither the row nor the popover. Moving the pointer across
  // them fired CombatantRow's mouseleave, which closed the popover before it
  // could be reached — the panel was visible but unusable. Verified in a real
  // browser: the popover was gone by the time the pointer sat mid-gap.
  //
  // The fix is that the visual gap now lives *inside* the hovered box, as
  // left padding on a shell that starts flush with the row's right edge, so
  // there is a continuous hoverable path. jsdom does no hit-testing, so pin
  // the geometry contract instead: shell flush with the row, gap as padding.
  it("leaves no dead gap between the row and the desktop popover", async () => {
    const user = userEvent.setup();
    const rect = { top: 180, right: 331, bottom: 233, left: 8, width: 323, height: 53, x: 8, y: 180 };
    const spy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ ...rect, toJSON: () => rect } as DOMRect);
    try {
      useEncounter.getState().addCombatant(seed(), 19);
      render(<CombatantList />);

      await user.hover(screen.getByText("Stag Lord Bandit"));

      const shell = screen.getByLabelText("amount").closest<HTMLElement>('[style*="position: fixed"]');
      expect(shell).not.toBeNull();
      // Flush with the row: no horizontal strip the pointer can cross that
      // belongs to neither element.
      expect(shell!.style.left).toBe(`${rect.right}px`);
      // The offset the GM sees is padding on that same hovered box.
      expect(parseFloat(shell!.style.paddingLeft)).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  // A creature with no damage-type IWR gets no selector and no explanation
  // either: the GM asked for the "damage type is irrelevant here" line to go,
  // since an absent selector already says it and the line was pure noise on
  // the majority of creatures.
  it("shows neither the damage-type selector nor an explanation when the creature has no damage-type IWR", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);
    await user.hover(screen.getByText("Stag Lord Bandit"));
    expect(screen.queryByRole("group", { name: "damage type" })).toBeNull();
    expect(screen.queryByText(/damage type is irrelevant/i)).toBeNull();
  });

  it("shows only the relevant damage types when the creature has IWR", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        iwr: {
          immunities: ["mental", "poison"],
          weaknesses: [],
          resistances: [{ type: "cold", value: 10 }, { type: "fire", value: 10 }],
        },
      }),
      19,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    const group = screen.getByRole("group", { name: "damage type" });
    expect(group.textContent).toContain("cold");
    expect(group.textContent).toContain("fire");
    expect(group.textContent).not.toContain("bludgeoning");
  });

  it("includes physical and holy in the selector for real creatures that carry them", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      seed({
        name: "Numerian Adamantine Golem",
        iwr: loadCreatureIwr("kingmaker-bestiary/numerian-adamantine-golem.json"),
      }),
      19,
    );
    useEncounter.getState().addCombatant(
      seed({
        name: "Bloom of Lamashtu",
        iwr: loadCreatureIwr("kingmaker-bestiary/bloom-of-lamashtu.json"),
      }),
      18,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Numerian Adamantine Golem"));
    expect(screen.getByRole("group", { name: "damage type" }).textContent).toContain("physical");

    await user.hover(screen.getByText("Bloom of Lamashtu"));
    expect(screen.getByRole("group", { name: "damage type" }).textContent).toContain("holy");
  });

  it("applies resistance for the selected damage type instead of dropping it", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        hp: { current: 30, max: 30 },
        iwr: {
          immunities: [],
          weaknesses: [],
          resistances: [{ type: "cold", value: 10 }],
        },
      }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    await user.click(screen.getByRole("button", { name: "cold 10" }));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "16");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    // 16 cold damage resisted by 10 -> 6 taken, not 16.
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(24);
  });

  it("reduces damage to zero when the selected type matches an immunity", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        hp: { current: 30, max: 30 },
        iwr: { immunities: ["poison"], weaknesses: [], resistances: [] },
      }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    await user.click(screen.getByRole("button", { name: "poison IMM" }));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "20");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(30);
  });

  it("never shows the damage-type selector once Heal is pressed", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        hp: { current: 5, max: 99 },
        iwr: {
          immunities: ["mental", "poison"],
          weaknesses: [],
          resistances: [{ type: "cold", value: 10 }, { type: "fire", value: 10 }],
        },
      }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    expect(screen.getByRole("group", { name: "damage type" })).toBeDefined();

    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "3");
    await user.click(screen.getByRole("button", { name: "Heal" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(8);
    expect(screen.queryByRole("group", { name: "damage type" })).toBeNull();
  });

  it("shows a last-change indicator with before/after after applying damage, and supersedes it on the next apply", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({ name: "Stag Lord Bandit", hp: { current: 110, max: 110 } }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "14");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(96);
    expect(screen.getByText("−14")).toBeDefined();
    expect(screen.getByText(/110 → 96/)).toBeDefined();

    // A second apply supersedes rather than accumulates — only the latest
    // change is shown, not "−14" alongside a new "−9".
    await user.clear(amount);
    await user.type(amount, "9");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(87);
    expect(screen.queryByText("−14")).toBeNull();
    expect(screen.getByText("−9")).toBeDefined();
    expect(screen.getByText(/96 → 87/)).toBeDefined();
  });

  it("shows a last-change indicator in the ok colour after healing", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({ name: "Stag Lord Bandit", hp: { current: 40, max: 110 } }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "8");
    await user.click(screen.getByRole("button", { name: "Heal" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(48);
    const indicator = screen.getByText("+8");
    expect(indicator).toBeDefined();
    expect(indicator.style.color).toBe("var(--ok)");
    expect(screen.getByText(/40 → 48/)).toBeDefined();
  });

  it("shows what was actually applied and why when IWR changes the typed amount", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        hp: { current: 30, max: 30 },
        iwr: { immunities: [], weaknesses: [], resistances: [{ type: "cold", value: 10 }] },
      }),
      19,
    );
    render(<CombatantList />);

    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    await user.click(screen.getByRole("button", { name: "cold 10" }));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "30");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(10);
    // The applied total (−20), not the bare typed amount, plus the reason.
    expect(screen.getByText("−20")).toBeDefined();
    expect(screen.getByText(/30 → 10/)).toBeDefined();
    expect(screen.getByText(/30 cold, resistance 10/)).toBeDefined();
  });

  it("adds a condition through the row popover's picker", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.selectOptions(screen.getByLabelText("Condition"), "frightened");
    const value = screen.getByLabelText("Condition value");
    await user.clear(value);
    await user.type(value, "2");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 2, formula: undefined },
    ]);
    // Shows once on the row itself and once as the popover's removable chip.
    expect(screen.getAllByText("FRIGHTENED 2")).toHaveLength(2);
  });

  it("removes a condition from the popover's chip", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().addCondition(id, "prone", 0);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.click(screen.getByRole("button", { name: "Remove Prone" }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
  });

  it("carries a formula for persistent damage", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.selectOptions(screen.getByLabelText("Condition"), "persistent-damage");
    await user.type(screen.getByLabelText("Persistent damage formula"), "2d6");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "persistent-damage", value: 0, formula: "2d6" },
    ]);
  });

  it("removes a combatant from the row popover", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.click(screen.getByRole("button", { name: "Remove Stag Lord Bandit" }));

    expect(useEncounter.getState().encounter.combatants[id]).toBeUndefined();
  });

  it("edits an entry's initiative from the row popover", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.type(screen.getByLabelText("Initiative die result"), "25");
    await user.click(screen.getByRole("button", { name: /set initiative/i }));

    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBe(25);
  });

  it("shows the entry's current initiative, read-only, beside the name and HP", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    expect(screen.getByTitle("Current initiative").textContent).toBe("19");
  });

  it("shows an em dash, not the literal text \"null\", for an unrolled entry's current initiative", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), null);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    expect(screen.getByTitle("Current initiative").textContent).toBe("—");
  });

  it("adds the combatant's modifier to the die result and commits the total", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant({ ...seed(), initiativeModifier: 7 }, null);
    render(<CombatantList />);
    await user.hover(screen.getByText("Stag Lord Bandit"));

    await user.type(screen.getByLabelText("Initiative die result"), "12");
    expect(screen.getByText("12 + 7 = 19")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /set initiative/i }));
    const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
    expect(entry!.initiative).toBe(19);
    expect(entry!.orderKey).toBe(19);
  });

  // Regression test for a parked finding: the old control did
  // `Number(initiativeDraft)`, and `Number("") === 0` is finite, so blurring
  // an untouched field silently committed a rolled 0. The die-result field
  // must refuse to commit anything when it's left blank.
  it("does not commit an initiative when the die-result field is left blank", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), null);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    await user.click(screen.getByRole("button", { name: /set initiative/i }));

    const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
    expect(entry!.initiative).toBeNull();
  });

  it("collects a PC's initiative modifier once and saves it to the roster", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    const id = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: { current: 40, max: 40 }, playerId: "player1" },
      null,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));

    await user.type(screen.getByLabelText("Initiative modifier for Valeria"), "3");
    await user.type(screen.getByLabelText("Initiative die result"), "14");
    expect(screen.getByText("14 + 3 = 17")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /set initiative/i }));

    const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
    expect(entry!.initiative).toBe(17);
    expect(useEncounter.getState().players.find((p) => p.id === "player1")!.initiativeModifier).toBe(3);
  });

  /*
   * QuickAdd copies Player.initiativeModifier onto the combatant when a PC
   * joins the order. If the popover preferred that copy, correcting the
   * roster would not reach a PC already in the fight — which is exactly when
   * a GM corrects it, because they notice the modifier is wrong when a roll
   * comes out wrong, mid-fight. The roster is the declared home of a PC's
   * modifier (see Player.initiativeModifier), so the popover reads through
   * to it whenever a roster player resolves.
   */
  it("uses a corrected roster modifier for a PC already in the order, not the copy taken at add time", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: 50 },
    ]);
    const id = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: { current: 40, max: 40 },
        playerId: "player1", initiativeModifier: 50 }, // the fat-fingered value, copied in
      null,
    );

    // The GM fixes it in PartyManager, mid-fight.
    useEncounter.getState().setPlayers(
      useEncounter.getState().players.map((p) => ({ ...p, initiativeModifier: 5 })),
    );

    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));
    await user.type(screen.getByLabelText("Initiative die result"), "10");
    expect(screen.getByText("10 + 5 = 15")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /set initiative/i }));
    const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
    expect(entry!.initiative).toBe(15);
  });

  // Clearing the field in PartyManager means "unknown" (not +0), and reading
  // through means that reaches the fight too: the popover asks again rather
  // than quietly using the stale copy the combatant still carries.
  it("asks again for a PC whose roster modifier has been cleared back to unknown", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: { current: 40, max: 40 },
        playerId: "player1", initiativeModifier: 50 },
      null,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));

    await user.type(screen.getByLabelText("Initiative modifier for Valeria"), "3");
    await user.type(screen.getByLabelText("Initiative die result"), "10");
    expect(screen.getByText("10 + 3 = 13")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /set initiative/i }));
    expect(useEncounter.getState().players[0]!.initiativeModifier).toBe(3);
  });

  // The copy is not dead weight: it is what answers when there is no roster
  // player to read through to — a PC removed from the roster on their own
  // (which leaves the combatant in the order), or an old save.
  it("falls back to the combatant's own modifier when the roster entry is gone", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: { current: 40, max: 40 },
        playerId: "player1", initiativeModifier: 7 },
      null,
    ); // no such player on the roster
    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));

    await user.type(screen.getByLabelText("Initiative die result"), "10");
    expect(screen.getByText("10 + 7 = 17")).toBeDefined();
  });

  it("degrades gracefully for a PC combatant with no playerId yet", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: { current: 40, max: 40 } },
      null,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));

    // No playerId to resolve, so this behaves like a combatant whose
    // modifier is simply unknown — the die result commits unmodified,
    // and there is no roster entry to write back to.
    await user.type(screen.getByLabelText("Initiative die result"), "14");
    await user.click(screen.getByRole("button", { name: /set initiative/i }));

    const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
    expect(entry!.initiative).toBe(14);
    expect(useEncounter.getState().players).toEqual([]);
  });

  it("disables Damage and Heal when the combatant has no HP on record", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      18,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Valeria"));

    expect(screen.getByRole("button", { name: "Damage" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Heal" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/no hp on record/i)).toBeDefined();
  });

  it("greys out a defeated combatant", () => {
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().applyDamage(id, 99);
    render(<CombatantList />);
    expect(screen.getByText("DEFEATED")).toBeDefined();
  });

  it("groups two combatants through the UI — the group() action's missing call site", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed({ name: "Goblin Chief" }), 20);
    useEncounter.getState().addCombatant(seed({ name: "Goblin Minion" }), 8);
    render(<CombatantList />);

    // Selecting fewer than two rows doesn't surface the builder yet.
    expect(screen.queryByLabelText("Group name")).toBeNull();
    await user.click(screen.getByLabelText("Select Goblin Chief for grouping"));
    expect(screen.queryByLabelText("Group name")).toBeNull();
    await user.click(screen.getByLabelText("Select Goblin Minion for grouping"));

    expect(screen.getByLabelText("Group name")).toBeDefined();
    await user.type(screen.getByLabelText("Group name"), "Goblin Ambush");
    await user.type(screen.getByLabelText("Group initiative"), "14");
    await user.click(screen.getByRole("button", { name: "Create group" }));

    const enc = useEncounter.getState().encounter;
    expect(enc.entries).toHaveLength(1);
    expect(enc.entries[0]!.groupName).toBe("Goblin Ambush");
    expect(enc.entries[0]!.initiative).toBe(14);
    expect(enc.entries[0]!.combatantIds).toHaveLength(2);

    // The builder closes and the selection clears once the group is made.
    expect(screen.queryByLabelText("Group name")).toBeNull();
    expect(screen.getByText("GOBLIN AMBUSH")).toBeDefined();
  });

  it("selecting a row's checkbox doesn't also toggle it as the target", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
    render(<CombatantList />);

    await user.click(screen.getByLabelText("Select Akiros for grouping"));

    expect(useEncounter.getState().encounter.targetId).toBeNull();
  });

  it("renders a group header with its shared initiative", () => {
    const a = useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
    const b = useEncounter.getState().addCombatant(seed({ name: "Dovan" }), 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    render(<CombatantList />);
    expect(screen.getByText("GATE WATCH")).toBeDefined();
    expect(screen.getByText("15")).toBeDefined();
    expect(screen.getByText("Akiros")).toBeDefined();
    expect(screen.getByText("Dovan")).toBeDefined();
  });

  it("puts the group's left border only on the wrapper, not each member row", () => {
    // A decoy combatant above the group in initiative keeps the group from
    // being the active entry, so its border-left stays the plain group
    // colour rather than the active-entry ember — this test is about border
    // placement, not the active-row treatment (covered separately below).
    useEncounter.getState().addCombatant(seed({ name: "Scout" }), 30);
    const a = useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
    const b = useEncounter.getState().addCombatant(seed({ name: "Dovan" }), 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    render(<CombatantList />);

    const memberRow = screen.getByText("Akiros").closest("div[style]")!.parentElement!.parentElement as HTMLElement;
    expect(memberRow.style.borderLeft).toBe("");

    const wrapper = memberRow.parentElement!.parentElement as HTMLElement;
    expect(wrapper.style.borderLeft).toBe("3px solid oklch(0.34 0.04 200)");
  });

  it("highlights the active combatant row distinctly from a non-active one", () => {
    // The first entry added is at the top of initiative order, so it is
    // active by default (activeEntryIndex starts at 0).
    useEncounter.getState().addCombatant(seed({ name: "Leader" }), 20);
    useEncounter.getState().addCombatant(seed({ name: "Follower" }), 10);
    render(<CombatantList />);

    const activeRow = screen.getByRole("button", { name: "Target Leader" });
    const otherRow = screen.getByRole("button", { name: "Target Follower" });

    expect(activeRow.getAttribute("data-active")).toBe("true");
    expect(otherRow.getAttribute("data-active")).toBe("false");
    expect(activeRow.style.boxShadow).not.toBe(otherRow.style.boxShadow);
  });

  it("shows both the active and targeted treatments at once, neither overriding the other", () => {
    const id = useEncounter.getState().addCombatant(seed({ name: "Leader" }), 20);
    useEncounter.getState().setTarget(id);
    render(<CombatantList />);

    const row = screen.getByRole("button", { name: "Target Leader" });
    expect(row.getAttribute("data-active")).toBe("true");
    expect(row.getAttribute("data-targeted")).toBe("true");
    // Two layered shadows, not one replacing the other.
    expect(row.style.boxShadow.split(",")).toHaveLength(2);
  });

  // An unrolled entry is pinned above every rolled one by sortEntries, on
  // `initiative === null` alone — moveEntry writes its orderKey faithfully
  // and the sort then ignores it, so the row snaps straight back with no
  // explanation. Offering a gesture the app will not honour is worse than
  // not offering it, so the affordance goes away until the GM rolls.
  describe("dragging an unrolled row", () => {
    it("does not make an unrolled row draggable, since the sort would snap it back", () => {
      useEncounter.getState().addCombatant(seed({ name: "Rolled" }), 20);
      useEncounter.getState().addCombatant(seed({ name: "Unrolled" }), null);
      const { container } = render(<CombatantList />);

      expect(screen.getByRole("button", { name: "Target Unrolled" }).getAttribute("draggable")).not.toBe("true");
      expect(screen.getByRole("button", { name: "Target Rolled" }).getAttribute("draggable")).toBe("true");
      expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(1);

      // The grip that invites the gesture goes with it — but its box stays,
      // or the unrolled row's initiative and name would sit a column to the
      // left of every other row.
      const grips = screen.getAllByText("⠿");
      expect(grips.map((g) => g.style.visibility)).toEqual(["hidden", "visible"]); // unrolled sorts first
    });

    it("does not make an unrolled group header draggable either", () => {
      const a = useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
      const b = useEncounter.getState().addCombatant(seed({ name: "Dovan" }), 10);
      useEncounter.getState().group([a, b], "Gate Watch", null);
      const { container } = render(<CombatantList />);

      expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    });
  });

  describe("moveEntry (drag to reorder)", () => {
    it("moves an entry between two neighbours without touching any initiative", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 15);
      s.addCombatant(seed({ name: "Gamma" }), 10);
      const [, , gamma] = useEncounter.getState().encounter.entries;

      useEncounter.getState().moveEntry(gamma!.id, useEncounter.getState().encounter.entries[1]!.id);

      const order = useEncounter.getState().encounter.entries
        .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
      expect(order).toEqual(["Alpha", "Gamma", "Beta"]);
      expect(useEncounter.getState().encounter.entries.map((e) => e.initiative)).toEqual([20, 10, 15]);
    });

    it("moves an entry to the very end of the order when beforeEntryId is null", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 15);
      s.addCombatant(seed({ name: "Gamma" }), 10);
      const [alpha] = useEncounter.getState().encounter.entries;

      useEncounter.getState().moveEntry(alpha!.id, null);

      const order = useEncounter.getState().encounter.entries
        .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
      expect(order).toEqual(["Beta", "Gamma", "Alpha"]);
      // Still untouched — a drag never rewrites the rolled number.
      expect(useEncounter.getState().encounter.entries.map((e) => e.initiative)).toEqual([15, 10, 20]);
    });

    it("moves an entry to the very front of the order when dropped before the first entry", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 15);
      const gamma = s.addCombatant(seed({ name: "Gamma" }), 10);
      const [alpha] = useEncounter.getState().encounter.entries;

      const gammaEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === gamma)!.id;
      useEncounter.getState().moveEntry(gammaEntryId, alpha!.id);

      const order = useEncounter.getState().encounter.entries
        .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
      expect(order).toEqual(["Gamma", "Alpha", "Beta"]);
    });

    it("does not steal the active turn when a drag reorders entries around it", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      const beta = s.addCombatant(seed({ name: "Beta" }), 15);
      s.addCombatant(seed({ name: "Gamma" }), 10);
      useEncounter.getState().nextTurn(); // Alpha -> Beta (active)
      const [alpha] = useEncounter.getState().encounter.entries;

      // Drag Alpha (not the active entry) to the end of the order — this
      // must not hand the turn to whoever now sits at Beta's old index.
      useEncounter.getState().moveEntry(alpha!.id, null);

      const enc = useEncounter.getState().encounter;
      expect(enc.entries[enc.activeEntryIndex]!.combatantIds[0]).toBe(beta);
    });

    it("clears delayed on a dragged entry, since expiry depends on a delayed entry never moving", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 15);
      const gamma = s.addCombatant(seed({ name: "Gamma" }), 10);
      const alphaEntryId = useEncounter.getState().encounter.entries[0]!.id;

      useEncounter.getState().delay(alphaEntryId); // Alpha delays; Beta becomes active
      expect(useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!.delayed).toBe(
        true,
      );

      const gammaEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === gamma)!.id;
      useEncounter.getState().moveEntry(alphaEntryId, gammaEntryId);

      const moved = useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!;
      expect(moved.delayed).toBe(false);
      // The drag places it, but a drag never rewrites the rolled initiative
      // — unlike returning, which permanently changes it.
      expect(moved.initiative).toBe(20);
    });

    it("does nothing when an entry is dropped onto itself", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 10);
      const before = useEncounter.getState().encounter.entries.map((e) => e.id);

      useEncounter.getState().moveEntry(before[0]!, before[0]!);

      expect(useEncounter.getState().encounter.entries.map((e) => e.id)).toEqual(before);
    });

    it("does nothing when the dragged entry id no longer exists", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Alpha" }), 20);
      const before = useEncounter.getState().encounter.entries.map((e) => e.id);

      useEncounter.getState().moveEntry("no-such-entry", null);

      expect(useEncounter.getState().encounter.entries.map((e) => e.id)).toEqual(before);
    });

    // sortEntries' null-first rule (an unrolled entry always leads,
    // regardless of orderKey) is an existing invariant moveEntry must not
    // let a drag defeat — the GM can adjudicate everything Delay doesn't
    // cover, but "unrolled acts before anyone with a rolled initiative"
    // isn't the GM's call to override with a drag any more than it is with
    // a typed number.
    it("keeps an unrolled entry sorted above every rolled entry even when dropped at the very end", () => {
      const s = useEncounter.getState();
      const unrolled = s.addCombatant(seed({ name: "Unrolled" }), null);
      s.addCombatant(seed({ name: "Alpha" }), 20);
      s.addCombatant(seed({ name: "Beta" }), 10);
      const unrolledEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === unrolled)!.id;

      useEncounter.getState().moveEntry(unrolledEntryId, null);

      const order = useEncounter.getState().encounter.entries
        .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
      expect(order).toEqual(["Unrolled", "Alpha", "Beta"]);
    });

    // Regression: a drag is a placement just as authoritative as a typed
    // initiative or a Delay return — setInitiative and returnFromDelay both
    // already retire any pending "act this round instead" restore when the
    // GM places an entry by hand (see their own comments), and a drag is
    // the most explicit placement of the three. Without clearing
    // trueInitiative here, a dragged entry would sit exactly where the GM
    // dropped it right up until the next round wrap, then silently jump to
    // the typed value the GM never asked to see yet — the same failure
    // Task 8 fixed for setInitiative, arriving through a new door.
    it("clears a pending 'act this round instead' restore when the entry is dragged, so a later round wrap can't silently move it", () => {
      const s = useEncounter.getState();
      s.addCombatant(seed({ name: "Active" }), 20);
      s.addCombatant(seed({ name: "Tail" }), 5);
      // Mirrors AddCombatants' "act this round instead": the GM rolled 25,
      // but the entry is slotted in at 12 (behind Active, ahead of Tail) so
      // it still acts this round instead of waiting for the next one — 25
      // is parked in trueInitiative for the next wrap to restore.
      const newcomerId = s.addCombatant(seed({ name: "Newcomer" }), 12, 25);
      const newcomerEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === newcomerId)!.id;
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === newcomerEntryId)!.trueInitiative,
      ).toBe(25);

      // The GM instead drags Newcomer to the very end of the order.
      useEncounter.getState().moveEntry(newcomerEntryId, null);
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === newcomerEntryId)!.trueInitiative,
      ).toBeNull();

      const nameOrder = () =>
        useEncounter
          .getState()
          .encounter.entries.map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
      expect(nameOrder()).toEqual(["Active", "Tail", "Newcomer"]);

      // Active -> Tail -> Newcomer -> wraps to round 2.
      useEncounter.getState().nextTurn();
      useEncounter.getState().nextTurn();
      useEncounter.getState().nextTurn();

      // If trueInitiative had survived the drag, this wrap would restore 25
      // and re-sort Newcomer to the front — well above Active and Tail.
      // It must instead stay exactly where the GM dropped it.
      expect(nameOrder()).toEqual(["Active", "Tail", "Newcomer"]);
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === newcomerEntryId)!.initiative,
      ).toBe(12);
    });

    // Regression: initiativeBeforeDelay is only ever meant to record the
    // number an entry held immediately before a *just-happened* Delay
    // return, so the row can show it struck through. It's possible to
    // delay, return, and later delay again on the same entry without ever
    // clearing that old record (delay() itself doesn't touch it). A drag
    // that un-delays such an entry must not let that stale value resurface
    // as a struck-through initiative that has nothing to do with the drag.
    it("clears a stale initiativeBeforeDelay when a drag un-delays an entry, so no unrelated struck-through number resurfaces", () => {
      const s = useEncounter.getState();
      const alpha = s.addCombatant(seed({ name: "Alpha" }), 20);
      const beta = s.addCombatant(seed({ name: "Beta" }), 15);
      const alphaEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === alpha)!.id;

      useEncounter.getState().delay(alphaEntryId); // Alpha delays; Beta becomes active
      useEncounter.getState().returnFromDelay(alphaEntryId); // Alpha returns behind Beta
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!.initiativeBeforeDelay,
      ).toBe(20);

      useEncounter.getState().nextTurn(); // Beta -> Alpha (active again)
      useEncounter.getState().delay(alphaEntryId); // Alpha delays a second time
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!.delayed,
      ).toBe(true);
      // The stale record from the first return is still sitting there,
      // untouched by this second delay — exactly the setup that would
      // otherwise leak through a drag.
      expect(
        useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!.initiativeBeforeDelay,
      ).toBe(20);

      const betaEntryId = useEncounter
        .getState()
        .encounter.entries.find((e) => e.combatantIds[0] === beta)!.id;
      useEncounter.getState().moveEntry(alphaEntryId, betaEntryId);

      const moved = useEncounter.getState().encounter.entries.find((e) => e.id === alphaEntryId)!;
      expect(moved.delayed).toBe(false);
      expect(moved.initiativeBeforeDelay).toBeNull();
      // Still never rewritten by the drag itself.
      expect(moved.initiative).toBe(15);
    });
  });
});
