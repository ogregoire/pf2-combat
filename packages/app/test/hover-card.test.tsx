import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { hover, HoverLayer } from "../src/components/HoverCard.js";
import { useEncounter } from "../src/state/store.js";

describe("hover card", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the heading, the facts with their numbers coloured, and the rules text, then goes on leaving", async () => {
    const user = userEvent.setup();
    render(
      <>
        <span {...hover("Frightened 2\nAll checks and DCs −2\n\nYou're gripped by fear.\nIt goes down.")}>chip</span>
        <span>elsewhere</span>
        <HoverLayer />
      </>,
    );
    await user.hover(screen.getByText("chip"));
    const card = await screen.findByRole("tooltip");
    expect(card.textContent).toBe("Frightened 2All checks and DCs −2You're gripped by fear.It goes down.");
    expect(screen.getByText("−2").style.color).toBe("var(--danger)");
    expect(card.querySelectorAll("p")).toHaveLength(2);
    await user.unhover(screen.getByText("chip"));
    await user.hover(screen.getByText("elsewhere"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("works on markup rendered as HTML too", async () => {
    const user = userEvent.setup();
    render(
      <>
        <div dangerouslySetInnerHTML={{ __html: 'The target is <span data-hover="Off-Guard&#10;AC −2">off-guard</span>.' }} />
        <HoverLayer />
      </>,
    );
    await user.hover(screen.getByText("off-guard"));
    expect((await screen.findByRole("tooltip")).textContent).toBe("Off-GuardAC −2");
  });
});

describe("the stats panel", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the active combatant's conditions under its name", () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } },
      10,
    );
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<ActiveCombatant />);
    expect(screen.getByTestId("statblock-conditions").textContent).toContain("FRIGHTENED 2");
  });
});
