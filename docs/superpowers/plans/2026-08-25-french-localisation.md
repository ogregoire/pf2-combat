# French Localisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the entire tracker in French — creature names, actions, descriptions, conditions, glossary, trait hover text, interface chrome and creature search — behind a remembered EN/FR toggle.

**Architecture:** `pf2data` gains a second pinned upstream (the `pf2-fr` Babele module) and emits a French *overlay* mirroring the English data layout under `data/i18n/fr/`. The app gains a `lang` setting and a single resolution rule — French if present, English otherwise — plus a hand-authored string catalogue for the chrome, which has no upstream source.

**Tech Stack:** TypeScript, zod, Vitest, React 19, Zustand+Immer, idb.

**Spec:** `docs/superpowers/specs/2026-08-25-french-localisation-design.md`

## Global Constraints

- **Ordering is `compareStrings` (code-unit), never `localeCompare`.** Locale-dependent sorting already caused one real non-determinism bug. This applies to French strings too — accents must not reach a locale collator.
- **All data output goes through `writeJson`/`stableStringify`** (`packages/pf2data/src/io/write.ts`), which deep-sorts keys. Reruns at a fixed pin must be byte-identical.
- **`packages/app/src/rules/**` stays pure** — no I/O, no `Date.now()`, no `Math.random()`.
- **Only the `vf` Babele variant is consumed.** Never `vf-vo`/`vo-vf`/`vo`; the app composes any pairing itself. When French is on, the French name is the *only* name shown.
- **A missing translation is `null` in the data, never an English value copied in.** The app decides the fallback; the data must not hide the gap from `report`.
- **Every guardrail test must be demonstrated failing** before it counts as landed: break a real call site, observe the failure naming the right thing, revert, re-run green. Say so in the report.
- Node's `String.prototype.normalize` is available; no new runtime dependency is needed or permitted for diacritic folding.

---

## File Structure

**`packages/pf2data/src/`**
- `config.ts` — *modify*: add the `french` upstream block
- `stages/fetch.ts` — *modify*: `fetchFrench`, a second sparse checkout
- `stages/babele.ts` — *create*: load Babele packs, build the English-name lookup
- `stages/i18n.ts` — *create*: emit every `data/i18n/fr/**` file
- `stages/verify.ts` — *modify*: overlay alignment checks
- `normalize/actions.ts`, `normalize/attacks.ts` — *modify*: carry `foundryId`

**`packages/schema/src/`**
- `manifest.ts` — *modify*: `frRepo`, `frRef`
- `i18n.ts` — *create*: overlay schemas

**`packages/app/src/`**
- `i18n/en.ts`, `i18n/fr.ts`, `i18n/index.ts` — *create*: the chrome catalogue and `t()`
- `data/catalog.ts` — *modify*: overlay loaders
- `data/i18nOverlay.ts` — *create*: the resolution rule, one place
- `rules/fold.ts` — *create*: diacritic folding (pure)
- `rules/rankMatches.ts`, `data/catalog.ts#searchCreatures` — *modify*: fold before matching
- `state/store.ts`, `state/persist.ts` — *modify*: `lang` + its persistence
- components — *modify*: draw copy from the catalogue

---

## Task 1: Pin the French source

**Files:**
- Modify: `packages/schema/src/manifest.ts`
- Modify: `packages/pf2data/src/config.ts`
- Modify: `pf2data.config.json` (repo root — check its actual path first with `git ls-files | grep config.json`)
- Test: `packages/pf2data/test/config.test.ts`

**Interfaces:**
- Produces: `Pf2DataConfig["french"]` = `{ repo: string; branch: string }`; `Manifest["frRepo"]`, `Manifest["frRef"]`.

- [ ] **Step 1: Write the failing tests**

