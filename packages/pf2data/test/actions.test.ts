import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeActions } from "../src/normalize/actions.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeActions", () => {
  it("maps a reaction and recovers its trigger from html", () => {
    const actions = normalizeActions(load("akiros-ismort").items, {});
    const noEscape = actions.find((a) => a.name === "No Escape")!;
    expect(noEscape.cost).toBe("reaction");
    expect(noEscape.trigger).toBe("An adjacent foe moves away.");
  });

  it("maps a one-action ability", () => {
    const actions = normalizeActions(load("akiros-ismort").items, {});
    const rage = actions.find((a) => a.name === "Rage")!;
    expect(rage.cost).toBe("1");
    expect(rage.frequency).toBeNull();
  });

  it("captures frequency and sorts limited-use actions first", () => {
    const actions = normalizeActions(load("nyrissa").items, {
      "PF2E.NPC.Abilities.Glossary.ConstantSpells": "<p>Ability text.</p>",
      "PF2E.NPC.Abilities.Glossary.ChangeShape": "<p>Ability text.</p>",
    });
    const quickened = actions.find((a) => a.name === "Quickened Casting")!;
    expect(quickened.frequency).toEqual({ max: 3, per: "day" });
    expect(actions[0]!.frequency).not.toBeNull();
  });

  it("ignores non-action items", () => {
    const actions = normalizeActions(load("the-stag-lord").items, {});
    expect(actions.map((a) => a.name)).not.toContain("Longsword");
  });

  it("resolves an @Localize placeholder in the description before extraction", () => {
    const actions = normalizeActions(load("nyrissa").items, {
      "PF2E.NPC.Abilities.Glossary.ConstantSpells": "<p>Always active: light.</p>",
    });
    const constantSpells = actions.find((a) => a.name === "Constant Spells")!;
    expect(constantSpells.description).toBe("<p><p>Always active: light.</p></p>");
  });

  it("leaves an unresolved @Localize key untouched when the key is missing from the lang table", () => {
    const actions = normalizeActions(load("nyrissa").items, {});
    const constantSpells = actions.find((a) => a.name === "Constant Spells")!;
    expect(constantSpells.description).toContain("@Localize[");
  });
});
