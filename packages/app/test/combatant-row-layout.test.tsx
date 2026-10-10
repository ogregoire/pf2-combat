import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CombatantList } from "../src/components/CombatantList.js";
import { DefenseSummary } from "../src/components/DefenseSummary.js";
import { useEncounter } from "../src/state/store.js";

// Regression coverage for a real-use layout bug: the HP bar was
// `width: "100%"` + `flexShrink: 0` inside a flex row shared with the
// `{current}/{max}` text, so the bar claimed the whole line and shoved the
// number out past its box. The bar and the saves now live in DefenseSummary
// (the roll assistant's target picker and target box), not the list rows.
//
// jsdom performs no real layout (no flexbox measurement, no overlap
// detection), so these tests can't assert pixels don't collide. Instead
// they pin the *style contract* that prevents the collision in a real
// browser: the bar grows and is allowed to shrink (flex-grow: 1,
// flex-shrink: 1, min-width: 0) while the number next to it refuses to
// shrink or wrap (flex-shrink: 0, white-space: nowrap).

const seed = (over = {}) => ({
  kind: "creature" as const, name: "Stag Lord Bandit", level: 0, ac: 15,
  saves: { fortitude: 6, reflex: 7, will: 4 },
  hp: { current: 16, max: 16 }, ...over,
});

function renderSummary(over = {}, width?: string): void {
  const id = useEncounter.getState().addCombatant(seed(over), 19);
  const combatant = useEncounter.getState().encounter.combatants[id]!;
  render(width ? <div style={{ width }}><DefenseSummary combatant={combatant} /></div> : <DefenseSummary combatant={combatant} />);
}

describe("DefenseSummary HP bar layout", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("HP bar grows/shrinks and the HP number stays fixed and unwrapped", () => {
    renderSummary();

    const hpText = screen.getByText("16/16");
    expect(hpText.style.flexShrink).toBe("0");
    expect(hpText.style.whiteSpace).toBe("nowrap");

    const bar = hpText.previousElementSibling as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.flexGrow).toBe("1");
    expect(bar.style.flexShrink).toBe("1");
    expect(bar.style.minWidth).toBe("0");
    // The bar must not also carry a fixed width — that's what caused the
    // original bug (width: 100% + flexShrink: 0).
    expect(bar.style.width).toBe("");
  });

  it("holds together with the widest realistic values (The Stag Lord: HP 110/110, AC 23, saves 15/16/9) in the 380px roll assistant column", () => {
    renderSummary(
      {
        name: "The Stag Lord",
        level: 6,
        ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 },
      },
      "380px",
    );

    const hpText = screen.getByText("110/110");
    expect(hpText.style.flexShrink).toBe("0");
    expect(hpText.style.whiteSpace).toBe("nowrap");
    expect(screen.getByRole("img", { name: "AC 23" })).toBeDefined();
    // Letter and value are separate elements (bold letter, regular value) —
    // the style contract jsdom can check is that the whole saves line
    // refuses to wrap, same reasoning as the HP number above.
    expect(screen.getByTitle("Fortitude").textContent).toBe("F+15");
    expect(screen.getByTitle("Reflex").textContent).toBe("R+16");
    expect(screen.getByTitle("Will").textContent).toBe("W+9");
    const savesLine = screen.getByTitle("Fortitude").parentElement as HTMLElement;
    expect(savesLine.style.whiteSpace).toBe("nowrap");
  });
});

describe("DefenseSummary saves", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("labels each save with a bold initial, a signed value, and names the full save on hover via title", () => {
    renderSummary();

    const fort = screen.getByTitle("Fortitude");
    expect(fort.textContent).toBe("F+6");
    expect(fort.getAttribute("aria-label")).toBe("Fortitude +6");
    const fortLetter = fort.firstElementChild as HTMLElement;
    expect(fortLetter.textContent).toBe("F");
    expect(fortLetter.style.fontWeight).toBe("700");

    const reflex = screen.getByTitle("Reflex");
    expect(reflex.textContent).toBe("R+7");
    expect(reflex.getAttribute("aria-label")).toBe("Reflex +7");

    const will = screen.getByTitle("Will");
    expect(will.textContent).toBe("W+4");
    expect(will.getAttribute("aria-label")).toBe("Will +4");
  });

  // The reported defect: in French the target picker read "F +6, R +7,
  // W +4" — the hover named the save in French, but the visible letter was
  // a hardcoded English one.
  it("abbreviates the saves the French way (Vig, Réf, Vol) when lang is fr", () => {
    useEncounter.getState().setLang("fr");
    renderSummary();

    const line = screen.getByTitle("Vigueur").parentElement as HTMLElement;
    expect(line.textContent).toBe("Vig+6, Réf+7, Vol+4");
    expect(screen.getByTitle("Réflexes").getAttribute("aria-label")).toBe("Réflexes +7");
  });

  it("separates the three units with a real comma and a space", () => {
    renderSummary();

    const line = screen.getByTitle("Fortitude").parentElement as HTMLElement;
    expect(line.textContent).toBe("F+6, R+7, W+4");
  });
});

describe("CombatantRow initiative display", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("renders an em dash, not a zero, for a combatant with no initiative yet", () => {
    // level: 1, not the seed's default 0 — a level-0 creature's own level
    // badge renders the bare text "0" next to its name, which would give
    // queryByText("0") a false hit unrelated to the initiative cell below.
    useEncounter.getState().addCombatant(seed({ level: 1 }), null);
    render(<CombatantList />);
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.queryByText("0")).toBeNull();
  });
});
