import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillActionsPanel } from "../src/components/SkillActionsPanel.js";
import { clearCreatureCache } from "../src/data/creatures.js";
import { defenseDc, skillModifier } from "../src/rules/skillActions.js";
import { useEncounter } from "../src/state/store.js";

const state = () => useEncounter.getState();
const record = { skills: { athletics: 12, intimidation: 9 }, abilityMods: { str: 4, dex: 1, con: 3, int: -1, wis: 1, cha: 0 } };

describe("skill actions against a target", () => {
  beforeEach(() => {
    state().reset();
    clearCreatureCache();
  });

  it("works out the DCs and the attacker's modifier, MAP and conditions included", () => {
    const ogre = state().addCombatant({ kind: "creature", name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } }, 10);
    const pc = state().addCombatant({ kind: "pc", name: "Valeria", level: 3, ac: 19, saves: { fortitude: 9, reflex: 7, will: 6 }, hp: null, initiativeModifier: 8 }, 12);
    state().addCondition(pc, "clumsy", 1);
    const target = state().encounter.combatants[pc]!;
    expect(defenseDc(target, "reflex")!.dc).toBe(16);
    expect(defenseDc(target, "perception")!.dc).toBe(18);
    state().recordStrike(ogre);
    state().addCondition(ogre, "frightened", 1);
    const ogreC = state().encounter.combatants[ogre]!;
    expect(skillModifier(record, ogreC, "athletics", true)!.mod).toBe(12 - 5 - 1);
    expect(skillModifier(record, ogreC, "intimidation", false)!.mod).toBe(8);
    // Untrained: the attribute modifier.
    expect(skillModifier(record, ogreC, "deception", false)!.mod).toBe(-1);
  });

  it("lists each action with the chances, for a creature attacker", async () => {
    const ogre = state().addCombatant({ kind: "creature", name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 }, creatureId: "b/ogre" }, 10);
    const pc = state().addCombatant({ kind: "pc", name: "Valeria", level: 3, ac: 19, saves: { fortitude: 9, reflex: 7, will: 6 }, hp: null }, 12);
    const fetchFn = async (url: string): Promise<Response> => {
      if (url.includes("creatures/b/ogre.json")) return new Response(JSON.stringify(record));
      if (url.endsWith("data/actions.json"))
        return new Response(JSON.stringify([{ slug: "trip", name: "Trip", cost: "1", traits: ["attack"], category: "skill", description: "" }]));
      return new Response(url.includes("i18n") ? "{}" : "[]");
    };
    render(<SkillActionsPanel combatant={state().encounter.combatants[ogre]!} target={state().encounter.combatants[pc]!} fetchFn={fetchFn} />);
    const trip = await screen.findByText("Trip");
    const row = trip.closest("[data-testid=skill-action-row]")!;
    await screen.findAllByText(/thletics \+12/);
    expect(row.textContent).toContain("vs Reflex DC 17");
    // +12 vs 17: success on 5+, crit on 15+.
    expect(row.textContent).toContain("CS 30%");
    expect(row.textContent).toContain("S 50%");
  });
});
