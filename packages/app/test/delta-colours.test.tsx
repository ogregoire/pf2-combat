import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { DefenseSummary } from "../src/components/DefenseSummary.js";
import { deltaColor } from "../src/components/deltaTone.js";
import { useEncounter } from "../src/state/store.js";

const stagLord = {
  kind: "creature" as const, name: "The Stag Lord", level: 6, ac: 23,
  saves: { fortitude: 15, reflex: 16, will: 9 },
  hp: { current: 78, max: 110 },
  attacks: [
    { name: "Longsword", kind: "melee", bonus: 15, traits: [],
      damage: [{ formula: "1d8+5", type: "slashing", category: null }], effects: [] },
  ],
  actions: [],
};
const target = {
  kind: "pc" as const, name: "Valeria", level: 4, ac: 21,
  saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null,
};

describe("adjusted values are green above normal, red below", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("maps a delta to its colour", () => {
    expect(deltaColor(2)).toBe("var(--ok)");
    expect(deltaColor(-1)).toBe("var(--danger)");
    expect(deltaColor(0)).toBeUndefined();
  });

  it("colours a lowered AC and save red, and leaves the others alone", () => {
    const id = useEncounter.getState().addCombatant(target, 10);
    useEncounter.getState().addCondition(id, "off-guard", 0);
    useEncounter.getState().addCondition(id, "drained", 1);
    const valeria = useEncounter.getState().encounter.combatants[id]!;
    render(<DefenseSummary combatant={valeria} />);
    expect(screen.getByRole("img", { name: "AC 19" }).querySelector("text")!.getAttribute("fill")).toBe("var(--danger)");
    expect((screen.getByLabelText("Fortitude +9") as HTMLElement).style.color).toBe("var(--danger)");
    expect((screen.getByLabelText("Reflex +12") as HTMLElement).style.color).toBe("");
  });

  it("colours the Strike ladder, the malus in the formula, the total and the roll red under frightened", async () => {
    const user = userEvent.setup();
    const sid = useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    useEncounter.getState().addCondition(sid, "frightened", 1);
    render(<ActiveCombatant />);

    expect(screen.getByText("+14").style.color).toBe("var(--danger)");
    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    // The ledger: the Strike's own +15 stays ink, frightened's −1 is red.
    expect(screen.getByText("+15").style.color).toBe("");
    expect(screen.getByText("−1").style.color).toBe("var(--danger)");
    expect(screen.getByText("1d20 + 14").style.color).toBe("var(--danger)");
  });
});
