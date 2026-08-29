import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Creature, CreatureI18n, IndexEntry } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { AddCombatants } from "../src/components/AddCombatants.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { ReactionWatch } from "../src/components/ReactionWatch.js";
import { __resetCombatantI18nCacheForTests } from "../src/hooks/useCombatantI18n.js";
import { useEncounter } from "../src/state/store.js";
import type { CombatantSeed } from "../src/state/store.js";
import type { FetchFn } from "../src/data/catalog.js";

/**
 * Tasks 1-11 built and wired a complete French data overlay, but nothing in
 * the UI ever rendered any of it — these tests are what close that gap for
 * creatures (conditions/traits/glossary are covered separately in
 * french-reference.test.tsx). Real data throughout: the Stag Lord and
 * Forest Troll seeds/overlays below are trimmed copies of
 * data/creatures/.../the-stag-lord.json, forest-troll.json and their
 * data/i18n/fr counterparts, not invented fixtures — array order (actions,
 * attacks) matches the real files exactly, since alignment is by position.
 */

const stagLordSeed: CombatantSeed = {
  kind: "creature",
  name: "The Stag Lord",
  creatureId: "kingmaker-bestiary/the-stag-lord",
  level: 6,
  ac: 23,
  saves: { fortitude: 15, reflex: 16, will: 9 },
  hp: { current: 85, max: 85 },
  attacks: [
    {
      name: "Composite Longbow", kind: "ranged", bonus: 17, traits: [],
      damage: [{ formula: "2d8+7", type: "piercing", category: null }], effects: [],
    },
    {
      name: "Longsword", kind: "melee", bonus: 15, traits: ["versatile-s"],
      damage: [{ formula: "2d8+7", type: "slashing", category: null }], effects: [],
    },
  ],
  actions: [
    { name: "Hunt Prey", cost: "1", traits: [], frequency: null, trigger: null, requirements: null, description: "<p>Marks a single quarry.</p>", category: null },
    { name: "Unfair Aim", cost: "2", traits: [], frequency: null, trigger: null, requirements: null, description: "<p>Shoots at a hunted prey.</p>", category: null },
    { name: "Dread Striker", cost: "passive", traits: [], frequency: null, trigger: null, requirements: null, description: "<p>Frightened foes are off-guard.</p>", category: null },
    { name: "Perpetual Hangover", cost: "passive", traits: [], frequency: null, trigger: null, requirements: null, description: "<p>Always sickened 1.</p>", category: null },
    { name: "Sneak Attack", cost: "passive", traits: [], frequency: null, trigger: null, requirements: null, description: "<p>2d6 extra precision damage.</p>", category: null },
  ],
};

// Trimmed from data/i18n/fr/creatures/kingmaker-bestiary/the-stag-lord.json —
// array order/length matches stagLordSeed's actions/attacks exactly.
const stagLordI18n: CreatureI18n = {
  name: "Seigneur Cerf",
  publicNotes: null,
  actions: [
    { en: "Hunt Prey", name: "Chasser une proie", description: "<p>Désigne une unique proie.</p>" },
    { en: "Unfair Aim", name: "Tir injuste", description: "<p>Tire sur une proie traquée.</p>" },
    { en: "Dread Striker", name: "Frappeur d'effroi", description: "<p>Les créatures effrayées sont prises au dépourvu.</p>" },
    { en: "Perpetual Hangover", name: "Éternellement alcoolisé.", description: "<p>Toujours nauséeux 1.</p>" },
    // Real data: this one has no French name at all (description still
    // present) — the untranslated position pick() must still fall through.
    { en: "Sneak Attack", name: null, description: "<p>2d6 dégâts de précision supplémentaires.</p>" },
  ],
  attacks: [
    { en: "Composite Longbow", name: "Arc long composite" },
    { en: "Longsword", name: "Épée longue" },
  ],
};

