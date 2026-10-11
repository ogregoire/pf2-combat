import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndOfTurnDialog } from "../src/components/EndOfTurnDialog.js";
import { useEncounter } from "../src/state/store.js";

const ogre = {
  kind: "creature" as const, name: "Ogre", level: 3, ac: 17,
  saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 },
};

describe("end-of-turn dialog", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("lists what conditions did as the turn ended, and closes on OK", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(ogre, 20);
    useEncounter.getState().addCombatant({ ...ogre, name: "Goblin" }, 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    // A fixed formula: "4" always rolls 4.
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d1+3");
    render(<EndOfTurnDialog />);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    useEncounter.getState().nextTurn();
    const dialog = await screen.findByRole("alertdialog", { name: "End of turn" });
    expect(dialog.textContent).toContain("Ogre: Frightened 2 → 1");
    expect(dialog.textContent).toContain("Ogre takes 4 persistent damage (1d1+3)");
    expect(dialog.textContent).toContain("HP 50 → 46");
    expect(dialog.textContent).toContain("DC 15 flat check");

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("says a condition ended, in French", async () => {
    useEncounter.getState().setLang("fr");
    const id = useEncounter.getState().addCombatant(ogre, 20);
    useEncounter.getState().addCombatant({ ...ogre, name: "Gobelin" }, 10);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<EndOfTurnDialog />);
    useEncounter.getState().nextTurn();
    const dialog = await screen.findByRole("alertdialog", { name: "Fin du tour" });
    expect(dialog.textContent).toMatch(/Ogre : \S+ prend fin/);
  });

  it("stays shut when nothing happened", () => {
    useEncounter.getState().addCombatant(ogre, 20);
    useEncounter.getState().addCombatant({ ...ogre, name: "Goblin" }, 10);
    render(<EndOfTurnDialog />);
    useEncounter.getState().nextTurn();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
