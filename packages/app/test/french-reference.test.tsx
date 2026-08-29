import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
// "sickened" is included too, but never applied to the test combatant — it
// stays in the one-click picker's pool, so it's what verifies the picker
// itself (not just an applied chip) resolves a name in French.
// dazzled/clumsy/off-guard/wounded are added on top, purely to give the
// picker-ordering test below a French name starting with an accented
// letter ("Ébloui") alongside plain ones spanning the alphabet — a plain
// code-unit compare sorts "Ébloui" after every unaccented word (dead last,
// after "Blessé"), while French collation places it with the other Es.
// prone/grabbed/blinded are added on top of that for the GM's own example:
// "À terre" (prone) carries a space, which `Intl.Collator`'s default
// weighting treats as a real, sortable character and sorts to the very
// front of the list ("À terre" collates before even "Agrippé", not merely
// out of place next to it) — French sorting convention says to ignore
// spaces, which puts "À terre" between "Agrippé" and "Aveuglé".
const conditions: Condition[] = [
  { slug: "frightened", name: "Frightened", isValued: true, description: "<p>Frightened things.</p>" },
  { slug: "sickened", name: "Sickened", isValued: true, description: "<p>Sickened things.</p>" },
  { slug: "dazzled", name: "Dazzled", isValued: false, description: "<p>Dazzled things.</p>" },
  { slug: "clumsy", name: "Clumsy", isValued: true, description: "<p>Clumsy things.</p>" },
  { slug: "off-guard", name: "Off-Guard", isValued: false, description: "<p>Off-guard things.</p>" },
  { slug: "wounded", name: "Wounded", isValued: true, description: "<p>Wounded things.</p>" },
  { slug: "prone", name: "Prone", isValued: false, description: "<p>Prone things.</p>" },
  { slug: "grabbed", name: "Grabbed", isValued: false, description: "<p>Grabbed things.</p>" },
  { slug: "blinded", name: "Blinded", isValued: false, description: "<p>Blinded things.</p>" },
];
const frConditions: ReferenceI18n = {
  frightened: { name: "Effrayé", description: null },
  sickened: { name: "Nauséeux", description: null },
  dazzled: { name: "Ébloui", description: null },
  clumsy: { name: "Maladroit", description: null },
  "off-guard": { name: "Pris au dépourvu", description: null },
  wounded: { name: "Blessé", description: null },
  prone: { name: "À terre", description: null },
  grabbed: { name: "Agrippé", description: null },
  blinded: { name: "Aveuglé", description: null },
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

    // The row's own chip (CombatantRow) — name and value in one string.
    expect(screen.getByText("EFFRAYÉ 2")).toBeTruthy();
    expect(screen.queryByText("FRIGHTENED 2")).toBeNull();
    // The popover's applied-condition tag — name and stepper value are two
    // separate nodes there (see RowPopover's Stepper), but the same
    // applied condition can't show two languages at once.
    const appliedGroup = screen.getByRole("group", { name: "états appliqués" });
    expect(within(appliedGroup).getByText("EFFRAYÉ")).toBeTruthy();
    expect(within(appliedGroup).getByText("2")).toBeTruthy();
    expect(within(appliedGroup).queryByText(/FRIGHTENED/)).toBeNull();
    // The one-click picker's button for a condition not yet applied.
    expect(screen.getByRole("button", { name: "Nauséeux" })).toBeTruthy();
  });

  it("orders the picker alphabetically in French, not by the English name it was sorted on", async () => {
    // The GM's own complaint: the picker used to be sorted once, at module
    // load, by the English `ConditionDef.name` — so in French it read in
    // English alphabetical order, which isn't alphabetical to a French
    // reader at all. This pins the fix at the one thing that would have let
    // it through: an English-only ordering test would still pass with the
    // English-name sort fully intact, since "Clumsy" < "Dazzled" < ... <
    // "Wounded" happens to already be in the right shape once translated —
    // it's the accented initial that exposes the bug either way.
    vi.stubGlobal("fetch", fakeFetch());
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ours effrayé", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );

    render(<CombatantList />);
    await user.hover(screen.getByText("Ours effrayé"));

    const picker = screen.getByRole("group", { name: "ajouter un état" });
    const translated = new Set([
      "Agrippé", "À terre", "Aveuglé", "Blessé", "Ébloui", "Effrayé", "Maladroit", "Nauséeux", "Pris au dépourvu",
    ]);
    // aria-label, not textContent — PickableConditionButton appends a bare
    // "X" placeholder to a valued condition's visible text (see its own doc
    // comment), which the accessible name deliberately excludes.
    const order = within(picker)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((text): text is string => translated.has(text ?? ""));

    // Correct French alphabetical order (A, À~A, A, B, É~E, E, M, N, P) —
    // this is the GM's own example: "À terre" (prone) sits between
    // "Agrippé" (grabbed) and "Aveuglé" (blinded), not at the very front of
    // the list where a literal, unstripped space would put it. The old
    // English-name sort would instead yield Agrippé(Grabbed), Aveuglé
    // (Blinded), Maladroit(Clumsy), Ébloui(Dazzled), Effrayé(Frightened),
    // Pris au dépourvu(Off-Guard), Nauséeux(Sickened), À terre(Prone),
    // Blessé(Wounded); a space-sensitive French collator without the fix
    // would instead put "À terre" first, ahead of "Agrippé".
    expect(order).toEqual([
      "Agrippé", "À terre", "Aveuglé", "Blessé", "Ébloui", "Effrayé", "Maladroit", "Nauséeux", "Pris au dépourvu",
    ]);
  });

  it("orders the applied condition chips alphabetically in French, not the order they were applied", async () => {
    // Same bug shape as the picker above, on the other list in this same
    // panel: the applied-condition chips rendered in insertion order, not
    // sorted at all. Applied deliberately out of alphabetical order —
    // wounded (Blessé), then dazzled (Ébloui), then prone (À terre), then
    // grabbed (Agrippé) — so insertion order and alphabetical order
    // disagree everywhere, and the accented initial ("Ébloui") is the same
    // signal the picker's own fix needed.
    vi.stubGlobal("fetch", fakeFetch());
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ours effrayé", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );
    useEncounter.getState().addCondition(id, "wounded", 1);
    useEncounter.getState().addCondition(id, "dazzled", 0);
    useEncounter.getState().addCondition(id, "prone", 0);
    useEncounter.getState().addCondition(id, "grabbed", 0);

    render(<CombatantList />);
    await user.hover(screen.getByText("Ours effrayé"));

    const appliedGroup = screen.getByRole("group", { name: "états appliqués" });
    // The remove button's aria-label is "Retirer {name}" — pulling the name
    // back out of it is more robust than reading the chip's own text node,
    // which also carries the stepper's value for a valued condition like
    // "wounded".
    const order = within(appliedGroup)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((label) => label.startsWith("Retirer "))
      .map((label) => label.slice("Retirer ".length));

    expect(order).toEqual(["Agrippé", "À terre", "Blessé", "Ébloui"]);
  });

  it("orders the always-visible row badges (ConditionChips) alphabetically in French too", async () => {
    // Fix round 1 review: the popover's applied-condition group (test above)
    // was fixed, but ConditionChips — the badges under the combatant's name
    // that render without opening any popover, on the row the GM actually
    // scans across the whole initiative list — is a second, independent
    // rendering of the same `combatant.conditions` and was still a bare
    // insertion-order `.map`. Same fixture, same scramble, no hover needed
    // this time since these badges are always visible.
    vi.stubGlobal("fetch", fakeFetch());
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Ours effrayé", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );
    useEncounter.getState().addCondition(id, "wounded", 1);
    useEncounter.getState().addCondition(id, "dazzled", 0);
    useEncounter.getState().addCondition(id, "prone", 0);
    useEncounter.getState().addCondition(id, "grabbed", 0);

    render(<CombatantList />);
    // Waits out the async glossary fetch (see fakeFetch) — the badge starts
    // as the English fallback for one render, then re-renders in French
    // once i18n/fr/conditions.json resolves.
    await screen.findByText("BLESSÉ 1");

    // ConditionChips renders as the last child of the name/HP/conditions
    // column — see CombatantRow.tsx's StandaloneRow: name+level line, then
    // (conditionally) the HP bar line, then (conditionally) ConditionChips.
    const nameEl = screen.getByText("Ours effrayé");
    const infoColumn = nameEl.parentElement!.parentElement!;
    const chipsContainer = infoColumn.lastElementChild as HTMLElement;
    const order = [...chipsContainer.children].map((el) => el.textContent ?? "");

    expect(order).toEqual(["AGRIPPÉ", "À TERRE", "BLESSÉ 1", "ÉBLOUI"]);
  });

  it("keeps the picker alphabetical in English too", async () => {
    // Same picker, lang left at "en" (the default) — the fix must not
    // regress the language that happened to already look right under a
    // plain compare.
    useEncounter.getState().reset();
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Scared Bear", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 6, will: 2 }, hp: { current: 10, max: 10 } },
      10,
    );

    render(<CombatantList />);
    await user.hover(screen.getByText("Scared Bear"));

    const picker = screen.getByRole("group", { name: "add condition" });
    const names = within(picker)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "");
    const collated = [...names].sort((a, b) => new Intl.Collator("en").compare(a, b));
    expect(names).toEqual(collated);
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
