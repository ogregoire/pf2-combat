# French Localisation Follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three French gaps left open when the localisation branch merged — untranslated reaction triggers, untranslated action descriptions, and English pluralisation of French names.

**Architecture:** Two pipeline tasks widen what `pf2data` extracts from data already fetched (no new source, no new pin); one app task makes pluralisation language-aware.

**Tech Stack:** TypeScript, zod, Vitest, React 19, Zustand+Immer.

**Spec:** `docs/superpowers/specs/2026-08-25-french-localisation-design.md` (this plan extends its "Deferred" section)

## Global Constraints

- Ordering is `compareStrings` (code-unit), NEVER `localeCompare`.
- All data output via `writeJson`/`stableStringify`; reruns at a fixed pin byte-identical.
- `packages/app/src/rules/**` stays pure — no I/O, no `Date.now()`, no `Math.random()`.
- A missing translation is `null`/omitted, NEVER English copied in.
- French text derives ONLY from the openly licensed `pf2-fr` module (including its retired `archive/`). No Black Book Editions text — see `data/SCHEMA.md`.
- Every guardrail or check must be **demonstrated failing** before it counts as landed.
- After writing each test, BREAK what it covers and confirm it fails. If a mutation goes undetected the fixture is wrong — fix the fixture and say so.
- If generated data changes, re-run all three idempotency checks: `npm run data -- update` twice, then once under `LC_ALL=da_DK.UTF-8`, each leaving `git status --porcelain` empty.

## Measured starting point

| Gap | Measured |
|---|---|
| Action entries total | 6880 |
| `name: null` | 1964 (28.5%) |
| `description: null` | **2045 (29.7%)**, across **1008 of 1450 creatures** |
| English actions carrying a trigger | 723 |
| French descriptions carrying `<strong>Déclencheur</strong>` | **537** |
| Null descriptions on creatures the `archive/` covers | **666 (33%)** |
| `archive/` item-level entries (`ID:` lines) | 7471 across 3892 records |

---

## Task 1: Extract French triggers and requirements

**Why:** `ActionCard` and `ReactionWatch` show a reaction's trigger — the text a GM reads to decide whether a reaction fires. It is currently always English. The pipeline already derives the English one with `extractLabelled(html, "Trigger")` when the item carries no explicit field, and **537 French descriptions carry the same structure with a translated label**:

```html
<p><strong>Déclencheur</strong> Le jabberwocky Vole ou fait une Frappe d'aile</p>
```

So this is recoverable from data already shipped — no new source.

**Files:**
- Modify: `packages/pf2data/src/normalize/html.ts`
- Modify: `packages/pf2data/src/stages/i18n.ts` (creature overlay gains trigger/requirements)
- Modify: `packages/schema/src/i18n.ts` (`CreatureI18n` action entries)
- Modify: `packages/app/src/data/i18nOverlay.ts` (`resolveActions` carries them)
- Modify: `packages/app/src/components/ReactionWatch.tsx`
- Test: `packages/pf2data/test/html.test.ts`, `packages/app/test/french-reference.test.tsx`

**Interfaces:**
- Produces: `extractTriggerFr(html)`, `extractRequirementsFr(html)`; `CreatureI18n.actions[].trigger`/`.requirements`, both `string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it("extracts a French trigger from a Déclencheur paragraph", () => {
  expect(extractTriggerFr(
    "<p><strong>Déclencheur</strong> Le jabberwocky Vole ou fait une Frappe d'aile</p><hr /><p>…</p>",
  )).toBe("Le jabberwocky Vole ou fait une Frappe d'aile");
});

it("extracts French requirements from a Conditions paragraph", () => {
  expect(extractRequirementsFr(
    "<p><strong>Conditions</strong> Le grand tertre est sous sa forme de monticule</p>",
  )).toBe("Le grand tertre est sous sa forme de monticule");
});

it("respects the <hr/> boundary, as the English extractor does", () => {
  // A later paragraph reusing the label must not be picked up.
  expect(extractTriggerFr("<p>x</p><hr /><p><strong>Déclencheur</strong> nope</p>")).toBeNull();
});

it("returns null when the label is absent", () => {
  expect(extractTriggerFr("<p>Pas de déclencheur ici</p>")).toBeNull();
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

`extractLabelled` already takes the label as a parameter and already handles the `<hr/>` boundary — **reuse it, do not write a second extractor**. The French labels are `Déclencheur` and `Conditions`. Note `Conditions` is French for *Requirements*, not for *Conditions* in the status-effect sense; say so in a comment or someone will "fix" it.

Then carry the results into the overlay and render them: `ReactionWatch`'s trigger line is the visible payoff.

- [ ] **Step 4: Regenerate and report coverage**

Report how many actions gained a French trigger and how many gained requirements. Expect roughly 537 triggers; if your number differs materially, STOP and report rather than adjusting.

- [ ] **Step 5: Commit** — `feat(pf2data): extract French triggers and requirements`

---

## Task 2: Fill null item translations from the archive

**Why:** 2045 action entries (29.7%) have `description: null`, affecting 1008 of 1450 creatures — the largest remaining French gap, and it is body text the GM reads mid-turn. Task 17 already consults the module's retired `archive/` but ONLY when Babele has no entry for the whole creature. The archive holds **7471 item-level entries** across 3892 records, and **666 of the null descriptions (33%) sit on creatures the archive covers**.

**Files:**
- Modify: `packages/pf2data/src/stages/archive.ts` (expose item-level entries)
- Modify: `packages/pf2data/src/stages/i18n.ts`
- Modify: `packages/pf2data/src/report.ts`
- Test: `packages/pf2data/test/archive.test.ts`, `packages/pf2data/test/i18n.test.ts`

**Interfaces:**
- Produces: archive records expose `items: Map<foundryId, { name, description }>`, parsed from `ID:` lines and their `Name:`/`Nom:` and `Desc (en)`/`Desc (fr)` blocks.

- [ ] **Step 1: Write the failing tests**

```ts
it("parses item-level entries keyed by their ID line", () => {
  expect(loadArchive(dir).get("rec")!.items.get("itemid")!.fr).toBe("Agripper");
});