const forestTrollSeed: CombatantSeed = {
  kind: "creature",
  name: "Forest Troll",
  creatureId: "pathfinder-monster-core/forest-troll",
  level: 5,
  ac: 20,
  saves: { fortitude: 17, reflex: 11, will: 7 },
  hp: { current: 125, max: 125 },
  // Denormalised from actions[0] below, same as AddCombatants's toReactions
  // — real creatures only carry one array, but Combatant.reactions is what
  // ReactionWatch actually reads.
  reactions: [{ name: "Furious Flailing", trigger: "The forest troll takes electricity or fire damage" }],
  attacks: [
    {
      name: "Claw", kind: "melee", bonus: 14, traits: ["agile", "reach-10", "unarmed"],
      damage: [{ formula: "2d8+5", type: "slashing", category: null }], effects: [],
    },
    {
      name: "Jaws", kind: "melee", bonus: 14, traits: ["reach-10", "unarmed"],
      damage: [{ formula: "2d10+5", type: "piercing", category: null }], effects: [],
    },
  ],
  actions: [
    {
      name: "Furious Flailing", cost: "reaction", traits: [], frequency: null,
      trigger: "The forest troll takes electricity or fire damage", requirements: null,
      description: "<p><strong>Trigger</strong> The forest troll takes electricity or fire damage</p>",
      category: "defensive",
    },
    {
      name: "Rend", cost: "1", traits: [], frequency: null, trigger: null, requirements: null,
      description:
        "<p>Claw</p>\n<hr />\n<p><p>A Rend entry lists a Strike the monster has.</p><p><strong>Requirements</strong> The monster hit the same enemy with two consecutive Strikes of the listed type in the same round.</p></p>",
      category: "offensive",
    },
    {
      name: "Chase Prey", cost: "2", traits: [], frequency: null, trigger: null, requirements: null,
      description: "<p>Strides then makes two claw Strikes.</p>", category: "offensive",
    },
  ],
};

// Trimmed from data/i18n/fr/creatures/pathfinder-monster-core/forest-troll.json.
const forestTrollI18n: CreatureI18n = {
  name: "Troll des forêts",
  publicNotes: null,
  actions: [
    { en: "Furious Flailing", name: "Lutte furieuse", description: "<p><strong>Déclencheur</strong> Le troll des forêts subit des dégâts d'électricité ou de feu</p>" },
    {
      en: "Rend", name: null,
      description:
        "<p>Griffe</p>\n<hr />\n<p><p>Une entrée d'Éventration indique une Frappe que possède le monstre.</p><p><strong>Conditions</strong> Au cours d'un même round, le monstre touche un même ennemi avec deux Frappes consécutives du type indiqué.</p></p>",
    },
    { en: "Chase Prey", name: "Poursuivre la proie", description: "<p>Se précipite puis effectue deux Frappes de griffes.</p>" },
  ],
  attacks: [
    { en: "Claw", name: "Griffe" },
    { en: "Jaws", name: "Mâchoires" },
  ],
};

// Catalog-side fixtures for the two tests that go through the real add
// path (AddCombatants), not a hand-seeded store — same forest troll, id
// matching forestTrollSeed/forestTrollI18n above.
const forestTrollEntry: IndexEntry = {
  id: "pathfinder-monster-core/forest-troll",
  slug: "forest-troll",
  name: "Forest Troll",
  level: 5,
  rarity: "common",
  size: "large",
  traits: ["giant"],
  ac: 20,
  hp: 125,
  remaster: true,
  book: "Monster Core",
} as IndexEntry;

const forestTrollCreature: Creature = {
  id: "pathfinder-monster-core/forest-troll",
  foundryId: "Actor.forest-troll",
  name: "Forest Troll",
  level: 5,
  rarity: "common",
  size: "large",
  traits: ["giant"],
  source: { pack: "pathfinder-monster-core", book: "Monster Core", license: "ORC", remaster: true },
  ac: 20,
  acDetails: null,
  hp: 125,
  hpDetails: null,
  saves: {
    fortitude: { value: 17, detail: null },
    reflex: { value: 11, detail: null },
    will: { value: 7, detail: null },
  },
  immunities: [],
  weaknesses: [],
  resistances: [],
  perception: 12,
  senses: [],
  languages: [],
  skills: {},
  abilityMods: {},
  speeds: [{ type: "land", value: 25 }],
  attacks: forestTrollSeed.attacks!,
  actions: forestTrollSeed.actions!,
  spellcasting: [],
  gear: [],
  publicNotes: "",
};

/** Stubs the global `fetch` `useCombatantI18n` falls back to when no
 * `fetchFn` is injected — the per-creature overlay is now resolved at
 * render, from `creatureId`, never fetched by AddCombatants itself. */
