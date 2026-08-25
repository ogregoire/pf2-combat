import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CombatantList } from "../src/components/CombatantList.js";
import { useEncounter } from "../src/state/store.js";

// Regression coverage for a real-use layout bug: the standalone row's HP
// bar was `width: "100%"` + `flexShrink: 0` inside a flex row shared with
// the `{current}/{max}` text, so the bar claimed the whole line and shoved
// the number out past the row, overlapping the AC/saves column to its
// right (see CombatantRow.tsx's HpBar and StandaloneRow).
//
// jsdom performs no real layout (no flexbox measurement, no overlap
// detection), so these tests can't assert pixels don't collide. Instead
// they pin the *style contract* that prevents the collision in a real
// browser: the bar grows and is allowed to shrink (flex-grow: 1,
// flex-shrink: 1, min-width: 0) while the number next to it refuses to
// shrink or wrap (flex-shrink: 0, white-space: nowrap) — matching
// mockups/Main.dc.html's standalone-row bar (`flex-grow: 1`).

const seed = (over = {}) => ({
  kind: "creature" as const, name: "Stag Lord Bandit", level: 0, ac: 15,
  saves: { fortitude: 6, reflex: 7, will: 4 },
  hp: { current: 16, max: 16 }, ...over,
});

describe("CombatantRow HP bar layout", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("standalone row: HP bar grows/shrinks and the HP number stays fixed and unwrapped", () => {
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

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

  it("grouped member row: HP bar keeps its fixed width per Main.dc.html (width: 46px)", () => {
    const a = useEncounter.getState().addCombatant(seed({ name: "Akiros", hp: { current: 16, max: 16 } }), 20);
    const b = useEncounter.getState().addCombatant(seed({ name: "Dovan", hp: { current: 18, max: 30 } }), 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    render(<CombatantList />);

    const hpText = screen.getByText("18/30");
    const bar = hpText.previousElementSibling as HTMLElement;
    expect(bar.style.width).toBe("46px");
    expect(bar.style.flexShrink).toBe("0");
  });

  it("holds together with the widest realistic values (The Stag Lord: HP 110/110, AC 23, saves 15/16/9) in the 340px combatant list", () => {
    useEncounter.getState().addCombatant(
      seed({
        name: "The Stag Lord",
        level: 6,
        ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 },
      }),
      19,
    );
    render(
      <div style={{ width: "340px" }}>
        <CombatantList />
      </div>,
    );

    // All of these must render as single, whole, unbroken text nodes —
    // if the bar had crowded the number, "110/110" would still be present
    // as text (jsdom doesn't clip), so the real assertion is the style
    // contract above; this just confirms the worst-case row renders
    // without throwing and without truncating any of the numbers.
    const hpText = screen.getByText("110/110");
    expect(hpText.style.flexShrink).toBe("0");
    expect(hpText.style.whiteSpace).toBe("nowrap");
    expect(screen.getByText("AC 23")).toBeDefined();
    // Letter and value are separate elements now (bold letter, regular
    // value) — the style contract jsdom can check is that the whole saves
    // line refuses to wrap, same reasoning as the HP number above.
    expect(screen.getByTitle("Fortitude").textContent).toBe("F+15");
    expect(screen.getByTitle("Reflex").textContent).toBe("R+16");
    expect(screen.getByTitle("Will").textContent).toBe("W+9");
    const savesLine = screen.getByTitle("Fortitude").parentElement as HTMLElement;
    expect(savesLine.style.whiteSpace).toBe("nowrap");
  });
});

describe("CombatantRow saves", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("labels each save with a bold initial, a signed value, and names the full save on hover via title", () => {
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

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

  it("separates the three units with a real comma and a space", () => {
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    const line = screen.getByTitle("Fortitude").parentElement as HTMLElement;
    expect(line.textContent).toBe("F+6, R+7, W+4");
  });
});
