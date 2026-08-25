# French Localisation — Design

**Status:** proposed
**Depends on:** `2026-08-24-pf2-data-pipeline-design.md`, `2026-08-24-pf2-tracker-design.md`

## Goal

Run the whole tracker in French — creature names, actions, descriptions,
conditions, ability glossary, trait names and their hover text, and the
interface chrome — behind a remembered EN/FR toggle. French is the only name
shown when French is on: "Seigneur Cerf", not "Seigneur Cerf (The Stag Lord)".

## Source

`gitlab.com/pathfinder-fr/foundryvtt-pathfinder2-fr`, module `pf2-fr`, at the
version pinned in `data/manifest.json`. Fan translation, openly licensed,
independent of Black Book Editions. **Verified at v8.4.2** — the version this
design was measured against; the pin moves like the upstream pin does.

Two shapes matter:

- `babele/<variant>/fr/pf2e.<pack>.json` — Babele compendium translations.
  Four variants ship (`vf`, `vf-vo`, `vo-vf`, `vo`); bodies are French in all
  four and only the `name` field differs, so we take **`vf`** and compose any
  pairing in the app rather than baking it into the data.
- `lang/fr.json` — 5687 UI keys, including 904 `PF2E.Trait*` names and 535
  `PF2E.TraitDescription*` bodies.

### Measured coverage

| What | Join key | Coverage |
|---|---|---|
| Creatures | English creature name | **1420 / 1450 (97.9%)** |
| Conditions | English condition name | **43 / 43** |
| Ability glossary | English entry name | **445 / 447** |
| Traits (name + description) | `PF2E.Trait<Pascal>` from our `slug` | 904 names / 535 descriptions available vs. our 426 slugs |

Creature lookup resolves **own pack first**, then falls back across packs:
1269 resolve inside their own pack's file, another 151 only via some other
pack's (a legacy Bestiary creature translated under Monster Core, say).

Own-pack-first is load-bearing, not a tidiness preference. Five creatures we
ship are translated differently in different books — `Shambler` is *Tertre
errant* in Kingmaker and *Grand tertre* in Bestiary 1, and this is a Kingmaker
campaign. Taking the creature's own book's word for it settles all five by
construction. Of the 151 that must fall back, **zero** have sources that
disagree, so the fallback remains unambiguous and a disagreement there stays a
hard error.

Lookup is also scoped **by entity kind**: creature names are resolved only
against bestiary/monster-core/npc-core files, conditions only against
`conditionitems`, glossary only against the two ability-glossary files. Pooling
every `pf2e.*.json` together instead produces 109 name collisions, 24 of them
on names we consume, because the module translates one English string
differently for different kinds of thing — `Guard` is *Garde* the creature and
*Se défendre* the action. Within a kind, conditions and glossary have zero
disagreements and creatures have fourteen, five of which we ship and all five
of which own-pack-first resolves.

Thirty creatures have no French anywhere, and twenty of those are the
`Petitioner (Plane)` series — so it is really eleven distinct misses (Ankou,
Belker, Dread Wraith, Frost Troll, Hive Mother, Ifrit Pyrochemist, Manticore,
Quetz Couatl, Raven, Spark Bat, and the Petitioners). The two unmatched
glossary entries are parenthesised Strigoi vampire abilities.

## Data pipeline

`pf2data` gains a **`--fr` capability on the existing `update` flow**, not a
separate command: the French overlay is pinned, fetched, normalised, verified
and reported exactly like the English dataset, and must stay byte-identical
across reruns at a fixed pin. `data/manifest.json` grows `frRepo` and `frRef`
beside the existing `upstreamRepo`/`upstreamRef`.

Output mirrors the English layout so the app's loader changes shape, not
structure:

```
data/i18n/fr/creatures/<pack>/<slug>.json
data/i18n/fr/conditions.json
data/i18n/fr/glossary.json
data/i18n/fr/traits.json
data/i18n/fr/ui.json          # hand-authored, see below
```

### The item-id join

Babele keys a creature's per-item translations by **Foundry item id**
(10 984 of them across our packs; zero are name-keyed). Our normalised
creatures carry no item ids, and adding them would change the creature schema
for the benefit of one consumer.

The pipeline already holds the upstream actor JSON when it normalises, so it
resolves `item id → our array position` **at build time** and emits the
overlay keyed by **index**:

```json
{
  "name": "Seigneur Cerf",
  "publicNotes": "<p>…</p>",
  "actions":  [{ "name": "Amener",  "description": "<p>…</p>" }],
  "attacks":  [{ "name": "Dague" }]
}
```

Index, not name: 156 creatures carry two Strikes of the same name (a melee and
a thrown Dagger, Hatchet, Spear), so a name key silently collapses them. Each
entry also carries the English `name` it was resolved from, and `verify`
fails when a position's English name disagrees with the creature file — the
overlay must never drift out of alignment with the array it indexes.

