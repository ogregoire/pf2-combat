import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Spellcasting } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { DefenseSummary } from "../src/components/DefenseSummary.js";
import { TurnManager } from "../src/components/TurnManager.js";
import { canDelayOrReady, canReact, conditionModifiers, stupefiedCastDc } from "../src/rules/conditions.js";
import { useEncounter } from "../src/state/store.js";

const spellcasting: Spellcasting[] = [{
  name: "Occult Spontaneous Spells", tradition: "occult", preparation: "spontaneous", dc: 25, attack: 17,
  slots: [{ rank: 1, max: 3 }], focusPoints: null,
  spells: [
    { name: "Fear", slug: "fear", rank: 1, cost: "2", cantrip: false, frequency: null, uses: null, prepared: 0 },
    { name: "Feather Fall", slug: "feather-fall", rank: 1, cost: "reaction", cantrip: false, frequency: null, uses: null, prepared: 0 },
  ],
}];

const add = (name: string, initiative: number, extra: object = {}): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 3, ac: 18, saves: { fortitude: 9, reflex: 7, will: 6 }, hp: { current: 40, max: 40 },
      reactions: [{ name: "Attack of Opportunity", trigger: "A creature moves away." }],
      actions: [{ name: "Attack of Opportunity", cost: "reaction", traits: [], frequency: null, trigger: "A creature moves away.",
        requirements: null, description: "<p>Strike.</p>", category: "offensive" }],
      ...extra },
    initiative,
  );
const get = (id: string) => useEncounter.getState().encounter.combatants[id]!;

describe("rules", () => {
  it("confused: no reactions, no Delay or Ready, and off-guard", () => {
    const confused = [{ slug: "confused" as const, value: 0 }];
    expect(canReact(confused)).toBe(false);
    expect(canDelayOrReady(confused)).toBe(false);
    expect(conditionModifiers(confused, "ac").map((m) => m.value)).toEqual([-2]);
  });

  it("can't react while unable to act, through implied conditions too (dying -> unconscious)", () => {
    expect(canReact([{ slug: "dying", value: 1 }])).toBe(false);
    expect(canReact([{ slug: "frightened", value: 2 }])).toBe(true);
  });

  it("stupefied lowers Will, Perception and spells, and sets the flat check to cast", () => {
    const stupefied = [{ slug: "stupefied" as const, value: 2 }];
    for (const s of ["will", "perception", "spell"] as const) expect(conditionModifiers(stupefied, s).map((m) => m.value)).toEqual([-2]);
    expect(conditionModifiers(stupefied, "fortitude")).toEqual([]);
    expect(stupefiedCastDc(stupefied)).toBe(7);
    expect(stupefiedCastDc([])).toBeNull();
  });

  it("frightened lowers spell DCs and attacks like every other check", () => {
    expect(conditionModifiers([{ slug: "frightened", value: 1 }], "spell").map((m) => m.value)).toEqual([-1]);
  });
});

describe("confused in the app", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("disables its reactions and Delay, and drops it from the reactions-ready list", async () => {
    const user = userEvent.setup();
    const id = add("Bandit", 20, { spellcasting });
    useEncounter.getState().addCondition(id, "confused", 0);
    render(
      <>
        <div data-testid="active-actions">
          <ActiveCombatant />
        </div>
        <TurnManager />
      </>,
    );
    await user.click(within(screen.getByTestId("active-actions")).getByText("Attack of Opportunity"));
    expect((screen.getByRole("button", { name: "Use reaction" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cast Feather Fall" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Delay" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("0 ready")).toBeDefined();
  });

  it("offers the DC 11 recovery check when it takes damage, and ends the condition from there", async () => {
    const user = userEvent.setup();
    const id = add("Bandit", 20);
    useEncounter.getState().addCondition(id, "confused", 0);
    render(<CombatantList />);
    await user.hover(screen.getByText("Bandit"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    const prompt = within(screen.getByTestId("confused-recovery"));
    expect(prompt.getByText(/DC 11 flat check/)).toBeDefined();
    await user.click(prompt.getByRole("button", { name: "Recovered" }));
    expect(get(id).conditions.some((c) => c.slug === "confused")).toBe(false);
  });

  it("shows a confused target's AC lowered by off-guard", () => {
    const id = add("Bandit", 20);
    act(() => useEncounter.getState().addCondition(id, "confused", 0));
    render(<DefenseSummary combatant={get(id)} />);
    expect(screen.getByRole("img", { name: "AC 16" })).toBeDefined();
  });
});

describe("stupefied in the app", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("lowers the spell DC and attack shown, and warns about the flat check to cast", async () => {
    const id = add("Grigori", 20, { spellcasting });
    useEncounter.getState().addCondition(id, "stupefied", 2);
    render(<ActiveCombatant />);
    expect(screen.getByText(/DC 23, attack \+15/)).toBeDefined();
    expect(screen.getByTestId("stupefied-cast-warning").textContent).toContain("DC 7 flat check");
  });

  it("shows a stupefied target's Will save lowered", () => {
    const id = add("Bandit", 20);
    useEncounter.getState().addCondition(id, "stupefied", 2);
    render(<DefenseSummary combatant={get(id)} />);
    expect(screen.getByTitle(/Will \(-2 stupefied 2\)/).textContent).toBe("W+4");
    expect(screen.getByTitle("Fortitude").textContent).toBe("F+9");
  });
});
