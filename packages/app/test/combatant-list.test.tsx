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
    expect(screen.getByText("6 / 7 / 4")).toBeDefined();
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

  it("greys out a defeated combatant", () => {
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().applyDamage(id, 99);
    render(<CombatantList />);
    expect(screen.getByText("DEFEATED")).toBeDefined();
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
    const a = useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
    const b = useEncounter.getState().addCombatant(seed({ name: "Dovan" }), 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    render(<CombatantList />);

    const memberRow = screen.getByText("Akiros").closest("div[style]")!.parentElement!.parentElement as HTMLElement;
    expect(memberRow.style.borderLeft).toBe("");

    const wrapper = memberRow.parentElement!.parentElement as HTMLElement;
    expect(wrapper.style.borderLeft).toBe("3px solid oklch(0.34 0.04 200)");
  });
});