```ts
// config.test.ts
it("parses the french upstream block", () => {
  const cfg = Pf2DataConfigSchema.parse({
    upstream: { repo: "https://github.com/foundryvtt/pf2e", branch: "master" },
    french: { repo: "https://gitlab.com/pathfinder-fr/foundryvtt-pathfinder2-fr", branch: "master" },
    packs: [{ name: "pathfinder-monster-core", kind: "creatures" }],
  });
  expect(cfg.french.repo).toContain("pathfinder-fr");
});

it("rejects a config with no french block", () => {
  expect(() => Pf2DataConfigSchema.parse({
    upstream: { repo: "https://github.com/foundryvtt/pf2e", branch: "master" },
    packs: [{ name: "x", kind: "creatures" }],
  })).toThrow();
});
```

- [ ] **Step 2: Run them and watch both fail**

Run: `npx vitest run packages/pf2data/test/config.test.ts`
Expected: FAIL — `french` is not in the schema.

- [ ] **Step 3: Implement**

In `config.ts`, beside `upstream`:

```ts
  french: z.object({
    repo: z.string().url(),
    branch: z.string().min(1),
  }),
```

In `manifest.ts`, beside `upstreamRef`:

```ts
  frRepo: z.string(),
  frRef: z.string(),
```

Then add the `french` block to the real config file. The branch name is **not** assumed — determine it from the clone:
`git ls-remote --symref https://gitlab.com/pathfinder-fr/foundryvtt-pathfinder2-fr HEAD` and use what it reports.

- [ ] **Step 4: Tests pass; `npm run typecheck` is clean**

Note `ManifestSchema` now requires two fields the committed `data/manifest.json` lacks. Anything that parses it will fail until Task 7 regenerates it. If that blocks this task's tests, make the two fields `.default("")` **and leave a `TODO(task-7)` comment saying the default must be removed once the manifest is regenerated** — do not leave a permanent default.

- [ ] **Step 5: Commit** — `feat(pf2data): pin the French translation source`

---

## Task 2: Fetch the French module

**Files:**
- Modify: `packages/pf2data/src/stages/fetch.ts`
- Test: `packages/pf2data/test/fetch.test.ts`

**Interfaces:**
- Consumes: `Pf2DataConfig["french"]` (Task 1).
- Produces: `fetchFrench(options): { ref: string; babeleDir: string; langPath: string }`.

- [ ] **Step 1: Write the failing test**

Follow the existing `fetch.test.ts` pattern exactly — it injects a `RunGit` spy and asserts the git argv. Assert:

```ts
it("sparse-checks out only the vf variant and the lang dir", () => {
  const calls: string[][] = [];
  const run: RunGit = (args) => { calls.push(args); return "abc123\n"; };
  fetchFrench({ config, cacheDir: ".cache-fr", pinnedRef: "abc123", useLatest: false, run });
  const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
  expect(sparse).toContain("babele/vf/fr");
  expect(sparse).toContain("lang");
  // The other three naming variants are 138 MB we never read.
  expect(sparse.join(" ")).not.toContain("vf-vo");
  expect(sparse.join(" ")).not.toContain("vo-vf");
});
```

- [ ] **Step 2: Run it and watch it fail** — `fetchFrench` is not exported.

- [ ] **Step 3: Implement**

`fetchFrench` mirrors `fetchUpstream` — same clone/fetch/sparse/checkout sequence, same "no rollback, every step retry-safe" property, a **separate cache directory** so the two checkouts never fight. Constants:

```ts
export const FR_BABELE_DIR = "babele/vf/fr";
export const FR_LANG_DIR = "lang";
export const FR_LANG_PATH = "lang/fr.json";
```

Sparse-checkout is cone mode: pass **directories only**. `babele/vf/fr` is a directory and is fine; a bare file path is not (that is what broke `static/lang/en.json` before).

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(pf2data): fetch the French Babele module`

---

## Task 3: Load Babele, with the cross-pack fallback

**Files:**
- Create: `packages/pf2data/src/stages/babele.ts`
- Test: `packages/pf2data/test/babele.test.ts`

**Interfaces:**
- Produces:

```ts
export interface BabeleEntry {
  name: string;
  description?: string;
  blurb?: string;
  items?: Record<string, { name?: string; description?: string }>;
}
/** English creature/condition/glossary name -> its French entry. */
export type BabeleTable = Map<string, BabeleEntry>;
export function loadBabele(babeleDir: string): BabeleTable;
```

- [ ] **Step 1: Write the failing tests**

Use fixture files written into a temp dir, not the real checkout.

```ts
it("merges every pack file into one name-keyed table", () => {
  // two files, one entry each
  const table = loadBabele(dir);
  expect(table.get("The Stag Lord")!.name).toBe("Seigneur Cerf");
  expect(table.get("Manticore")!.name).toBe("Manticore FR");
});

