# PF2 Data Pipeline (`pf2data`) — Design

**Date:** 2026-08-24
**Status:** Approved
**Sub-project:** 1 of 3 (data pipeline · tracker app · rules engine)

## Purpose

Produce a normalized, committed, statically-servable dataset of Pathfinder 2e
creatures and conditions for the PF2 Combat Tracker, derived from the
`foundryvtt/pf2e` Foundry VTT system repository.

The tracker is deployed to GitHub Pages at `ogregoire.be/pf2-combat-tracker`
(repository `github.com/ogregoire/pf2-combat`). There is no backend. All data
must therefore be prebuilt, committed, and fetchable as static files.

## Context

The GM runs Pathfinder Kingmaker (10th Anniversary Edition) in person, using
Remastered rules. Kingmaker's stat blocks cite the legacy Bestiary 1 and
Bestiary 2, so the dataset must carry legacy creatures alongside remastered
ones rather than filtering legacy content out.

### Upstream findings

Established by inspecting `foundryvtt/pf2e` at `master`:

- Creature actors are **self-contained**. Spells, actions, attacks and gear are
  embedded as `items[]` on the actor. No cross-pack resolution is needed to
  render a complete stat block. (Nyrissa: 64 embedded spells, 3 spellcasting
  entries, 13 actions.)
- **Reaction triggers are recoverable.** They are not a structured field; they
  live in the description HTML as `<p><strong>Trigger</strong> …</p>` preceding
  an `<hr />`. Example: Akiros Ismort's "No Escape" has `system.trigger === null`
  but the trigger text is present in the description.
- **UUID links use legacy pack ids** that no longer match directory names:
  `conditionitems` → `conditions`, `spells-srd` → `spells`,
  `actionspf2e` → `actions`. An alias table is required.
- **Some packs are nested.** `pathfinder-npc-core` contains subdirectories; the
  walker must recurse rather than flat-list.
- **Legacy alignment traits persist** in legacy actors (e.g. `chaotic` on
  Akiros). These are removed in the Remaster and must be stripped.
- **Foundry already deduplicated the bestiaries.** Creatures remastered into
  Monster Core were removed from `pathfinder-bestiary`. Probes confirm
  `goblin-warrior`, `wolf`, `zombie-shambler`, `ogre-warrior`,
  `bugbear-tormentor` exist only in Monster Core, while `troll`, `hill-giant`
  and `owlbear` exist only in Bestiary 1 (Monster Core renamed troll to
  `forest-troll` / `troll-warleader`). Residual slug collisions total 7:
  `barghest`, `giant-mantis`, `quatoid`, `quelaunt`, `terotricus` (Bestiary 1),
  one in Bestiary 2, one in Bestiary 3.
- Every actor carries `system.details.publication` with `license`, `remaster`
  (boolean) and `title`. This is the authoritative legacy/remaster
  discriminator — a per-actor flag, not a per-repository fork.

### Pack selection

| Pack | Creatures | Raw size |
|---|---|---|
| `pathfinder-monster-core` | 492 | 14.3 MB |
| `pathfinder-bestiary` | 176 | 6.9 MB |
| `pathfinder-bestiary-2` | 331 | 8.5 MB |
| `kingmaker-bestiary` | 241 | 9.4 MB |
| `pathfinder-npc-core` | ~23 (nested) | small |
| `kingmaker-features` | 9 | small |
| `conditions` | 43 | 0.07 MB |
| `bestiary-ability-glossary-srd` | 55 | 0.04 MB |
| `bestiary-family-ability-glossary` | 51 | 0.01 MB |

Approximately **1263 creatures, ~39 MB raw**.

`pathfinder-bestiary-3` is deliberately excluded: Kingmaker's introduction
limits itself to Bestiary 1 and 2. Including it later is a one-line config
change requiring no code change.

## Architecture

Four stages behind a single CLI.

```
fetch      git sparse-checkout of the foundryvtt/pf2e pack subset -> .cache/
normalize  Foundry actor JSON -> tracker schema
index      emit per-book search indexes and the book catalog
verify     zod schema validation + invariant assertions
```

`fetch` uses `git clone --filter=blob:none --sparse`, so updates are
incremental and the upstream commit SHA is captured for provenance. `.cache/`
is gitignored; only normalized output is committed.

### Idempotency

The tool must be re-runnable without producing spurious changes, while still
being able to pull newer upstream data. This is resolved by pinning.

`data/manifest.json` records `upstreamRef`, a commit SHA.

- `pf2data update` re-runs against the **pinned** SHA and produces byte-identical
  output. Fully idempotent.
- `pf2data update --latest` moves the pin to upstream `HEAD`, regenerates, and
  reports the diff.

Output is deterministic: sorted object keys, sorted arrays, LF line endings,
stable identifiers. A `git diff` after an update is therefore an exact,
reviewable record of what changed upstream.

## Output layout

Committed to the repository under `data/`:

