import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Condition, GlossaryEntry, Trait } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { TurnManager } from "../src/components/TurnManager.js";
import { useEncounter } from "../src/state/store.js";
import type { FetchFn } from "../src/data/catalog.js";
import type { ReferenceI18n, TraitsI18n } from "../src/data/i18nOverlay.js";

/**
 * Task 14: conditions, traits and the glossary translate too, via the same
 * `useTraitGlossary` map (extended to merge the French overlays) and the
 * same `pick` rule everywhere else in the app uses. Real data throughout —
 * "flourish" -> "Sophistication" and "grippli" -> untranslated are taken
 * directly from data/i18n/fr/traits.json (checked in task-12-14-report.md):
 * the earlier brief's own example ("GRIPPLI"/"Grippli are…") doesn't match
 * the real data, where slug "grippli" is already named "Tripkee" in
 * English (the remaster's own rename) and has no French entry at all.
 */

const traits: Trait[] = [
  { slug: "flourish", name: "Flourish", description: "Actions with the flourish trait are special techniques." },
  { slug: "grippli", name: "Tripkee", description: "Tripkees are a family of froglike humanoids." },
];

// Trimmed from data/i18n/fr/traits.json: "flourish" carries a French name
// and description; "grippli" is absent entirely — two distinct kinds of
// miss, both falling back to English.
const frTraits: TraitsI18n = {
  flourish: {
    name: "Sophistication",
    description:
      "Les actions avec le trait sophistication sont des techniques spéciales qui nécessitent trop d'effort pour que vous puissiez les accomplir fréquemment.",
  },
};

// Trimmed from data/conditions.json / data/i18n/fr/conditions.json. The
// French overlay is keyed off the English list (same layering as
// glossary.json/traits.json in useTraitGlossary) — a French-only entry with
// no matching English `Condition` would never be reached.
const conditions: Condition[] = [{ slug: "frightened", name: "Frightened", isValued: true, description: "<p>Frightened things.</p>" }];
const frConditions: ReferenceI18n = {
  frightened: { name: "Effrayé", description: null },
};

function fakeFetch(over: { traits?: Trait[]; frTraits?: TraitsI18n } = {}): FetchFn {
  const glossary: GlossaryEntry[] = [];
  const frGlossary: ReferenceI18n = {};
  return (url) => {
    if (url.includes("i18n/fr/traits.json")) return Promise.resolve(new Response(JSON.stringify(over.frTraits ?? frTraits)));
    if (url.includes("i18n/fr/glossary.json")) return Promise.resolve(new Response(JSON.stringify(frGlossary)));
    if (url.includes("i18n/fr/conditions.json")) return Promise.resolve(new Response(JSON.stringify(frConditions)));
    if (url.includes("traits.json")) return Promise.resolve(new Response(JSON.stringify(over.traits ?? traits)));
    if (url.includes("glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossary)));
    if (url.includes("conditions.json")) return Promise.resolve(new Response(JSON.stringify(conditions)));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  };
}

describe("conditions, traits and the glossary render in French", () => {
  beforeEach(() => {
    useEncounter.getState().reset();
    useEncounter.getState().setLang("fr");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names conditions in French on the chip and in the picker", async () => {
    // RowPopover has no fetchFn prop (see CombatantRow) — it falls back to
    // the global fetch, same as every other consumer of this hook that
    // isn't wired through ActiveCombatant.
    vi.stubGlobal("fetch", fakeFetch());
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ours effrayé", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );
    useEncounter.getState().addCondition(id, "frightened", 2);

    render(<CombatantList />);
    await user.hover(screen.getByText("Ours effrayé"));

    // The already-applied condition's own chip, inside the popover.
    expect(screen.getByText("EFFRAYÉ 2")).toBeTruthy();
    // The picker's <option> for the same condition.
    expect(screen.getByRole("option", { name: "Effrayé" })).toBeTruthy();
  });

  it("shows French trait hover text", async () => {
    const fetchFn = fakeFetch();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Duelliste", level: 2, ac: 17,
        saves: { fortitude: 8, reflex: 10, will: 6 }, hp: { current: 20, max: 20 },
        attacks: [
          { name: "Rapière", kind: "melee", bonus: 9, traits: ["flourish"],
            damage: [{ formula: "1d6+2", type: "piercing", category: null }], effects: [] },
        ],
      },
      15,
    );
    render(<ActiveCombatant fetchFn={fetchFn} />);

    const tag = await screen.findByText("SOPHISTICATION");
    expect(tag.title).toMatch(/^Les actions avec le trait/);
  });

  it("keeps the English trait text when French has none", async () => {
    // "grippli" (already named "Tripkee" in English, the remaster's own
    // rename) has no data/i18n/fr/traits.json entry at all.
    const fetchFn = fakeFetch();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Tripkee éclaireur", level: 1, ac: 16,
        saves: { fortitude: 4, reflex: 8, will: 5 }, hp: { current: 12, max: 12 },
        attacks: [
          { name: "Dague", kind: "melee", bonus: 7, traits: ["grippli"],
            damage: [{ formula: "1d4+1", type: "piercing", category: null }], effects: [] },
        ],
      },
      15,
    );
    render(<ActiveCombatant fetchFn={fetchFn} />);

    const tag = await screen.findByText("TRIPKEE");
    expect(tag.title).toMatch(/^Tripkees are/);
  });

  it("states start-of-turn notifications in French", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Brûlé", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      20,
    );
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d6");

    render(<TurnManager />);

    // The notification states the computation, and is dismissed by click,
    // never a timer — that contract is unchanged, only its language. The
    // condition badge (prompt.label) is its own field, independent of the
    // title string, so pin it explicitly rather than only matching
    // whichever of the two happens to contain the phrase.
    expect(screen.getByText("DÉGÂTS PERSISTANTS")).toBeTruthy();
    expect(screen.getAllByText(/dégâts persistants/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Compris/ }));
    expect(screen.queryAllByText(/dégâts persistants/i)).toHaveLength(0);
  });
});