it("keeps the first file's entry when two agree, deterministically by filename", () => {
  // same English name in two files, same French name
  expect(table.get("Barghest")!.name).toBe("Barghest");
});

it("throws when two files disagree about a French name", () => {
  // same English name, DIFFERENT French names
  expect(() => loadBabele(dir)).toThrow(/disagree/i);
});
```

The third test is the important one. Cross-pack fallback is safe **because** it was measured to be unambiguous (zero disagreements across all 1450 creatures); this test is what keeps that true when the pin moves. It must name both files and both French values in the message so a future disagreement is diagnosable, not just fatal.

- [ ] **Step 2: Run them and watch all three fail**

- [ ] **Step 3: Implement**

Read every `pf2e.*.json` in `babeleDir` in `compareStrings` filename order. Each file's `entries` is an object keyed by English name; skip any file whose `entries` is not an object. First writer wins; a second writer with a *different* `name` throws.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(pf2data): load the Babele translation tables`

---

## Task 4: Carry the Foundry item id through normalisation

**Files:**
- Modify: `packages/pf2data/src/normalize/actions.ts`
- Modify: `packages/pf2data/src/normalize/attacks.ts`
- Test: `packages/pf2data/test/actions.test.ts`, `packages/pf2data/test/attacks.test.ts`

**Interfaces:**
- Produces: `NormalizedAction.foundryId: string`, `NormalizedAttack.foundryId: string`.

Why: Babele keys a creature's item translations by Foundry item id — 10 984 of them across our packs, and **zero** are name-keyed. Our normalised arrays are sorted and drop the id, so the overlay cannot be aligned without it.

- [ ] **Step 1: Write the failing tests**

```ts
it("carries the source item's _id, so a translation can be aligned to the sorted array", () => {
  const actions = normalizeActions([
    { _id: "aaaaaaaaaaaaaaaa", name: "Zeta", type: "action", system: { actionType: { value: "action" }, actions: { value: 1 }, description: { value: "" } } },
    { _id: "bbbbbbbbbbbbbbbb", name: "Alpha", type: "action", system: { actionType: { value: "action" }, actions: { value: 1 }, description: { value: "" } } },
  ], {});
  // Sorted by name, so the ids come back in the sorted order, not input order.
  expect(actions.map((a) => a.foundryId)).toEqual(["bbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaa"]);
});
```

Write the equivalent for `normalizeAttacks`.

- [ ] **Step 2: Run and watch both fail**

- [ ] **Step 3: Implement**

Add `_id: z.string()` to `ActionItemSchema` and `AttackItemSchema`, add `foundryId: string` to both `Normalized*` interfaces, and set it when pushing. **Change nothing about the sort order** — the whole point is to learn the existing order, not alter it.

- [ ] **Step 4: Tests pass, and `npm test` is fully green**

`CreatureSchema` and its `ActionSchema`/`AttackSchema` are plain `z.object`, which *strips* unknown keys rather than rejecting them, so `foundryId` disappears at `CreatureSchema.parse` in `normalizeCreature` and never reaches `data/creatures/**`. Confirm that by regenerating one creature file and diffing it — **the committed dataset must not change in this task.**

- [ ] **Step 5: Commit** — `refactor(pf2data): carry item ids through normalisation`

---

## Task 5: Emit the per-creature French overlay

**Files:**
- Create: `packages/pf2data/src/stages/i18n.ts`
- Create: `packages/schema/src/i18n.ts`
- Modify: `packages/schema/src/index.ts` (export the new schemas)
- Test: `packages/pf2data/test/i18n.test.ts`

**Interfaces:**
- Consumes: `BabeleTable` (Task 3), `NormalizedAction/Attack.foundryId` (Task 4).
- Produces:

