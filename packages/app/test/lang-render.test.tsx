import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionPips } from "../src/components/ActionPips.js";
import { NextButton } from "../src/components/NextButton.js";
import { RollAssistant } from "../src/components/RollAssistant.js";
import { useEncounter } from "../src/state/store.js";

/**
 * The rest of the suite exercises `lang: "fr"` only at the store level
 * (see lang.test.tsx) — nothing ever rendered a catalogue-drawing component
 * with French selected and asserted French text actually reached the DOM.
 * That gap let a hardcoded "of" survive inside ActionPips's reasons line
 * (`${remaining} of ${pipCount} — ...`), invisible because `lang` defaults
 * to "en" everywhere else. These tests close that gap for the components
 * most likely to carry another one: a plain label (NextButton), a
 * multi-template component with conditional branches (RollAssistant), and
 * the one that actually broke (ActionPips, with a modified pool so the
 * reasons branch — not just the plain "N actions" branch — renders).
 */
describe("chrome copy in French", () => {
  beforeEach(() => {
    useEncounter.getState().reset();
    useEncounter.getState().setLang("fr");
  });

  it("renders NextButton's label and unacknowledged count in French", () => {
    render(<NextButton unacknowledgedCount={2} />);
    expect(screen.getByRole("button", { name: "Combattant suivant" })).toBeDefined();
    expect(screen.getByText("2 non validé(s)")).toBeDefined();
  });

  it("renders RollAssistant's labels, degree ladder and button in French", async () => {
    const attackerId = useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Loup", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 },
        hp: { current: 10, max: 10 },
        attacks: [
          { name: "Morsure", kind: "melee", bonus: 8, traits: [],
            damage: [{ formula: "1d6+3", type: "piercing", category: null }], effects: [] },
        ],
      },
      10,
    );
    const targetId = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    const combatant = useEncounter.getState().encounter.combatants[attackerId]!;
    const target = useEncounter.getState().encounter.combatants[targetId]!;
    const attack = combatant.attacks[0]!;

    render(<RollAssistant combatant={combatant} target={target} attack={attack} />);

    expect(screen.getByText("CIBLE")).toBeDefined();
    expect(screen.getByText("cliquez sur un combattant pour recibler")).toBeDefined();
    expect(screen.getByText("touché")).toBeDefined();
    expect(screen.getByText("coup critique")).toBeDefined();
    expect(screen.getByText("raté")).toBeDefined();
    expect(screen.getByText("raté critique")).toBeDefined();
    expect(screen.getByRole("button", { name: "Enregistrer la frappe" })).toBeDefined();
  });

  // The reported defect, verbatim: "Sur la VF, en sélectionnant une frappe,
  // je vois 4d8+10 slashing" — the roll assistant's outcome ladder composed
  // its damage text (rules/strike.ts's damageText) from the raw dataset type
  // regardless of `lang`. StrikeCard's own damage line had the identical
  // bug and is covered separately in damage-types.test.tsx; this is the
  // roll-assistant surface the GM's report actually named.
  it("names a Strike's damage type in French on the outcome ladder — the GM's own report", () => {
    const attackerId = useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Tigre-lion squelette", level: 5, ac: 19,
        saves: { fortitude: 8, reflex: 9, will: 5 },
        hp: { current: 40, max: 40 },
        attacks: [
          { name: "Griffe", kind: "melee", bonus: 12, traits: [],
            damage: [{ formula: "4d8+10", type: "slashing", category: null }], effects: [] },
        ],
      },
      10,
    );
    const targetId = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    const combatant = useEncounter.getState().encounter.combatants[attackerId]!;
    const target = useEncounter.getState().encounter.combatants[targetId]!;
    const attack = combatant.attacks[0]!;

    render(<RollAssistant combatant={combatant} target={target} attack={attack} />);

    expect(screen.getByText(/4d8\+10 tranchant/)).toBeDefined();
    expect(screen.queryByText(/slashing/)).toBeNull();
  });

  it("renders ActionPips's reasons line in French — no hardcoded English 'of' survives", () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ours", level: 1, ac: 15, saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );
    useEncounter.getState().addCondition(id, "slowed", 1);
    const combatant = useEncounter.getState().encounter.combatants[id]!;

    render(<ActionPips combatant={combatant} />);

    // With one action lost to slowed 1, the reasons branch — not the plain
    // "N actions" branch — is what renders.
    expect(screen.getByText(/2 sur 3/)).toBeDefined();
    expect(screen.queryByText(/\bof\b/)).toBeNull();
  });
});
