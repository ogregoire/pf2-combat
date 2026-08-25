import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreatureI18n } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { useEncounter } from "../src/state/store.js";
import type { CombatantSeed } from "../src/state/store.js";

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

describe("creatures render in French", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the French name only — never the English alongside it", () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...stagLordSeed, i18n: stagLordI18n }, 20);

    render(<ActiveCombatant />);

    expect(screen.getByText("Seigneur Cerf")).toBeTruthy();
    expect(screen.queryByText("The Stag Lord")).toBeNull();
    expect(screen.queryByText(/Seigneur Cerf \(/)).toBeNull();
  });

  it("translates action and Strike names and descriptions", () => {
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
    // The action's own translated name/description also reached the DOM,
    // not just the Strike's.
    expect(screen.getByText("Poursuivre la proie")).toBeTruthy();
    expect(screen.getByText(/Se précipite puis effectue deux Frappes/)).toBeTruthy();
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

  it("switching back to English restores the English names", async () => {
    useEncounter.getState().setLang("fr");
    useEncounter.getState().addCombatant({ ...forestTrollSeed, i18n: forestTrollI18n }, 19);

    render(<ActiveCombatant />);
    expect(screen.getByText("Troll des forêts")).toBeTruthy();

    useEncounter.getState().setLang("en");

    await waitFor(() => expect(screen.getByText("Forest Troll")).toBeTruthy());
    expect(screen.queryByText("Troll des forêts")).toBeNull();
    expect(screen.getByRole("button", { name: /^Claw/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Griffe/ })).toBeNull();
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