```ts
export const CreatureI18nSchema = z.object({
  name: z.string(),
  publicNotes: z.string().nullable(),
  actions: z.array(z.object({
    en: z.string(),                    // the English name this position holds
    name: z.string().nullable(),
    description: z.string().nullable(),
  })),
  attacks: z.array(z.object({
    en: z.string(),
    name: z.string().nullable(),
  })),
});
export function buildCreatureI18n(args: {
  creatureName: string;
  actions: { name: string; foundryId: string }[];
  attacks: { name: string; foundryId: string }[];
  table: BabeleTable;
}): CreatureI18n | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("aligns item translations to array position, not name", () => {
  // Two attacks BOTH named "Dagger" (a melee and a thrown one) with
  // different ids — 156 real creatures look like this, and a name key
  // silently collapses them.
  const out = buildCreatureI18n({
    creatureName: "Thorn River Bandit",
    actions: [],
    attacks: [
      { name: "Dagger", foundryId: "id-melee" },
      { name: "Dagger", foundryId: "id-thrown" },
    ],
    table: new Map([["Thorn River Bandit", {
      name: "Bandit de la rivière aux Épines",
      items: { "id-melee": { name: "Dague" }, "id-thrown": { name: "Dague de jet" } },
    }]]),
  })!;
  expect(out.attacks.map((a) => a.name)).toEqual(["Dague", "Dague de jet"]);
});

it("records the English name at each position, so verify can catch drift", () => {
  expect(out.attacks[0]!.en).toBe("Dagger");
});

it("returns null for a creature with no French entry", () => {
  expect(buildCreatureI18n({ creatureName: "Manticore", actions: [], attacks: [], table: new Map() })).toBeNull();
});

it("uses null, never the English text, for an item the table does not cover", () => {
  expect(out.actions[0]!.description).toBeNull();
});
```

- [ ] **Step 2: Run and watch all four fail**

- [ ] **Step 3: Implement**