```
data/
  manifest.json              upstream SHA, generated-at, pack list, counts,
                             tool version, build-time collision set
  books.json                 catalog: id, title, license, remaster,
                             creature count, index path
  index/<pack>.json          one search index per book, loaded on demand
  creatures/<pack>/<slug>.json
  conditions.json            remaster condition names, slugs and
                             description text (reference data only --
                             mechanical effects are hand-implemented in the
                             tracker's rules module, not derived from this)
  glossary.json              bestiary ability glossary (Grab, Attack of
                             Opportunity, ...)
  SCHEMA.md                  generated schema documentation
```

### Why per-book indexes

GitHub Pages is static. A monolithic index over 1265 creatures would be ~500 KB
uncompressed. Splitting per book lets the tracker load only the indexes for
books the GM has enabled, and makes adding Bestiary 3 or another Adventure Path
a **runtime toggle** rather than a rebuild.

Consequently, "remaster wins" collision resolution runs in the tracker at load
time over the *active* book set, not at build time — the winner depends on which
books are enabled. The pipeline still records the build-time collision set in
`manifest.json` for auditing.

### Why one file per creature

Full creature records are lazily fetched only when a creature is added to an
encounter. The site never ships 39 MB to the browser.

### Identifiers

Creature id is `<pack>/<slug>`, e.g. `kingmaker-bestiary/the-stag-lord`.
Human-readable, stable across upstream releases, and maps directly to the file
path. The Foundry `_id` is retained as `foundryId` for cross-referencing.

## Normalized creature schema

Defined in **zod**. The same schema provides runtime validation inside the tool
and inferred TypeScript types imported by the tracker — one source of truth
shared across sub-projects 1 and 2.

The shape is tracker-oriented, not Foundry-oriented:

- **Identity / source** — `id`, `foundryId`, `name`, `level`, `rarity`, `size`,
  `traits[]`, `source { pack, book, license, remaster }`
- **Defenses** — `ac`, `hp.max`, `saves { fortitude, reflex, will }`,
  `immunities[]`, `weaknesses[]`, `resistances[]`
- **Perception and senses**, `languages[]`, `skills{}`, `abilityMods{}`,
  `speeds{}`
- **Attacks[]** — name, melee/ranged, attack bonus, damage entries, traits
- **Actions[]** — `cost: 1 | 2 | 3 | reaction | free | passive`, traits,
  extracted `trigger`, `frequency`, `requirements`, description HTML
- **Spellcasting[]** — entry name, tradition, preparation type, DC, attack
  bonus, spell list
- **Gear[]** — equipment names

`trigger` and `frequency` are promoted to first-class fields specifically
because the tracker needs them: limited-use actions sort to the top of the
action list, and reactions are highlighted with their trigger text visible.

### Remaster normalization

At this layer, **vocabulary only** — not rules translation:

- Strip legacy alignment traits.
- Remap legacy condition slugs (`flat-footed` → `off-guard`).
- Resolve `@UUID[...]` links to `{ type, id, label }` references using the
  legacy-pack alias table.

Deeper Remaster rules translation belongs to sub-project 3 (rules engine).

## CLI — agent-friendly interface

```
pf2data update [--latest] [--pack <name>]
pf2data status
pf2data verify
```

Contract:

- **Structured output.** JSON is written to stdout whenever stdout is not a
  TTY. Human-readable prose goes to stderr. An agent parses stdout with no
  flags required.
- **Exit codes**, branchable without parsing output:

  | Code | Meaning |
  |---|---|
  | 0 | Success, no change |
  | 10 | Success, data updated |
  | 20 | Verification failed |
  | 30 | Upstream / network error |
  | 1 | Usage error |

- `update` output enumerates added, removed and modified creature ids, so an
  agent knows precisely what to re-check.
- The pack allowlist lives in a config file, not in code. Enabling another
  Adventure Path's bestiary is a one-line edit.
- `data/SCHEMA.md` is generated, and the repository `AGENTS.md` points at it, so
  an agent reads one file before touching the dataset.

## Verification invariants

`pf2data verify` asserts:

1. Every emitted file validates against the zod schema.
2. `books.json` counts match the number of entries in each `index/<pack>.json`.
3. Every index entry has a corresponding `creatures/<pack>/<slug>.json`.
4. The slug-collision set matches the set recorded in `manifest.json`. A new
   upstream collision becomes a visible failure rather than a silent overwrite.
5. No emitted creature retains a legacy alignment trait.
6. No unresolved `@UUID[...]` link remains in emitted text.

## Testing

Test-driven. Fixtures are committed under `test/fixtures/`, chosen to cover the
hard cases found during research:

- `the-stag-lord` — legacy OGL Kingmaker actor, level 6, mixed item types
- `nyrissa` — 64 embedded spells across 3 spellcasting entries, heavy UUID use
- `akiros-ismort` — reaction whose trigger exists only in description HTML,
  plus a legacy alignment trait

Normalizer behaviour is driven by unit tests against these. `verify` runs the
full validation pass over all generated output in CI.

## Out of scope

- Rules interpretation of Foundry `rules[]` arrays (sub-project 3)
- Any UI (sub-project 2)
- Bestiary 3 and other Adventure Path bestiaries (config addition when wanted)
- Hazards, vehicles, player-facing character options
