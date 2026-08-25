import { describe, expect, it, beforeAll } from "vitest";
import { buildCreatureI18n } from "../src/stages/i18n.js";
import type { BabeleEntry } from "../src/stages/babele.js";

describe("buildCreatureI18n", () => {
  describe("alignment by array position", () => {
    // Two attacks BOTH named "Dagger" (a melee and a thrown one) with
    // different foundry ids — 156 real creatures look like this. A
    // name-keyed lookup would collapse them onto the same translation;
    // only aligning by array index keeps them distinct.
    let out: NonNullable<ReturnType<typeof buildCreatureI18n>>;

    beforeAll(() => {
      const table = new Map<string, BabeleEntry>([
        [
          "Thorn River Bandit",
          {
            name: "Bandit de la rivière aux Épines",
            items: {
              "id-melee": { name: "Dague" },
              "id-thrown": { name: "Dague de jet" },
            },
          },
        ],
      ]);

      out = buildCreatureI18n({
        creatureName: "Thorn River Bandit",
        actions: [],
        attacks: [
          { name: "Dagger", foundryId: "id-melee" },
          { name: "Dagger", foundryId: "id-thrown" },
        ],
        table,
      })!;
    });

    it("aligns item translations to array position, not name", () => {
      expect(out.attacks.map((a) => a.name)).toEqual(["Dague", "Dague de jet"]);
    });

    it("records the English name at each position, so verify can catch drift", () => {
      expect(out.attacks[0]!.en).toBe("Dagger");
      expect(out.attacks[1]!.en).toBe("Dagger");
    });
  });

  it("returns null for a creature with no French entry", () => {
    expect(
      buildCreatureI18n({
        creatureName: "Manticore",
        actions: [],
        attacks: [],
        table: new Map(),
      }),
    ).toBeNull();
  });

  describe("missing item translations", () => {
    let out: NonNullable<ReturnType<typeof buildCreatureI18n>>;

    beforeAll(() => {
      const table = new Map<string, BabeleEntry>([
        [
          "Skeleton Guard",
          {
            name: "Garde squelette",
            items: {}, // no translation for this action's item id
          },
        ],
      ]);

      out = buildCreatureI18n({
        creatureName: "Skeleton Guard",
        actions: [{ name: "Grab", foundryId: "missing-id" }],
        attacks: [],
        table,
      })!;
    });

    it("uses null, never the English text, for an item the table does not cover", () => {
      expect(out.actions[0]!.name).toBeNull();
      expect(out.actions[0]!.description).toBeNull();
    });

    it("still records the English name at that position", () => {
      expect(out.actions[0]!.en).toBe("Grab");
    });
  });

  describe("field mapping", () => {
    it("maps the entry's own name and description fields to name/publicNotes", () => {
      const table = new Map<string, BabeleEntry>([
        [
          "Ankou",
          {
            name: "Ankou FR",
            description: "Notes publiques FR",
            items: {
              "action-id": { name: "Effroi FR", description: "Description FR" },
            },
          },
        ],
      ]);

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        actions: [{ name: "Dread", foundryId: "action-id" }],
        attacks: [],
        table,
      })!;

      expect(out.name).toBe("Ankou FR");
      expect(out.publicNotes).toBe("Notes publiques FR");
      expect(out.actions[0]!.name).toBe("Effroi FR");
      expect(out.actions[0]!.description).toBe("Description FR");
    });

    it("uses null for publicNotes when the entry has no description field", () => {
      const table = new Map<string, BabeleEntry>([
        ["Ankou", { name: "Ankou FR" }],
      ]);

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        actions: [],
        attacks: [],
        table,
      })!;

      expect(out.publicNotes).toBeNull();
    });
  });
});