Look the creature up by English name. For each action/attack position, look its `foundryId` up in the entry's `items`. `description` comes from `items[id].description`, `publicNotes` from the entry's `description` field (Babele's mapping calls it `description` → `system.details.publicNotes`). Absent → `null`.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(pf2data): build the per-creature French overlay`

---

## Task 6: Emit the reference overlays

**Files:**
- Modify: `packages/pf2data/src/stages/i18n.ts`
- Test: `packages/pf2data/test/i18n.test.ts`

**Interfaces:**
- Produces: `buildIndexI18n`, `buildConditionsI18n`, `buildGlossaryI18n`, and a French `buildTraits` call.

Four outputs:

| File | Source | Join | Measured |
|---|---|---|---|
| `data/i18n/fr/index/<pack>.json` | Babele table | English creature name | 1420/1450 |
| `data/i18n/fr/conditions.json` | `pf2e.conditionitems.json` | English condition name | 43/43 |
| `data/i18n/fr/glossary.json` | the two ability-glossary files | English entry name | 445/447 |
| `data/i18n/fr/traits.json` | `lang/fr.json` | slug → `PF2E.Trait*` key | 423/426 desc, 413/426 names |

- [ ] **Step 1: Write the failing tests**

```ts
it("emits an id -> french name map for the search index", () => {
  expect(buildIndexI18n(indexEntries, table)).toEqual({
    "kingmaker-bestiary/the-stag-lord": "Seigneur Cerf",
  });
});

it("omits an untranslated creature rather than echoing its English name", () => {
  expect(buildIndexI18n([{ id: "x/manticore", name: "Manticore" }], new Map())).toEqual({});
});

it("reuses buildTraits against the French lang table, so slugs stay identical", () => {
  const en = buildTraits({ "PF2E.TraitDescriptionAgile": "The multiple attack penalty…", "PF2E.TraitAgile": "Agile" });
  const fr = buildTraits({ "PF2E.TraitDescriptionAgile": "La pénalité d'attaques multiples…", "PF2E.TraitAgile": "Agile" });
  expect(fr.map((t) => t.slug)).toEqual(en.map((t) => t.slug));
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

`buildTraits` is already key-driven, so the French traits file is `buildTraits(frenchLangTable)` — no new parsing, and the slugs are identical by construction, which is what lets the app look a trait up once and get either language. **Do not write a second trait builder.**

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(pf2data): build the French reference overlays`

---

## Task 7: Wire the overlay into `update`, verify and report

**Files:**
- Modify: `packages/pf2data/src/stages/index.ts`
- Modify: `packages/pf2data/src/stages/verify.ts`
- Modify: `packages/pf2data/src/report.ts`
- Modify: `packages/pf2data/src/cli.ts`
- Test: `packages/pf2data/test/verify.test.ts`, `packages/pf2data/test/cli.test.ts`

This is the task where the French overlay becomes reachable. **Nothing before it changes what `update` produces.** Per the spec's own instruction, name every call site explicitly: `cli.ts` calls the orchestrator, the orchestrator calls `fetchFrench` → `loadBabele` → `buildCreatureI18n` per creature → the four reference builders → `writeJson` for each → `verifyI18n` → `report`.

- [ ] **Step 1: Write the failing tests**

```ts
it("fails when an overlay position's English name disagrees with the creature", () => {
  const problems = verifyI18n(
    { id: "p/c", actions: [{ name: "Rend" }], attacks: [] },
    { name: "X", publicNotes: null, actions: [{ en: "Grab", name: "Agripper", description: null }], attacks: [] },
  );
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/Rend/);
  expect(problems[0]).toMatch(/Grab/);
});

it("fails when the overlay has a different number of positions than the creature", () => { /* … */ });
it("passes for an aligned overlay", () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

`verifyI18n` compares, per position, the overlay's `en` against the creature's action/attack name, and compares array lengths. This is the guard that the index-keying scheme depends on — an upstream reorder must be a loud failure, never a silently mistranslated Strike.

Report gains a French block: creatures translated / total, and the untranslated **count plus the list** (30 today, 19 of them the `Petitioner (Plane)` series). A silent coverage drop is exactly the kind of regression this report exists to catch.

- [ ] **Step 4: Regenerate and verify idempotency**

```bash
npm run -w @pf2/pf2data build && node packages/pf2data/dist/cli.js update
git diff --stat            # expect: data/i18n/** added, manifest changed
node packages/pf2data/dist/cli.js update
git status --porcelain     # expect: NOTHING new — byte-identical rerun
```

Then re-run the whole thing under a different locale to prove no collator crept in — this is not optional, it is how the original non-determinism bug was caught:

```bash
LC_ALL=da_DK.UTF-8 node packages/pf2data/dist/cli.js update && git status --porcelain
```

Also remove the `TODO(task-7)` defaults from `ManifestSchema` (Task 1) now that the manifest carries the fields.

- [ ] **Step 5: Commit** — `feat(pf2data): emit the French overlay from update`

Commit the generated `data/i18n/**` in this commit. Expect roughly 6 MB across ~1450 small files.

---

## Task 8: Load the overlay in the app

**Files:**
- Modify: `packages/app/src/data/catalog.ts`
- Create: `packages/app/src/data/i18nOverlay.ts`
- Test: `packages/app/test/i18n-overlay.test.ts`

**Interfaces:**
- Produces: `loadCreatureI18n(id, fetchFn)`, `loadIndexI18n(pack, fetchFn)`, `loadConditionsI18n`, `loadGlossaryI18n`, `loadTraitsI18n`; and the single resolution helper:

```ts
/** French if present, English otherwise. The ONLY place this rule lives. */
export function pick<T>(fr: T | null | undefined, en: T): T;
```

- [ ] **Step 1: Write the failing tests**

```ts
it("prefers French and falls back to English", () => {
  expect(pick("Seigneur Cerf", "The Stag Lord")).toBe("Seigneur Cerf");
  expect(pick(null, "Manticore")).toBe("Manticore");
  expect(pick(undefined, "Manticore")).toBe("Manticore");
});

it("treats an empty French string as present, not missing", () => {
  // A translator may legitimately blank a field; only null/undefined mean absent.
  expect(pick("", "Something")).toBe("");
});

it("resolves a 404 overlay to null rather than throwing", async () => {
  // An untranslated creature has NO overlay file. That is normal, not an error.
  await expect(loadCreatureI18n("x/manticore", notFoundFetch)).resolves.toBeNull();
});
```

The 404 case matters: 30 creatures have no overlay file at all, and a throw there would break adding them.

- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement** — follow `catalog.ts`'s existing `getJson` shape; the creature loader returns `null` on a non-OK response instead of throwing.
- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): load the French overlay`

---

## Task 9: The `lang` setting and its toggle

**Files:**
- Modify: `packages/app/src/state/store.ts`
- Modify: `packages/app/src/state/persist.ts`
- Modify: `packages/app/src/components/EncounterScreen.tsx` (the header)
- Test: `packages/app/test/lang.test.tsx`

**Interfaces:**
- Produces: `Lang = "en" | "fr"`; store field `lang`; action `setLang(lang: Lang): void`; `saveSettings`/`loadSettings` in `persist.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it("defaults to English", () => expect(useEncounter.getState().lang).toBe("en"));

it("setLang switches and persists", async () => {
  useEncounter.getState().setLang("fr");
  expect(useEncounter.getState().lang).toBe("fr");
  await waitFor(async () => expect(await loadSettings()).toEqual({ lang: "fr" }));
});

it("restores the saved language on load", async () => { /* … */ });

it("renders a toggle that switches the language", async () => {
  render(<EncounterScreen />);
  await user.click(screen.getByRole("button", { name: /français/i }));
  expect(useEncounter.getState().lang).toBe("fr");
});
```

**The last test is not optional.** Four store actions in this codebase shipped with no UI call site at all, each making a whole feature unreachable while store-level tests passed. A test that drives the store proves the store; only a test that drives the UI proves the feature. `store-actions-reachable.test.ts` will also fail if `setLang` has no call site — do not add it to that test's allowlist.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

`persist.ts` already versions its payloads and migrates forward; add the settings record the same way. A payload with no `lang` reads as `"en"` — an existing saved fight must still open.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): add the remembered language toggle`

---

## Task 10: The chrome string catalogue

**Files:**
- Create: `packages/app/src/i18n/en.ts`, `packages/app/src/i18n/fr.ts`, `packages/app/src/i18n/index.ts`
- Test: `packages/app/test/i18n-catalogue.test.ts`

**Interfaces:**
- Produces: `STRINGS_EN`, `STRINGS_FR` (same key union, enforced by the type), `useT(): (key: StringKey) => string`.

- [ ] **Step 1: Write the failing tests**

```ts
it("fr covers every en key", () => {
  expect(Object.keys(STRINGS_FR).sort(compareStrings))
    .toEqual(Object.keys(STRINGS_EN).sort(compareStrings));
});

