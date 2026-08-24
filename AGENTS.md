# Agent guide

## Dataset

Pathfinder 2e creature data lives in `data/`, generated from `foundryvtt/pf2e`.
**Read `data/SCHEMA.md` before touching it.** Never hand-edit anything under
`data/` — it is regenerated wholesale.

The committed dataset holds 1450 creatures (763 remaster / 687 legacy) across
five books: `pathfinder-monster-core` (492), `pathfinder-bestiary-2` (331),
`pathfinder-npc-core` (270), `kingmaker-bestiary` (181), `pathfinder-bestiary`
(176). `data/` is 11 MB total (`data/index/` is 472 KB). `conditions.json` has
43 entries (12 valued); `glossary.json` has 447 entries. Upstream is pinned to
`4cbdaa37d6c33e9519561bae2c59a23e0288cbce`.

## Updating the data

```bash
npm run data -- update           # re-run against the pinned upstream SHA (idempotent)
npm run data -- update --latest  # move the pin to upstream HEAD
npm run data -- verify           # validate without writing
npm run data -- status           # report the current pin
```

Exit codes: `0` no change, `10` updated, `20` verification failed, `30`
upstream error, `1` usage error. Structured JSON goes to stdout when stdout is
not a TTY; prose goes to stderr.

After `update --latest`, review `git diff data/` before committing — that diff
is the record of what changed upstream.

## Specs

- `docs/superpowers/specs/2026-08-24-pf2-data-pipeline-design.md`
- `docs/superpowers/specs/2026-08-24-pf2-tracker-design.md`
