import { describe, expect, it } from "vitest";
import { promptsFor } from "../src/rules/prompts.js";

describe("promptsFor", () => {
  it("emits a recovery check with the computed DC at the start of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "dying", value: 2 }],
      timing: "start",
    });
    expect(p!.title).toBe("Recovery check");
    expect(p!.computation).toBe("1d20 flat check vs DC 12");
    expect(p!.derivation).toBe("DC 10 + dying 2 = 12");
    expect(p!.outcomes).toHaveLength(4);
  });

  it("emits an action-loss prompt marked as already applied", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "slowed", value: 1 }],
      timing: "start",
    });
    expect(p!.title).toContain("Lose 1 action");
    expect(p!.autoApplied).toBe("Action pool 3 → 2");
  });

  it("does not emit end-of-turn conditions at the start", () => {
    expect(
      promptsFor({
        combatantId: "c1",
        conditions: [{ slug: "frightened", value: 2 }],
        timing: "start",
      }),
    ).toEqual([]);
  });

  it("emits frightened decrement at the end of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "frightened", value: 2 }],
      timing: "end",
    });
    expect(p!.computation).toBe("frightened 2 → 1");
  });

  it("emits persistent damage with its flat check at the end of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "persistent-damage", value: 0, formula: "1d6" }],
      timing: "end",
    });
    expect(p!.computation).toContain("1d6");
    expect(p!.computation).toContain("DC 15 flat");
  });

  it("gives stable ids so acknowledgement survives re-render", () => {
    const args = {
      combatantId: "c1",
      conditions: [{ slug: "dying" as const, value: 2 }],
      timing: "start" as const,
    };
    expect(promptsFor(args)[0]!.id).toBe(promptsFor(args)[0]!.id);
    expect(promptsFor(args)[0]!.id).toBe("c1:start:dying");
  });

  it("returns prompts in a deterministic order", () => {
    const ps = promptsFor({
      combatantId: "c1",
      conditions: [
        { slug: "slowed", value: 1 },
        { slug: "dying", value: 1 },
      ],
      timing: "start",
    });
    expect(ps.map((p) => p.slug)).toEqual(["dying", "slowed"]);
  });
});
