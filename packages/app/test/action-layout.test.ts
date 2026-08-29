import { describe, expect, it } from "vitest";
import type { Action, Attack, Creature } from "@pf2/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildActionList } from "../src/rules/actionLayout.js";

const action = (over: Partial<Action>): Action => ({
  name: "Action", cost: "1", category: null, traits: [], trigger: null,
  requirements: null, frequency: null, description: "<p>Does a thing.</p>", ...over,
});

const attack = (over: Partial<Attack>): Attack => ({
  name: "Claw", kind: "melee", bonus: 10, damage: [{ formula: "1d6", type: "slashing", category: null }],
  traits: [], effects: [], ...over,
});

describe("buildActionList", () => {
  it("orders by action cost descending: 3, 2, 1, free, reaction, passive", () => {
    const items = buildActionList(
      [
        action({ name: "Passive One", cost: "passive" }),
        action({ name: "Reaction One", cost: "reaction" }),
        action({ name: "Free One", cost: "free" }),
        action({ name: "One-Action", cost: "1" }),
        action({ name: "Two-Action", cost: "2" }),
        action({ name: "Three-Action", cost: "3" }),
      ],
      [],
      "en",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : i.attack.name))).toEqual([
      "Three-Action", "Two-Action", "One-Action", "Free One", "Reaction One", "Passive One",
    ]);
  });

  it("keeps limited-use (a frequency) actions first within the same cost, then sorts by name", () => {
    const items = buildActionList(
      [
        action({ name: "Zebra Strike", cost: "2" }),
        action({ name: "Aardvark Strike", cost: "2" }),
        action({ name: "Once Per Day", cost: "2", frequency: { max: 1, per: "day" } }),
      ],
      [],
      "en",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : ""))).toEqual([
      "Once Per Day", "Aardvark Strike", "Zebra Strike",
    ]);
  });

  it("treats a Strike as a 1-action item, sorted alongside cost-1 actions by name", () => {
    const items = buildActionList(
      [action({ name: "Bite", cost: "1" })],
      [attack({ name: "Aardvark Claw" })],
      "en",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : i.attack.name))).toEqual([
      "Aardvark Claw", "Bite",
    ]);
    expect(items.find((i) => i.kind === "strike")).toBeDefined();
  });

  it("never treats a Strike as limited-use, even ahead of a limited 1-action ability", () => {
    const items = buildActionList(
      [action({ name: "Once Per Day", cost: "1", frequency: { max: 1, per: "day" } })],
      [attack({ name: "Claw" })],
      "en",
    );
    expect(items[0]).toMatchObject({ kind: "action", action: { name: "Once Per Day" } });
    expect(items[1]).toMatchObject({ kind: "strike", attack: { name: "Claw" } });
  });

  it("nests an action whose description opens with an attack's name under that Strike, off the top level", () => {
    const items = buildActionList(
      [
        action({
          name: "Rend",
          cost: "1",
          description: "<p>Claw</p>\n<hr />\n<p><strong>Requirements</strong> hit twice</p>",
        }),
        action({ name: "Chase Prey", cost: "2" }),
      ],
      [attack({ name: "Claw" }), attack({ name: "Jaws" })],
      "en",
    );

    // Rend never appears as its own top-level item.
    expect(items.some((i) => i.kind === "action" && i.action.name === "Rend")).toBe(false);

    const claw = items.find((i) => i.kind === "strike" && i.attack.name === "Claw");
    expect(claw).toBeDefined();
    expect(claw!.children.map((c) => c.name)).toEqual(["Rend"]);

    const jaws = items.find((i) => i.kind === "strike" && i.attack.name === "Jaws");
    expect(jaws!.children).toEqual([]);
  });

  it("matches the real pathfinder-monster-core/forest-troll data: Rend nests under Claw", () => {
    const path = resolve(process.cwd(), "data/creatures/pathfinder-monster-core/forest-troll.json");
    const creature = JSON.parse(readFileSync(path, "utf8")) as Creature;

    const items = buildActionList(creature.actions, creature.attacks, "en");

    expect(items.some((i) => i.kind === "action" && i.action.name === "Rend")).toBe(false);
    const claw = items.find((i) => i.kind === "strike" && i.attack.name === "Claw");
    expect(claw!.children.map((c) => c.name)).toEqual(["Rend"]);

    // Chase Prey (2 actions) leads; the two Strikes and the 1-action items
    // follow; the reaction and the two passives trail.
    const order = items.map((i) => (i.kind === "action" ? i.action.name : i.attack.name));
    expect(order).toEqual([
      "Chase Prey", "Claw", "Jaws", "Furious Flailing", "Easily Misled",
      "Regeneration 20 (Deactivated by Electricity or Fire)",
    ]);
  });

  it("does not nest an ordinary action that merely mentions an attack name mid-sentence", () => {
    const items = buildActionList(
      [action({ name: "Pounce", cost: "1", description: "<p>The wolf makes a Claw Strike.</p>" })],
      [attack({ name: "Claw" })],
      "en",
    );
    expect(items.some((i) => i.kind === "action" && i.action.name === "Pounce")).toBe(true);
    const claw = items.find((i) => i.kind === "strike");
    expect(claw!.children).toEqual([]);
  });

  it("breaks a same-cost tie by locale-aware name in French, not raw codepoint order", () => {
    // Raw codepoint order (the old `compareStrings` tie-break) puts "Épée"
    // after "Zèle" — uppercase É (U+00C9) sorts above every unaccented
    // letter. A French reader expects "Épée" filed with the other Es, ahead
    // of "Zèle".
    expect("Épée" > "Zèle").toBe(true);
    const items = buildActionList(
      [action({ name: "Zèle", cost: "1" }), action({ name: "Épée", cost: "1" })],
      [],
      "fr",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : ""))).toEqual(["Épée", "Zèle"]);
  });

  it("keeps cost precedence ahead of the locale tie-break: a 2-action Zzz still outranks a 1-action Aaa", () => {
    const items = buildActionList(
      [action({ name: "Aaa", cost: "1" }), action({ name: "Zzz", cost: "2" })],
      [],
      "fr",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : ""))).toEqual(["Zzz", "Aaa"]);
  });

  it("runs a Strike's name through the same locale-aware tie-break as an action's", () => {
    // Same scenario as the "Épée"/"Zèle" case above, but with the accented
    // name on a Strike instead of an action — both kinds of item read their
    // name through the same `itemName`/`compareItems` path, so one comparator
    // fix must cover both.
    const items = buildActionList(
      [action({ name: "Zèle", cost: "1" })],
      [attack({ name: "Épée" })],
      "fr",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : i.attack.name))).toEqual(["Épée", "Zèle"]);
  });

  it("keeps the English tie-break order for the same names under an explicit 'en'", () => {
    // Derived, not assumed: Intl.Collator("en").compare("Épée", "Zèle") is
    // -1 (verified separately), so passing "en" explicitly must yield the
    // same "Épée" first order as the French case above, just through the
    // English collator rather than raw codepoints — English isn't merely
    // "no sort applied" here, it independently gets the same answer.
    const items = buildActionList(
      [action({ name: "Zèle", cost: "1" }), action({ name: "Épée", cost: "1" })],
      [],
      "en",
    );
    expect(items.map((i) => (i.kind === "action" ? i.action.name : ""))).toEqual(["Épée", "Zèle"]);
  });
});
