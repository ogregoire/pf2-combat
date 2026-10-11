import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { abilityDcShift, shiftProseDcs } from "../src/rules/abilityDc.js";
import { renderMarkers, shiftedDc } from "../src/rules/renderMarkers.js";
import { useEncounter } from "../src/state/store.js";

const state = () => useEncounter.getState();
const label = (k: "elite" | "weak") => (k === "elite" ? "Elite" : "Weak");

describe("DCs in ability text", () => {
  beforeEach(() => state().reset());

  it("move with elite/weak and frightened, but not a flat check's", () => {
    const shift = abilityDcShift({ conditions: [{ slug: "frightened", value: 1 }], adjustment: { kind: "elite" } }, "Its DCs", label)!;
    expect(shift.value).toBe(1);
    expect(shift.hover).toBe("Its DCs +1\n+2 Elite\n−1 frightened 1");
    const html = renderMarkers("@Check[will|dc:28] and @Check[flat|dc:11]", "en", shift);
    expect(html).toContain(`DC ${shiftedDc(28, shift)} Will save`);
    expect(html).toContain("DC 11 flat check");
    expect(html).toContain(">29</span>");
    expect(shiftProseDcs("<p>a DC 20 Reflex save, DC 5 flat check</p>", shift, "en", (dc) => `[${dc + 1}]`)).toBe("<p>a DC [21] Reflex save, DC 5 flat check</p>");
    expect(abilityDcShift({ conditions: [] }, "Its DCs", label)).toBeNull();
  });

  it("show on the creature's ability cards", async () => {
    const user = userEvent.setup();
    const id = state().addCombatant(
      { kind: "creature", name: "Dragon", level: 8, ac: 27, saves: { fortitude: 17, reflex: 14, will: 15 }, hp: { current: 150, max: 150 },
        actions: [{ name: "Frightful Presence", cost: "passive", traits: ["aura"], frequency: null, trigger: null, requirements: null, category: "defensive", description: "<p>90 feet. @Check[will|dc:26]</p>" }] },
      20,
    );
    state().setAdjustment(id, "weak");
    render(<ActiveCombatant />);
    await user.click(screen.getByText("Frightful Presence"));
    const dc = screen.getByText("24");
    expect(dc.style.color).toBe("var(--danger)");
    expect(dc.getAttribute("data-hover")).toBe("Its DCs −2\n−2 Weak");
  });
});