it("fills a null item description without touching a populated one", () => {
  // Babele wins wherever it has something; the archive is retired data.
  expect(out.actions[0]!.description).toBe("<p>Babele's French</p>");
  expect(out.actions[1]!.description).toBe("<p>Archive's French</p>");
});

it("leaves a description null when neither source has it", () => {
  expect(out.actions[2]!.description).toBeNull();
});

it("aligns archive items by foundryId, never by position or name", () => {
  // Same reason the Babele join is id-keyed: 156 creatures carry two
  // same-named Strikes.
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement.** Babele always wins; the archive fills only `null`. Archive HTML goes through the same `resolveFrench` path as Babele text — the markup guard must still find ZERO reference markers afterwards.

- [ ] **Step 4: Regenerate and report the new null counts.** Report `description: null` and `name: null` before and after. **Do not report a number you have not measured.**

- [ ] **Step 5: Commit** — `feat(pf2data): fill null item translations from the archive`

---

## Task 3: Pluralise French names by French rules

**Why:** `AddCombatants.tsx:84` is `quantity === 1 ? name : \`${name}s\`` — unconditional English pluralisation, applied to French names since the merge. It renders on the Add button (`AddCombatants.tsx:482`).

**Files:**
- Create: `packages/app/src/rules/plural.ts` (pure)
- Modify: `packages/app/src/components/AddCombatants.tsx`
- Test: `packages/app/test/plural.test.ts`

**Interfaces:**
- Produces: `pluralize(name: string, quantity: number, lang: Lang): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// English unchanged — existing behaviour must not move.
it("appends s in English", () => expect(pluralize("Goblin", 2, "en")).toBe("Goblins"));
it("returns the singular for a quantity of 1", () => expect(pluralize("Gobelin", 1, "fr")).toBe("Gobelin"));

// French rules, applied to the LAST word only — the head noun is not
// reliably first in French ("Troll des glaces" pluralises the troll).
it("appends s to a plain French noun", () => expect(pluralize("Gobelin", 2, "fr")).toBe("Gobelins"));
it("leaves a name already ending in s, x or z unchanged", () => {
  expect(pluralize("Chauves-souris crépitante", 2, "fr")).toBe("Chauves-souris crépitantes");
  expect(pluralize("Kobold véreux", 2, "fr")).toBe("Kobold véreux");
});
it("turns -al into -aux", () => expect(pluralize("Cheval", 2, "fr")).toBe("Chevaux"));
it("adds x after -eau and -eu", () => expect(pluralize("Corbeau", 2, "fr")).toBe("Corbeaux"));
it("leaves a parenthesised qualifier alone", () => {
  expect(pluralize("Jann (Génie)", 2, "fr")).toBe("Janns (Génie)");
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement, and keep it honest.**

French pluralisation is genuinely irregular and this is a display label, not prose. Implement the four rules above (`-s/-x/-z` invariant, `-al → -aux`, `-eau/-eu → +x`, else `+s`), applied to the last word before any parenthetical. **Do not attempt full French morphology** — no `-ail → -aux` exception lists, no adjective agreement across compound names. Where the rules cannot be right, being predictable beats being clever.

Verify against the real French names before claiming correctness: run the function over every name in `data/i18n/fr/index/*.json` and report how many hit each rule, plus any output that looks wrong. Put that in the report.

- [ ] **Step 4: Wire it.** `pluralize` needs `lang` from the store at its one call site. The reachability guardrail (`store-actions-reachable.test.ts`) does not cover plain functions, so add a test that renders the Add button in French with quantity 2 and asserts the French plural — a unit test on the rule alone does not prove the call site passes `lang`.

- [ ] **Step 5: Commit** — `feat(app): pluralise French names by French rules`

---

## Deferred

- **Marking descriptions that remain untranslated after Task 2.** Unlike a creature name — where `Manticore` being identical in both languages is correct, which is why the name-level marker was removed — `description: null` is unambiguously untranslated and could be marked honestly. Left to the project owner; the earlier marker was removed for crying wolf, and this one would not.
- The guardrail cannot see literals inside `{...}` JSX expressions (documented in the design spec).
- Two upstream label-outside-braces typos (`wild-hunt-horse`, `vexgit`) worth reporting to the module's `erreurs-vo.md`.
