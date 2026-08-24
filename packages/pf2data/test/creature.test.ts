import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CreatureSchema } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeCreature", () => {
  it("produces a schema-valid creature", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
    );
    expect(() => CreatureSchema.parse(c)).not.toThrow();
  });

  it("builds the id from pack and slug", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
    );
    expect(c.id).toBe("kingmaker-bestiary/the-stag-lord");
    expect(c.name).toBe("The Stag Lord");
    expect(c.level).toBe(6);
    expect(c.source.remaster).toBe(false);
    expect(c.source.license).toBe("OGL");
  });

  it("carries actions, attacks and spellcasting through", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
    );
    expect(nyrissa.spellcasting).toHaveLength(3);
    expect(nyrissa.actions.length).toBeGreaterThan(0);
    expect(nyrissa.attacks.length).toBeGreaterThan(0);
  });

  it("leaves no unresolved uuid link in emitted text", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
    );
    expect(JSON.stringify(nyrissa)).not.toContain("@UUID[");
  });
});
