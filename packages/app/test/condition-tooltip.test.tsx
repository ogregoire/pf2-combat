import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConditionChips, DefenseSummary } from "../src/components/DefenseSummary.js";
import { annotateConditions } from "../src/rules/annotateConditions.js";
import { conditionEffects } from "../src/rules/conditionEffects.js";
import { CONDITIONS, type ConditionSlug } from "../src/rules/conditions.js";
import { useEncounter } from "../src/state/store.js";

describe("conditionEffects", () => {
  it("summarises what a condition does at its value", () => {
    expect(conditionEffects([{ slug: "frightened", value: 2 }])).toEqual([{ target: { kind: "all" }, value: -2 }]);
    expect(conditionEffects([{ slug: "clumsy", value: 1 }])).toEqual([
      { target: { kind: "ac" }, value: -1 },
      { target: { kind: "save", save: "reflex" }, value: -1 },
      { target: { kind: "skills", attribute: "dex" }, value: -1 },
      { target: { kind: "strikes", attribute: "dex" }, value: -1 },
    ]);
    expect(conditionEffects([{ slug: "unconscious", value: 0 }])).toEqual([
      { target: { kind: "ac" }, value: -6 },
      { target: { kind: "save", save: "reflex" }, value: -4 },
      { target: { kind: "perception" }, value: -4 },
    ]);
    expect(conditionEffects([{ slug: "prone", value: 0 }])).toEqual([
      { target: { kind: "ac" }, value: -2 },
      { target: { kind: "attacks" }, value: -2 },
    ]);
    expect(conditionEffects([{ slug: "enfeebled", value: 3 }])).toContainEqual({ target: { kind: "damage" }, value: -3 });
  });
});

describe("annotateConditions", () => {
  const nameOf = (slug: ConditionSlug): string => CONDITIONS[slug].name;
  const tip = (slug: ConditionSlug, value: number | null): string => `${slug}:${value}`;

  it("marks conditions named in rules text, with their value, leaving markup alone", () => {
    const html = annotateConditions('<p>The target is <strong>Frightened 2</strong> and flat-footed.</p><a title="Frightened">x</a>', "en", nameOf, tip);
    expect(html).toContain('title="frightened:2"');
    expect(html).toContain('data-condition="off-guard" title="off-guard:null"');
    expect(html).toContain('<a title="Frightened">');
  });

  it("leaves an everyday word alone unless it is capitalised", () => {
    expect(annotateConditions("a hidden door", "en", nameOf, tip)).toBe("a hidden door");
    expect(annotateConditions("you become Hidden", "en", nameOf, tip)).toContain('data-condition="hidden"');
  });

  it("reads French, feminine and plural forms included", () => {
    const fr = (slug: ConditionSlug): string => (slug === "frightened" ? "Effrayé" : CONDITIONS[slug].name);
    const html = annotateConditions("La cible est effrayée 1.", "fr", fr, tip);
    expect(html).toContain('title="frightened:1"');
    expect(html).toContain(">effrayée 1</span>");
  });
});

describe("a condition chip's hover text", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("gives the value applied, then the rules text", () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } },
      10,
    );
    useEncounter.getState().addCondition(id, "frightened", 2);
    useEncounter.getState().addCondition(id, "drained", 1);
    render(<ConditionChips combatant={useEncounter.getState().encounter.combatants[id]!} />);
    const frightened = screen.getByText("FRIGHTENED 2").getAttribute("title")!;
    expect(frightened.split("\n").slice(0, 3)).toEqual([
      "Frightened 2",
      "All checks and DCs −2",
      "Goes down by 1 at the end of each of its turns",
    ]);
    const drained = screen.getByText("DRAINED 1").getAttribute("title")!;
    expect(drained).toContain("Fortitude −1");
    expect(drained).toContain("Lost 3 HP and max HP (3 × 1)");
  });
});

describe("a petrified target", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows AC 9 in red, and says so on hover", () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } },
      10,
    );
    useEncounter.getState().addCondition(id, "petrified", 0);
    render(<DefenseSummary combatant={useEncounter.getState().encounter.combatants[id]!} />);
    const shield = screen.getByRole("img", { name: "AC 9" });
    expect(shield.querySelector("text")!.getAttribute("fill")).toBe("var(--danger)");
    expect(screen.getByText("PETRIFIED").getAttribute("title")).toContain("AC 9");
  });
});

describe("the action total under quickened and slowed", () => {
  beforeEach(() => useEncounter.getState().reset());
  const ogre = { kind: "creature" as const, name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } };

  it("shows 4 in green, named in French", async () => {
    const { ActionPips } = await import("../src/components/ActionPips.js");
    vi.stubGlobal("fetch", async (url: string) =>
      new Response(
        url.endsWith("i18n/fr/conditions.json")
          ? JSON.stringify({ quickened: { name: "Accéléré", description: "<p>Vous gagnez 1 action.</p>" } })
          : url.endsWith("data/conditions.json")
            ? JSON.stringify([{ slug: "quickened", name: "Quickened", description: "<p>You gain 1 action.</p>", isValued: false }])
            : url.includes("/i18n/") ? "{}" : "[]",
      ),
    );
    useEncounter.getState().setLang("fr");
    const id = useEncounter.getState().addCombatant(ogre, 10);
    useEncounter.getState().addCondition(id, "quickened", 0);
    render(<ActionPips combatant={useEncounter.getState().encounter.combatants[id]!} />);
    expect(screen.getByText("4").style.color).toBe("var(--ok)");
    await waitFor(() => expect(document.body.textContent).toContain("4 sur 4 — accéléré"));
    vi.unstubAllGlobals();
  });

  it("shows a slowed total in red", async () => {
    const { ActionPips } = await import("../src/components/ActionPips.js");
    const id = useEncounter.getState().addCombatant(ogre, 10);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<ActionPips combatant={useEncounter.getState().encounter.combatants[id]!} />);
    expect(screen.getByText("2", { selector: "span[style*='font-weight']" }).style.color).toBe("var(--danger)");
    expect(document.body.textContent).toContain("2 of 2 — slowed 1");
  });
});
