import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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

  it("hides the damage-type selector when the creature has no damage-type IWR", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);
    await user.hover(screen.getByText("Stag Lord Bandit"));
    expect(screen.queryByRole("group", { name: "damage type" })).toBeNull();
    expect(screen.getByText(/damage type is irrelevant/i)).toBeDefined();
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
    const initiative = screen.getByLabelText("Initiative");
    await user.clear(initiative);
    await user.type(initiative, "25");
    await user.tab();

    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBe(25);
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

    expect(screen.getByText("2 selected")).toBeDefined();
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
});
