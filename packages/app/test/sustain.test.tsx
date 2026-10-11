import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Spellcasting } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { __resetSpellDetailCacheForTests } from "../src/hooks/useSpellDetail.js";
import { isSustainable } from "../src/rules/sustain.js";
import { useEncounter } from "../src/state/store.js";

const spellcasting: Spellcasting[] = [{
  name: "Occult Spontaneous Spells", tradition: "occult", preparation: "spontaneous", dc: 25, attack: 17,
  slots: [{ rank: 3, max: 2 }], focusPoints: null,
  spells: [{ name: "Enthrall", rank: 3, cost: "2", cantrip: false, frequency: null, uses: null, prepared: 0, slug: "enthrall" }],
}];
const enthrall = {
  slug: "enthrall", name: "Enthrall", rank: 3, cantrip: false, traits: ["auditory", "concentrate"], traditions: ["occult"],
  cost: "2", range: "120 feet", area: null, targets: "all creatures in range", defense: { save: "will", basic: false },
  duration: "sustained", sustained: true, description: "<p>Your words fascinate your targets.</p>",
};
const fetchFn = async (url: string): Promise<Response> =>
  url.endsWith("data/spells/enthrall.json") ? new Response(JSON.stringify(enthrall)) : new Response("[]");

const add = (name: string, initiative: number): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 6, ac: 22, saves: { fortitude: 10, reflex: 14, will: 12 },
      hp: { current: 90, max: 90 }, spellcasting },
    initiative,
  );
const state = () => useEncounter.getState();

describe("Sustain", () => {
  beforeEach(() => {
    state().reset();
    __resetSpellDetailCacheForTests();
  });

  it("an effect cast this turn lasts through the next turn's end only if Sustained then", () => {
    const id = add("Grigori", 20);
    add("Goblin", 10);
    state().startSustaining(id, { kind: "spell", name: "Enthrall", slug: "enthrall", flatIndex: 0 });
    state().nextTurn(); // Grigori's turn ends: cast this turn, it runs on
    expect(state().endOfTurnReport).toBeNull();
    state().nextTurn(); // Goblin
    // Grigori's next turn: Sustain once — 1 action, and not twice.
    state().sustainEffect(id, "spell:Enthrall");
    state().sustainEffect(id, "spell:Enthrall");
    expect(state().encounter.combatants[id]!.actionsSpent).toBe(1);
    state().nextTurn();
    expect(state().encounter.combatants[id]!.sustaining).toHaveLength(1);
    state().nextTurn();
    // The turn after, no Sustain: it ends, and the dialog says so.
    state().nextTurn();
    expect(state().encounter.combatants[id]!.sustaining).toEqual([]);
    expect(state().endOfTurnReport).toEqual([
      expect.objectContaining({ kind: "sustain-ended", name: "Grigori", effect: expect.objectContaining({ name: "Enthrall" }) }),
    ]);
  });

  it("casting a sustained spell shows it under Sustaining, with its rules text, and on the caster's row", async () => {
    const user = userEvent.setup();
    add("Grigori", 20);
    render(<><ActiveCombatant fetchFn={fetchFn} /><CombatantList /></>);
    const row = screen.getAllByTestId("spell-row").find((r) => r.textContent!.includes("Enthrall"))!;
    await user.click(within(row).getByRole("button", { name: /Cast Enthrall/ }));

    const card = await screen.findByTestId("sustain-card");
    expect(card.textContent).toContain("Enthrall");
    expect(card.textContent).toContain("Sustained this turn");
    expect((within(card).getByRole("button", { name: "Sustain Enthrall (1 action)" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(card).getByRole("button", { expanded: false }));
    expect((await within(card).findByTestId("spell-details")).textContent).toContain("Your words fascinate");
    expect(screen.getByTestId("sustain-chip").textContent).toBe("Sustaining Enthrall");

    await user.click(within(card).getByRole("button", { name: "Stop sustaining Enthrall" }));
    expect(screen.queryByTestId("sustain-card")).toBeNull();
  });

  it("recognises the abilities a creature can Sustain", () => {
    expect(isSustainable("<p>The irnakurse can Sustain Soul Scream for up to 6 rounds</p>")).toBe(true);
    expect(isSustainable("Aura as long as the wild hunt hound Sustains the effect.")).toBe(true);
    expect(isSustainable("the dragon counts as having Sustained the Spell with this action")).toBe(false);
  });
});
