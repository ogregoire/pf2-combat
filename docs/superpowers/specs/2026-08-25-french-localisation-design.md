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
| Creatures | English creature name | **1271 / 1450 (87.7%)** |
| Conditions | English condition name | **43 / 43** |
| Ability glossary | English entry name | **445 / 447** |
| Traits (name + description) | `PF2E.Trait<Pascal>` from our `slug` | 904 / 535 available vs. our 426 slugs |

The 179 creatures with no French are almost all legacy Bestiary entries the
module never covered (Ahuizotl, Badger, Manticore, Mimic, Shoggoth). Two
creatures translate only via another pack's file; cross-pack fallback by name
is allowed and picks up both. The two unmatched glossary entries are
parenthesised Strigoi vampire abilities.

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

So the 179 untranslated creatures render in English inside an otherwise
French UI. That is the intended behaviour, not a defect — but it is
*visible*: the creature panel marks a fallback name, so the GM knows the
tracker is showing them the English one rather than a translation.

Loading is per-creature and lazy, matching the existing creature loader: the
French file for a creature is fetched when that creature is, and only when
`lang === "fr"`. Conditions, traits and glossary are small and load once.

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
- The catalogue guardrail above.

## Out of scope

- Languages other than French. `lang` is a two-value union; widening it is a
  later decision, and nothing here should pretend to be a general i18n
  framework it has not been tested as.
- Translating creature *search*. The quick-add parser matches English names;
  making it match French names too is a follow-up, called out here so it is
  not mistaken for an oversight.
- The 179 untranslated creatures. We do not machine-translate or hand-fill
  them; they fall back and say so.