function stubForestTrollOverlayFetch(): void {
  vi.stubGlobal("fetch", (url: string) => {
    if (url.includes("i18n/fr/creatures/pathfinder-monster-core/forest-troll.json")) {
      return Promise.resolve(new Response(JSON.stringify(forestTrollI18n)));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
}

/**
 * Stubs the trait/glossary/condition fetches `useTraitGlossary` makes
 * (traits.json and conditions.json are irrelevant here, so they resolve
 * empty). glossary.json carries just the two real entries these tests need
 * — "rend" and "attack-of-opportunity" — trimmed from the real
 * data/glossary.json and data/i18n/fr/glossary.json, not invented text.
 */
function stubGlossaryFetch(): FetchFn {
  const glossaryEn = [
    { slug: "rend", name: "Rend", cost: "1", traits: [], description: "" },
    { slug: "attack-of-opportunity", name: "Attack of Opportunity", cost: "reaction", traits: [], description: "" },
  ];
  const glossaryFr = {
    rend: { name: "Éventration", description: null },
    "attack-of-opportunity": { name: "Frappe réactive", description: null },
  };
  return (url: string) => {
    if (url.endsWith("i18n/fr/traits.json")) return Promise.resolve(new Response(JSON.stringify({})));
    if (url.endsWith("i18n/fr/conditions.json")) return Promise.resolve(new Response(JSON.stringify({})));
    if (url.endsWith("i18n/fr/glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossaryFr)));
    if (url.endsWith("data/traits.json")) return Promise.resolve(new Response(JSON.stringify([])));
    if (url.endsWith("data/conditions.json")) return Promise.resolve(new Response(JSON.stringify([])));
    if (url.endsWith("data/glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossaryEn)));
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

describe("creatures render in French", () => {
  beforeEach(() => {
    useEncounter.getState().reset();
    // useCombatantI18n's cache is module-level, not store-level -- an
    // earlier test's resolved fetch for a creature id would otherwise still
    // answer a later test's call for that same id, making that later
    // test's own fetch stub (or lack of one) decorative.
    __resetCombatantI18nCacheForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the French name only — never the English alongside it", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 20);

    render(<ActiveCombatant />);

    expect(screen.getByText("Seigneur Cerf")).toBeTruthy();
    expect(screen.queryByText("The Stag Lord")).toBeNull();
    expect(screen.queryByText(/Seigneur Cerf \(/)).toBeNull();
  });

  it("translates action and Strike names and descriptions", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...forestTrollSeed, i18n: forestTrollI18n }, 19);

    render(<ActiveCombatant />);

    expect(screen.getByText("Troll des forêts")).toBeTruthy();
    // Anchored to `^`, same convention the pre-existing English suite uses
    // for Rend (action-list.test.tsx): Rend's own translated description
    // opens by naming the Strike it belongs to ("Griffe"), so an unanchored
    // match would also hit that child action's body text, not just the
    // Strike button itself.
    expect(screen.getByRole("button", { name: /^Griffe/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Claw/ })).toBeNull();
    // The action's own translated name reached the DOM, not just the
    // Strike's — and its description too, once selected (action cards fold
    // their body away until clicked, same as the English suite's own
    // "folds a passive's rules text away until its header is clicked").
    const chasePrey = screen.getByRole("button", { name: /Poursuivre la proie/ });
    expect(chasePrey).toBeTruthy();
    await user.click(chasePrey);
    expect(screen.getByText(/Se précipite puis effectue deux Frappes/)).toBeTruthy();
  });

  // The GM's reported defect, verbatim: "Rend, in French, still renders as
  // Rend". forestTrollI18n's own Rend entry has `name: null` (real data:
  // data/i18n/fr/creatures/pathfinder-monster-core/forest-troll.json) even
  // though its description is fully translated — a French speaker reading a
  // French stat block still saw one action name in English. The glossary
  // carries the shared French name for this and hundreds of other generic
  // abilities creature records commonly leave untranslated.
  it("falls back to the glossary's French name when the creature record's own name is null", async () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...forestTrollSeed, i18n: forestTrollI18n }, 19);

    render(<ActiveCombatant fetchFn={stubGlossaryFetch()} />);

    // Still nested under the Strike (Griffe), same as the English suite's
    // Rend-nesting test — buildActionList's own detection reads the
    // (already-translated) description text, never the name, so the
    // glossary fallback applied here can't affect it either way.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Éventration/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Rend/ })).toBeNull();
  });

  // Same fallback, exercised through ReactionWatch rather than ActionList —
  // the task's brief specifically calls out that every surface an action
  // name renders through must go via this chain, not just the child-action
  // row where the GM noticed it.
  it("falls back to the glossary's French name in ReactionWatch's reaction line too", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant(
      {
        ...forestTrollSeed,
        reactions: [{ name: "Attack of Opportunity", trigger: null }],
        actions: [
          {
            name: "Attack of Opportunity", cost: "reaction", traits: [], frequency: null, trigger: null,
            requirements: null, description: "<p>Make a melee Strike.</p>", category: "offensive",
          },
        ],
        i18n: {
          ...forestTrollI18n,
          actions: [{ en: "Attack of Opportunity", name: null, description: null }],
        },
      },
      19,
    );

    render(<ReactionWatch fetchFn={stubGlossaryFetch()} />);

    return waitFor(() => {
      expect(screen.getByText("Frappe réactive")).toBeTruthy();
      expect(screen.queryByText("Attack of Opportunity")).toBeNull();
    });
  });

  // No fallback marker: the overlay can't tell "nobody translated this"
  // from "the French name is identical to the English" — Manticore, Ankou
  // and Belker genuinely ARE the French names, so a marker would fire
  // exactly where English is already correct. An untranslated creature
  // just renders in English, unannotated, same as any creature genuinely
  // named the same in both languages.
  it("falls back to English for an untranslated creature, unannotated", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant(
      {
        kind: "creature", name: "Manticore", level: 6, ac: 23,
        saves: { fortitude: 12, reflex: 15, will: 11 }, hp: { current: 95, max: 95 },
      },
      18,
    );

    render(<ActiveCombatant />);

    expect(screen.getByText("Manticore")).toBeTruthy();
    // No title anywhere in the header names/marks this as a fallback.
    const heading = screen.getByText("Manticore").closest("div")!;
    expect(heading.querySelector("[title]")).toBeNull();
  });

  // Finding 1 (final review): this used to hand-seed the store with an
  // ENGLISH name plus an overlay — a state the production add path could
  // never produce, since `AddCombatants` stored whatever name the
  // (possibly localised) search result carried. Goes through the real
  // `<AddCombatants>` flow instead, so it fails the way the bug actually
  // failed: added while French is on, the list shows the French name, but
  // what gets stored — and what English mode falls back to — must be the
  // English one.
  it("stores a creature added while French is on under its English name — toggling to English shows a clean English stat block, not a mixed one", async () => {
    stubForestTrollOverlayFetch();
    useEncounter.getState().setLang("fr");
    const user = userEvent.setup();
    const { unmount } = render(
      <AddCombatants
        entries={[forestTrollEntry]}
        loadCreatureFn={async () => forestTrollCreature}
        loadIndexI18nFn={async (pack) =>
          pack === "pathfinder-monster-core" ? { "pathfinder-monster-core/forest-troll": "Troll des forêts" } : {}
        }
      />,
    );

    // The search result renders French — the GM picks it by its French name.
    await user.click(await screen.findByRole("button", { name: /ajouter troll des forêts/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.click(await screen.findByRole("button", { name: /ajouter 1 troll des forêts/i }));

    // What's actually stored is the ENGLISH name — the bug this guards was
    // storing the French one shown in the list above.
    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.name).toBe("Forest Troll");
    unmount();

    render(<ActiveCombatant />);
    await waitFor(() => expect(screen.getByText("Troll des forêts")).toBeTruthy());

    useEncounter.getState().setLang("en");

    await waitFor(() => expect(screen.getByText("Forest Troll")).toBeTruthy());
    expect(screen.queryByText("Troll des forêts")).toBeNull();
    expect(screen.getByRole("button", { name: /^Claw/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Griffe/ })).toBeNull();
  });

  // Finding 2 (final review): AddCombatants/QuickAdd used to fetch the
  // overlay only when `lang` was already "fr" at add time, so a combatant
  // added in English never became French on a later toggle. The overlay is
  // now resolved at render, from `creatureId` (see useCombatantI18n), so
  // add-time `lang` shouldn't matter at all.
  it("a combatant added while English is on becomes French after toggling to French", async () => {
    stubForestTrollOverlayFetch();
    const user = userEvent.setup();
    const { unmount } = render(
      <AddCombatants entries={[forestTrollEntry]} loadCreatureFn={async () => forestTrollCreature} />,
    );

    await user.click(screen.getByRole("button", { name: /add forest troll/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.click(screen.getByRole("button", { name: /^add 1 forest troll$/i }));

    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.name).toBe("Forest Troll");
    // Never fetched at add time — nothing to fetch it FOR yet, in English.
    expect(combatant.i18n).toBeNull();
    unmount();

    useEncounter.getState().setLang("fr");
    render(<ActiveCombatant />);

    await waitFor(() => expect(screen.getByText("Troll des forêts")).toBeTruthy());
    expect(screen.queryByText("Forest Troll")).toBeNull();
    expect(screen.getByRole("button", { name: /^Griffe/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Claw/ })).toBeNull();
    expect(screen.getByText("Poursuivre la proie")).toBeTruthy();
  });

  // Finding 11 (final review): SCHEMA_VERSION wasn't bumped when Combatant
  // gained a required `i18n` field, though `persist.ts`'s migrate() never
  // reconciles field-level shape — a payload saved before the field existed
  // restores with `i18n` simply ABSENT (undefined), not explicitly `null`.
  // useCombatantI18n checks with `== null` specifically so this case
  // resolves an overlay exactly like a freshly-added English combatant
  // does, rather than treating "field predates the schema" as "field is
  // explicitly empty" and silently never fetching.
  it("resolves French for a combatant restored from a payload predating the i18n field entirely", async () => {
    stubForestTrollOverlayFetch();
    useEncounter.getState().setLang("fr");
    const id = useEncounter.getState().addCombatant({ ...forestTrollSeed }, 19);
    useEncounter.setState((state) => {
      delete (state.encounter.combatants[id] as Record<string, unknown>).i18n;
    });
    expect("i18n" in useEncounter.getState().encounter.combatants[id]!).toBe(false);

    render(<ActiveCombatant />);

    await waitFor(() => expect(screen.getByText("Troll des forêts")).toBeTruthy());
  });

  // Finding 3 (final review): ReactionWatch rendered combatant and reaction
  // names in English regardless of `lang` — the one component Tasks 12/14's
  // sweep missed.
  it("translates the combatant and reaction names in ReactionWatch; the trigger has no French counterpart and stays English", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...forestTrollSeed, i18n: forestTrollI18n }, 19);

    render(<ReactionWatch />);

    expect(screen.getByText("Troll des forêts")).toBeTruthy();
    expect(screen.getByText("Lutte furieuse")).toBeTruthy();
    expect(screen.queryByText("Furious Flailing")).toBeNull();
    // CreatureI18n carries no French trigger text at all — a data gap, not
    // a wiring one — so it stays English even though everything around it
    // is French.
    expect(screen.getByText(/The forest troll takes electricity or fire damage/)).toBeTruthy();
  });

  it("also shows the French name in the turn-order list, not just the active panel", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 20);

    render(<CombatantList />);

    expect(screen.getByText("Seigneur Cerf")).toBeTruthy();
    expect(screen.queryByText("The Stag Lord")).toBeNull();
  });

  it("names the targeted enemy in French in the roll assistant's TARGET panel", () => {
    useEncounter.getState().setLang("fr");
    // The active combatant (attacker) and the target are both creatures
    // with overlays — targeting is the single most-used action during
    // someone else's turn, so the roll assistant's own TARGET line must
    // never be the one spot on screen still showing English.
    useEncounter.getState().addCombatant({ ...forestTrollSeed, i18n: forestTrollI18n }, 20);
    const targetId = useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 5);
    useEncounter.getState().setTarget(targetId);

    render(<ActiveCombatant />);

    expect(screen.getByText("Seigneur Cerf")).toBeTruthy();
    expect(screen.queryByText("The Stag Lord")).toBeNull();
  });

  it("carries the French name into the turn-order row's own aria-label, not just its visible text", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 20);

    render(<CombatantList />);

    expect(screen.getByRole("button", { name: /Seigneur Cerf/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /The Stag Lord/ })).toBeNull();
  });

  it("names the combatant in French in the popover's own header and its Remove button's aria-label", async () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 20);

    const user = userEvent.setup();
    render(<CombatantList />);
    await user.hover(screen.getAllByText("Seigneur Cerf")[0]!);

    // The row's own text plus the popover's header both now say "Seigneur
    // Cerf" — never "The Stag Lord" anywhere.
    expect(screen.getAllByText("Seigneur Cerf").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("The Stag Lord")).toBeNull();
    expect(screen.getByRole("button", { name: /Retirer Seigneur Cerf/ })).toBeTruthy();
  });
});
