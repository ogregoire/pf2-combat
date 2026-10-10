import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StandardAction } from "@pf2/schema";
import type { FetchFn } from "../src/data/catalog.js";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { useEncounter } from "../src/state/store.js";

const actions: StandardAction[] = [
  { slug: "shove", name: "Shove", cost: "1", category: "skill", traits: ["attack"], description: "<p>You push a creature away from you.</p>" },
  { slug: "stride", name: "Stride", cost: "1", category: "basic", traits: ["move"], description: "<p>You move up to your Speed.</p>" },
  { slug: "ready", name: "Ready", cost: "2", category: "basic", traits: ["concentrate"], description: "<p>You prepare to use an action.</p>" },
  { slug: "aid", name: "Aid", cost: "reaction", category: "basic", traits: [], description: "<p>You try to help your ally.</p>" },
  { slug: "release", name: "Release", cost: "free", category: "basic", traits: ["manipulate"], description: "<p>You let go.</p>" },
];

const fetchFn: FetchFn = (url) => {
  // The French file first: both paths end in "/actions.json".
  if (url.endsWith("i18n/fr/actions.json"))
    return Promise.resolve(new Response(JSON.stringify({ shove: { name: "Pousser", description: "<p>Vous poussez une créature.</p>" } })));
  if (url.endsWith("/actions.json")) return Promise.resolve(new Response(JSON.stringify(actions)));
  return Promise.resolve(new Response("[]"));
};

const add = (name: string, initiative: number): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 1, ac: 15, saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
    initiative,
  );

describe("StandardActions", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("starts folded, and lists basic and skill actions once unfolded, each card folded too", async () => {
    const user = userEvent.setup();
    add("Bandit", 20);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    const heading = await screen.findByRole("button", { name: /standard actions/i });
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Shove")).toBeNull();

    await user.click(heading);
    const section = within(screen.getByTestId("standard-actions"));
    expect(section.getByText("BASIC ACTIONS")).toBeDefined();
    expect(section.getByText("SKILL ACTIONS")).toBeDefined();
    expect(section.getByText("Shove")).toBeDefined();
    // Folded: no rules text until the card is opened.
    expect(section.queryByText("You push a creature away from you.")).toBeNull();
  });

  it("spends the action from the folded card", async () => {
    const user = userEvent.setup();
    const id = add("Bandit", 20);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await user.click(await screen.findByRole("button", { name: /standard actions/i }));
    const section = within(screen.getByTestId("standard-actions"));

    const shove = section.getByText("Shove").closest("[role=button]") as HTMLElement;
    await user.click(within(shove).getByRole("button", { name: "Use 1 action" }));
    expect(useEncounter.getState().encounter.combatants[id]!.actionsSpent).toBe(1);
    expect(section.queryByText("You push a creature away from you.")).toBeNull();

    // Two actions left: Ready (2) still affordable; after another, not.
    await user.click(within(shove).getByRole("button", { name: "Use 1 action" }));
    const ready = section.getByText("Ready").closest("[role=button]") as HTMLElement;
    expect((within(ready).getByRole("button", { name: "Use 2 actions" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("spends the reaction for a reaction, and gives a free action no Use button", async () => {
    const user = userEvent.setup();
    const id = add("Bandit", 20);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await user.click(await screen.findByRole("button", { name: /standard actions/i }));
    const section = within(screen.getByTestId("standard-actions"));
    const aid = section.getByText("Aid").closest("[role=button]") as HTMLElement;
    await user.click(within(aid).getByRole("button", { name: /reaction/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.reactionSpent).toBe(true);
    const release = section.getByText("Release").closest("[role=button]") as HTMLElement;
    expect(within(release).queryByRole("button", { name: /^Use/ })).toBeNull();
  });

  it("folds back up when the turn passes", async () => {
    const user = userEvent.setup();
    add("Bandit", 20);
    add("Wolf", 10);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await user.click(await screen.findByRole("button", { name: /standard actions/i }));
    expect(screen.getByText("Shove")).toBeDefined();
    act(() => useEncounter.getState().nextTurn());
    expect(screen.queryByText("Shove")).toBeNull();
  });

  it("names the actions in French", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    add("Bandit", 20);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await user.click(await screen.findByRole("button", { name: /actions standard/i }));
    await waitFor(() => expect(screen.getByText("Pousser")).toBeDefined());
  });
});