A missing translation is `null` at that position, never an English fallback
baked into the French file: the *app* decides what to show when French is
absent, and the data must not hide the gap from `report`.

## App

### Language state

One field, `lang: "en" | "fr"`, on the persisted settings alongside the party
(same store, same disk record). Default `"en"`. The toggle lives in the
encounter header.

### Resolution

A single `useLang()`-backed `t()` resolves in one order, everywhere:

1. French string, if the overlay has one for this creature/condition/trait/key
2. otherwise the English string

So the 30 untranslated creatures render in English inside an otherwise
French UI. That is the intended behaviour, not a defect — but it is
*visible*: the creature panel marks a fallback name, so the GM knows the
tracker is showing them the English one rather than a translation.

Loading is per-creature and lazy, matching the existing creature loader: the
French file for a creature is fetched when that creature is, and only when
`lang === "fr"`. Conditions, traits and glossary are small and load once.

### Creature search

Reading the French Kingmaker book, the GM types what is printed there. So
when `lang === "fr"`, search matches **French names**, and the whole quick-add
path — `parseAddCommand` then `rankMatches` — runs against them.

The pipeline emits a French name overlay for the search index,
`data/i18n/fr/index/<pack>.json` (`id → French name`), loaded once alongside
the English index when French is on.

Three properties, each measured against all 1420 French names rather than
assumed:

- **`parseAddCommand` is unchanged.** Its quantity/initiative rule depends on
  no creature name starting or ending with a digit. Zero French names do —
  the same property that holds for the English names. `6 gobelin 13` parses
  exactly like `6 goblin 13`.
- **Matching ignores diacritics.** 41.4% of French names carry accents, and a
  GM typing at speed will not reach for them: `elementaire` must find
  `Quatoïde (Élémentaire, eau)`, `seigneur cerf` must find `Seigneur Cerf`.
  Both query and candidate are compared NFD-normalised with combining marks
  stripped, at every tier of `rankMatches` (exact, name-prefix, word-prefix,
  substring, subsequence). Ordering still breaks ties with `compareStrings` on
  the original strings — code-unit, never `localeCompare`, which is what made
  the dataset non-deterministic once already.
- **Punctuation is limited and known.** Across every French name the only
  non-alphanumeric characters are `'`, `(`, `)`, `,` and `-` — all straight
  ASCII, no typographic apostrophes. Parenthesised qualifiers ("Jann (Génie)",
  "Quatoïde (Élémentaire, eau)") participate in matching but must not outrank
  a hit on the name proper.

**Ten French names are shared by two creatures each.** Seven are the
legacy/remaster collisions the dataset already knows about (Barghest, Giant
Mantis, Quatoid, Quelaunt, Terotricus, Twigjack, Shambler); two are remaster
renames that genuinely converge (Grippli/Tripkee Scout → "Éclaireur tripkee",
Jann/Janni → "Jann (Génie)"). One is a real clash of distinct creatures:
**Sea Serpent and Sea Snake are both "Serpent de mer"** at wildly different
levels. Search results must therefore show level and book, so the GM can tell
those two apart at the moment of choosing.

### Interface strings

The chrome has no string catalogue today — literals sit inline in the
components. This work introduces `packages/app/src/i18n/`:

- `en.ts` — every user-visible literal, extracted from the components
- `fr.ts` — the French, authored as part of this work

French copy is authored to match the vocabulary of the French rulebooks, not
translated literally from our English labels. Where the tracker invented a
term with no book equivalent (the outcome ladder, the roll assistant's
prompts, "strikes this turn"), the French is chosen to read as table
language a GM would speak aloud.

### Guardrail

Per the standing rule that a defect seen more than once gets a check rather
than a resolution, and matching `store-actions-reachable.test.ts`:

`i18n-strings-complete.test.ts` fails when a component under
`src/components/**` contains a user-visible literal that is not in the
catalogue, and when a key in `en.ts` has no counterpart in `fr.ts`. It must
be demonstrated failing — an untranslated literal added, the failure observed
naming that literal, then reverted — before it counts as landed. Any
exclusion is an explicit, commented allowlist entry.

## Testing

- Pipeline: fixture-driven join tests, including the two-same-named-Strikes
  case and a creature with no French entry; an idempotency test that reruns
  at a fixed pin and diffs bytes; a `verify` test for the misaligned-index
  failure.
- App: the resolution order above, both toggle directions, persistence across
  a reload, and a French render of a creature that has no French entry.
- Search: an accented name found by an unaccented query, a French name found
  when `lang === "fr"` and not when it is `"en"`, `6 gobelin 13` parsing to
  quantity/initiative, and "Serpent de mer" returning both creatures
  distinguishably.
- The catalogue guardrail above.

## Out of scope

- Languages other than French. `lang` is a two-value union; widening it is a
  later decision, and nothing here should pretend to be a general i18n
  framework it has not been tested as.
- The 30 untranslated creatures. We do not machine-translate or hand-fill
  them; they fall back to English and say so.