it("has no key whose French equals its English, unless it is a proper noun", () => {
  // Catches keys copied across and never translated. ALLOWLIST holds the
  // handful that legitimately match ("PF2", "HP" if kept, ...).
  const identical = Object.keys(STRINGS_EN).filter((k) => STRINGS_EN[k] === STRINGS_FR[k]);
  expect(identical.filter((k) => !ALLOWLIST.has(k))).toEqual([]);
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Type `STRINGS_FR` as `Record<keyof typeof STRINGS_EN, string>` so a missing key is a *compile* error, not just a test failure.

French copy follows the French rulebooks' vocabulary, not a literal rendering of our English labels — "Frappe réactive" for Attack of Opportunity, not "Attaque d'opportunité". Where the tracker invented a term with no book equivalent (the outcome ladder, the roll assistant's prompts, "strikes this turn"), choose French that reads as table language a GM would say aloud. When unsure of a book term, check `lang/fr.json` in the French checkout — it is the same translators' own vocabulary.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): add the interface string catalogue`

---

## Task 11: Draw the chrome from the catalogue

**Files:**
- Modify: every file under `packages/app/src/components/**` carrying user-visible copy
- Test: the existing component tests

This is the mechanical bulk. Replace each inline literal with a catalogue lookup, adding the key to `en.ts`/`fr.ts` as you go.

- [ ] **Step 1: Inventory first**

List every user-visible literal before changing any of them, and put the list in the report. Cover JSX text, `aria-label`, `title`, `placeholder`, and `alt`. Existing tests query by visible text and accessible name, so both must keep working in English.

- [ ] **Step 2: Convert component by component, running that component's test after each**

- [ ] **Step 3: `npm test` green and `npm run typecheck` clean**

Tests assert English copy; with `lang` defaulting to `"en"` they must all still pass **unchanged**. If a test needs editing to accommodate a key, that is a signal the copy changed — stop and report it rather than adjusting the test.

- [ ] **Step 4: Commit** — `refactor(app): draw interface copy from the catalogue`

---

## Task 12: Render creatures in French

**Files:**
- Modify: `packages/app/src/components/ActiveCombatant.tsx`, `ActionCard.tsx`, `StrikeCard.tsx`, `CombatantRow.tsx`, `ActionList.tsx`
- Modify: `packages/app/src/state/store.ts` (carry the overlay onto the combatant when it is added)
- Test: `packages/app/test/french-creature.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it("shows the French name only — never the English alongside it", async () => {
  // lang = fr, Stag Lord added with its overlay
  expect(screen.getByText("Seigneur Cerf")).toBeTruthy();
  expect(screen.queryByText("The Stag Lord")).toBeNull();
  expect(screen.queryByText(/Seigneur Cerf \(/)).toBeNull();
});

it("translates action and Strike names and descriptions", async () => { /* … */ });

it("falls back to English for an untranslated creature, and marks that it did", async () => {
  // Manticore: no overlay at all
  expect(screen.getByText("Manticore")).toBeTruthy();
  expect(screen.getByTitle(/pas de traduction|not translated/i)).toBeTruthy();
});

it("switching back to English restores the English names", async () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Fetch the overlay when the creature is fetched, and only when `lang === "fr"`. Every read goes through `pick` (Task 8). The fallback marker is a small, quiet indicator with a `title` — the GM needs to know the tracker is showing English, not wonder whether that *is* the French name.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): render creatures in French`

---

## Task 13: Search in French

**Files:**
- Create: `packages/app/src/rules/fold.ts`
- Modify: `packages/app/src/rules/rankMatches.ts`
- Modify: `packages/app/src/data/catalog.ts` (`searchCreatures`)
- Modify: `packages/app/src/components/QuickAdd.tsx`, `AddCombatants.tsx`
- Test: `packages/app/test/french-search.test.tsx`, `packages/app/test/fold.test.ts`

**There are two search paths and both must change**: `rankMatches` (QuickAdd) and `searchCreatures` (AddCombatants). Changing one and not the other leaves half the feature English.

- [ ] **Step 1: Write the failing tests**

```ts
// fold.test.ts — pure
it("strips diacritics", () => {
  expect(fold("Quatoïde (Élémentaire, eau)")).toBe("quatoide (elementaire, eau)");
  expect(fold("Seigneur Cerf")).toBe("seigneur cerf");
});

// french-search.test.tsx
it("finds an accented name from an unaccented query", async () => {
  // 41.4% of French names carry accents; nobody types them at speed.
  expect(rankMatches(entries, "elementaire").map((e) => e.name)).toContain("Quatoïde (Élémentaire, eau)");
});

it("parses quantity and initiative around a French name", () => {
  // Verified against all 1420 French names: none starts or ends with a digit.
  expect(parseAddCommand("6 gobelin 13")).toEqual({ quantity: 6, nameQuery: "gobelin", initiative: 13 });
});

it("searches English names when lang is en and French names when it is fr", async () => { /* both directions */ });

it("distinguishes the two creatures both called Serpent de mer", async () => {
  // Sea Serpent and Sea Snake collide in French at very different levels.
  const results = searchCreatures(entries, "serpent de mer");
  expect(results).toHaveLength(2);
  results.forEach((r) => expect(screen.getByText(new RegExp(`level ${r.level}`, "i"))).toBeTruthy());
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

```ts
/** NFD splits a letter from its combining marks; the range strips the marks.
 * Pure and locale-independent — never localeCompare, which is what made the
 * dataset non-deterministic once already. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
```

Fold **both sides at every tier** of `rankMatches` (exact, name-prefix, word-prefix, substring, subsequence) and in `searchCreatures`. Rank on folded strings; **order ties with `compareStrings` on the originals**. A parenthesised qualifier still matches but must not outrank a hit on the name proper.

`parseAddCommand` needs no change — assert that, do not modify it.

Results already carry level and book in `IndexEntry`; make sure both are *shown*, which is what makes the Serpent de mer pair distinguishable.

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): search creatures by their French names`

---

## Task 14: French conditions, traits and glossary

**Files:**
- Modify: `packages/app/src/hooks/useTraitGlossary.ts`
- Modify: `packages/app/src/components/TraitTag.tsx`, `RowPopover.tsx` (the condition picker), `TurnManager.tsx` (turn notifications)
- Test: `packages/app/test/french-reference.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it("names conditions in French on the chip and in the picker", async () => {
  expect(screen.getByText("EFFRAYÉ 2")).toBeTruthy();
});

it("shows French trait hover text", async () => {
  expect(screen.getByText("SOPHISTICATION").title).toMatch(/^Les actions avec le trait/);
});

it("keeps the English trait text when French has none", async () => {
  // gnoll, grippli and environment have no French description (remaster renames).
  expect(screen.getByText("GRIPPLI").title).toMatch(/^Grippli are/);
});

it("states start-of-turn notifications in French", async () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement** — trait slugs are identical across languages by construction (Task 6), so this is a table swap, not a re-keying.
- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `feat(app): translate conditions, traits and the glossary`

---

## Task 15: The catalogue guardrail

**Files:**
- Create: `packages/app/test/i18n-strings-complete.test.ts`
- Test: itself

Model it on `packages/app/test/store-actions-reachable.test.ts`, which does the same job for store actions — read that file first and match its shape and its allowlist discipline.

- [ ] **Step 1: Write the test**

It fails when a component under `src/components/**` contains a user-visible literal absent from the catalogue, and when an `en.ts` key has no `fr.ts` counterpart. Strip comments before scanning, as the existing guardrail does. Every exclusion is an explicit allowlist entry with a comment saying why.

- [ ] **Step 2: Demonstrate it failing — this is required, not a formality**

Add a literal like `<span>Round</span>` to a real component, run the test, confirm it fails **naming that literal**, then revert and confirm green. Put the observed failure output in the report. A guardrail nobody has seen fail is a guardrail nobody knows works.

- [ ] **Step 3: Report on false positives**

If the check cannot avoid flagging legitimate non-copy (units, symbols, mono-spaced numerals), say so plainly and narrow its scope rather than shipping a noisy test. A guardrail people learn to mute is worse than none — the reverse-direction check for dead UI state was declined on exactly these grounds, and that was the right call.

- [ ] **Step 4: `npm test` green**
- [ ] **Step 5: Commit** — `test(app): fail when interface copy is missing from the catalogue`

---

## Task 16: Documentation

**Files:**
- Modify: `data/SCHEMA.md`, `README.md`, `packages/pf2data/README.md` (whichever exist)
- Modify: `docs/superpowers/specs/2026-08-25-french-localisation-design.md`

- [ ] **Step 1: Document the overlay layout and the index-keying rule** in `data/SCHEMA.md`, including why alignment is verified.
- [ ] **Step 2: Document `--latest` behaviour for two pins** — moving the English pin and the French pin are separate decisions; say which flag does what.
- [ ] **Step 3: Add an "as delivered" section to the spec**, in the shape the tracker spec uses: what shipped, what departed from the design and why, what is deferred.
- [ ] **Step 4: Record the licence and attribution** for the French module — fan translation, openly licensed, independent of Black Book Editions — wherever the project credits its data sources.
- [ ] **Step 5: Commit** — `docs: document the French overlay`

---

## Deferred

- Languages other than French. `lang` is a two-value union; widening it is a later decision.
- The 30 untranslated creatures. They fall back and say so.
- Translating the two Strigoi glossary entries and the three legacy trait descriptions (`gnoll`, `grippli`, `environment`) that the module renamed away.
