import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Condition, GlossaryEntry } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { useEncounter } from "../src/state/store.js";
import type { FetchFn } from "../src/data/catalog.js";

describe("ActionList — Strikes merged into the action list", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("orders a Strike alongside actions by cost, and gives it the same cost pip as any other 1-action ability", () => {
    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Ogre", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 6, will: 5 }, hp: { current: 30, max: 30 },
        attacks: [
          { name: "Claw", kind: "melee", bonus: 10, traits: [],
            damage: [{ formula: "1d6+4", type: "slashing", category: null }], effects: [] },
        ],
        actions: [
          { name: "Brutal Charge", cost: "2", traits: [], frequency: null, trigger: null,
            requirements: null, description: "<p>Rushes in.</p>", category: "offensive" },
        ],
      },
      20,
    );
    render(<ActiveCombatant />);

    // No separate "Strikes" panel/heading remains.
    expect(screen.queryByText("Strikes")).toBeNull();

    // The "STRIKES THIS TURN" counter and its reset control moved to
    // TurnManager (beside "actions remaining") — ActionList no longer
    // renders either, so the two can't duplicate.
    expect(screen.queryByText("STRIKES THIS TURN")).toBeNull();
    expect(screen.queryByRole("button", { name: /^reset$/i })).toBeNull();

    // The 2-action ability leads (cost order), the Strike follows as a
    // 1-action item — both are plain buttons in the same list.
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const chargeIdx = names.findIndex((t) => t.includes("Brutal Charge"));
    const clawIdx = names.findIndex((t) => t.includes("Claw"));
    expect(chargeIdx).toBeGreaterThanOrEqual(0);
    expect(clawIdx).toBeGreaterThan(chargeIdx);

    // The Strike shows exactly one cost-pip diamond, same as any 1-action card.
    const clawButton = screen.getByRole("button", { name: /Claw/ });
    expect(clawButton.querySelectorAll("svg").length).toBe(1);
  });

  it("nests Rend under Claw with Requirements/Effect visible without expanding, matching forest-troll", () => {
    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Forest Troll", level: 5, ac: 20,
        saves: { fortitude: 17, reflex: 11, will: 7 }, hp: { current: 125, max: 125 },
        attacks: [
          { name: "Claw", kind: "melee", bonus: 14, traits: ["agile", "reach-10"],
            damage: [{ formula: "2d8+5", type: "slashing", category: null }], effects: [] },
          { name: "Jaws", kind: "melee", bonus: 14, traits: ["reach-10"],
            damage: [{ formula: "2d10+5", type: "piercing", category: null }], effects: [] },
        ],
        actions: [
          {
            name: "Rend", cost: "1", traits: [], frequency: null, trigger: null, requirements: null,
            description:
              "<p>Claw</p>\n<hr />\n<p><p>A Rend entry lists a Strike the monster has.</p>\n<p><strong>Requirements</strong> The monster hit the same enemy with two consecutive Strikes of the listed type in the same round.</p>\n<hr />\n<p><strong>Effect</strong> The monster automatically deals that Strike's damage again to the enemy.</p></p>",
            category: "offensive",
          },
        ],
      },
      19,
    );
    render(<ActiveCombatant />);

    // Rend appears exactly once — nested, not also as a top-level action.
    expect(screen.getAllByRole("button", { name: /^Rend/ })).toHaveLength(1);

    // Its Requirements and Effect are visible with no interaction needed.
    expect(screen.getByText(/hit the same enemy with two consecutive Strikes/)).toBeDefined();
    expect(screen.getByText(/automatically deals that Strike's damage again/)).toBeDefined();

    // It sits directly after Claw and before Jaws in the list.
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const clawIdx = names.findIndex((t) => t.startsWith("Claw") || t.includes("Claw2d8"));
    const rendIdx = names.findIndex((t) => t.includes("Rend"));
    const jawsIdx = names.findIndex((t) => t.includes("Jaws"));
    expect(rendIdx).toBeGreaterThan(-1);
    expect(jawsIdx).toBeGreaterThan(rendIdx);
    expect(rendIdx).toBeGreaterThan(clawIdx);
  });

  it("keeps each trait tag intact (no internal wrap) inside a tag row that itself wraps", () => {
    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Duelist", level: 2, ac: 17,
        saves: { fortitude: 8, reflex: 10, will: 6 }, hp: { current: 20, max: 20 },
        attacks: [
          { name: "Rapier", kind: "melee", bonus: 9, traits: ["agile", "deadly-d10", "finesse"],
            damage: [{ formula: "1d6+2", type: "piercing", category: null }], effects: [] },
        ],
      },
      15,
    );
    render(<ActiveCombatant />);

    const tag = screen.getByText("DEADLY D10");
    expect(tag.style.whiteSpace).toBe("nowrap");
    expect(tag.parentElement!.style.flexWrap).toBe("wrap");
  });

  it("shows rules text on hover for a trait present in the glossary/conditions, and no tooltip when absent", async () => {
    const glossary: GlossaryEntry[] = [
      { slug: "grab", name: "Grab", cost: "passive", traits: [], description: "<p>The monster can grab.</p>" },
    ];
    const conditions: Condition[] = [];
    const fetchFn: FetchFn = (url) => {
      if (url.includes("traits.json")) return Promise.resolve(new Response(JSON.stringify([])));
      if (url.includes("glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossary)));
      if (url.includes("conditions.json")) return Promise.resolve(new Response(JSON.stringify(conditions)));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    };

    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Grappler", level: 2, ac: 17,
        saves: { fortitude: 8, reflex: 10, will: 6 }, hp: { current: 20, max: 20 },
        attacks: [
          { name: "Claw", kind: "melee", bonus: 9, traits: ["grab", "unarmed"],
            damage: [{ formula: "1d6+2", type: "bludgeoning", category: null }], effects: [] },
        ],
      },
      15,
    );
    render(<ActiveCombatant fetchFn={fetchFn} />);

    await waitFor(() => expect(screen.getByText("GRAB").title).toBe("The monster can grab."));
    expect(screen.getByText("UNARMED").title).toBe("");
  });
});

describe("ActionList — unaffordable actions fold to their header line", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("hides an unaffordable action's traits and description, and never shows a needs-N label", () => {
    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Ogre", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 6, will: 5 }, hp: { current: 30, max: 30 },
        attacks: [],
        actions: [
          { name: "Brutal Charge", cost: "3", traits: ["flourish"], frequency: null, trigger: null,
            requirements: null, description: "<p>Rushes in and swings wide.</p>", category: "offensive" },
        ],
      },
      20,
    );
    const { id } = Object.values(useEncounter.getState().encounter.combatants)[0]!;

    // Affordable at a full pool: the body renders.
    const view = render(<ActiveCombatant />);
    expect(screen.getByText("Rushes in and swings wide.")).toBeTruthy();
    expect(screen.getByText("FLOURISH")).toBeTruthy();

    // One action spent leaves 2 of 3 — the 3-action ability no longer fits.
    useEncounter.getState().spendActions(id, 1);
    view.rerender(<ActiveCombatant />);

    const card = screen.getByRole("button", { name: /Brutal Charge/ });
    expect(card.getAttribute("disabled")).not.toBeNull();
    // Folded: name survives, body and traits do not.
    expect(screen.queryByText("Rushes in and swings wide.")).toBeNull();
    expect(screen.queryByText("FLOURISH")).toBeNull();
    // The old "NEEDS 3 — 2 LEFT" readout is gone for good.
    expect(card.textContent).not.toMatch(/NEEDS|LEFT/i);
  });
});
