# PF2 Data Pipeline (`pf2data`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI that turns the `foundryvtt/pf2e` Foundry system repository into a normalized, deterministic, statically-servable creature dataset committed to this repo.

**Architecture:** An npm workspace monorepo. `packages/schema` holds zod schemas and their inferred TypeScript types, shared between this tool and the future React app. `packages/pf2data` holds the CLI, built as four stages — fetch (git sparse-checkout), normalize (pure functions, one module per concern), index (per-book search indexes plus a book catalog), verify (schema validation plus invariant assertions). All normalization is pure and unit-tested against committed fixtures; I/O is isolated at the edges.

**Tech Stack:** Node 22+, TypeScript 5.x (ESM), zod 3.x, Vitest, `tsx` for running the CLI in development, `git` CLI for upstream fetch. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-pf2-data-pipeline-design.md`

## Global Constraints

- Node 22+ required. ESM only (`"type": "module"` in every package.json).
- Runtime dependencies limited to `zod`. Everything else is a devDependency.
- All normalization functions are **pure**: no file I/O, no network, no `Date.now()`. Timestamps and paths are passed in as arguments.
- All emitted JSON is **deterministic**: object keys sorted lexicographically, arrays sorted by a stable documented key, LF line endings, two-space indent, trailing newline.
- Creature id format is exactly `<pack>/<slug>`, e.g. `kingmaker-bestiary/the-stag-lord`.
- Legacy alignment traits to strip: `lawful`, `chaotic`, `good`, `evil`, `neutral`.
- Legacy UUID pack aliases: `conditionitems` → `conditions`, `spells-srd` → `spells`, `actionspf2e` → `actions`, `equipment-srd` → `equipment`.
- Legacy condition slug remap: `flat-footed` → `off-guard`.
- Exit codes: `0` no change · `10` updated · `20` verification failed · `30` upstream/network error · `1` usage error.
- Structured JSON goes to **stdout** when stdout is not a TTY; human prose always goes to **stderr**.
- Upstream repository: `https://github.com/foundryvtt/pf2e`, branch `master`.

---

## File Structure

```
package.json                       npm workspaces root
tsconfig.base.json
vitest.config.ts
data/                              generated output, committed
packages/
  schema/
    package.json
    src/
      index.ts                     public re-exports
      source.ts                    CreatureSource, Publication
      creature.ts                  Creature, Action, Attack, Spellcasting
      book.ts                      BookCatalogEntry, IndexEntry
      manifest.ts                  Manifest
  pf2data/
    package.json
    pf2data.config.json            pack allowlist
    src/
      cli.ts                       argument parsing, exit codes, reporting
      config.ts                    config loading + validation
      report.ts                    JSON stdout / prose stderr
      io/
        walk.ts                    recursive pack directory walk
        write.ts                   deterministic JSON writer
      stages/
        fetch.ts                   git sparse-checkout
        normalize.ts               orchestrates per-creature normalization
        index.ts                   per-book indexes, books.json, collisions
        reference.ts               conditions.json, glossary.json
        verify.ts                  schema + invariant assertions
      normalize/
        traits.ts
        defenses.ts
        html.ts                    trigger extraction
        actions.ts
        attacks.ts
        spellcasting.ts
        links.ts                   UUID resolution + condition remap
        localize.ts                @Localize resolution from static/lang/en.json
        creature.ts                assembler
      docs/
        schema-doc.ts              SCHEMA.md generation
    test/
      fixtures/
        the-stag-lord.json
        nyrissa.json
        akiros-ismort.json
        troll.json
      *.test.ts
```

---

### Task 1: Workspace scaffold and shared source schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/schema/package.json`, `packages/schema/tsconfig.json`
- Create: `packages/schema/src/source.ts`, `packages/schema/src/index.ts`
- Test: `packages/schema/test/source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CreatureSourceSchema` (zod), type `CreatureSource = { pack: string; book: string; license: "OGL" | "ORC"; remaster: boolean }`, and `parseSource(publication: unknown, pack: string): CreatureSource`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "pf2-combat",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
```

`packages/schema/package.json`:

```json
{
  "name": "@pf2/schema",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

Run `npm install`.

- [ ] **Step 2: Write the failing test**

`packages/schema/test/source.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSource } from "../src/index.js";

describe("parseSource", () => {
  it("reads a legacy OGL publication block", () => {
    const result = parseSource(
      { license: "OGL", remaster: false, title: "Pathfinder Kingmaker" },
      "kingmaker-bestiary",
    );
    expect(result).toEqual({
      pack: "kingmaker-bestiary",
      book: "Pathfinder Kingmaker",
      license: "OGL",
      remaster: false,
    });
  });

  it("falls back to the pack name when title is empty", () => {
    const result = parseSource(
      { license: "ORC", remaster: true, title: "" },
      "pathfinder-monster-core",
    );
    expect(result.book).toBe("pathfinder-monster-core");
    expect(result.remaster).toBe(true);
  });

  it("rejects an unknown license", () => {
    expect(() =>
      parseSource({ license: "WTFPL", remaster: false, title: "x" }, "p"),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/schema/test/source.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement**

`packages/schema/src/source.ts`:

```ts
import { z } from "zod";

export const CreatureSourceSchema = z.object({
  pack: z.string().min(1),
  book: z.string().min(1),
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
});

export type CreatureSource = z.infer<typeof CreatureSourceSchema>;

const PublicationSchema = z.object({
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
  title: z.string(),
});

export function parseSource(publication: unknown, pack: string): CreatureSource {
  const pub = PublicationSchema.parse(publication);
  return CreatureSourceSchema.parse({
    pack,
    book: pub.title.trim() === "" ? pack : pub.title,
    license: pub.license,
    remaster: pub.remaster,
  });
}
```

`packages/schema/src/index.ts`:

```ts
export * from "./source.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/schema/test/source.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts packages/schema
git commit -m "feat(schema): workspace scaffold and creature source schema"
```

---

### Task 2: `pf2data` package and pack allowlist config

**Files:**
- Create: `packages/pf2data/package.json`, `packages/pf2data/tsconfig.json`
- Create: `packages/pf2data/pf2data.config.json`
- Create: `packages/pf2data/src/config.ts`
- Test: `packages/pf2data/test/config.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `loadConfig(path: string): Pf2DataConfig` where `Pf2DataConfig = { upstream: { repo: string; branch: string }; packs: PackConfig[] }` and `PackConfig = { name: string; kind: "creatures" | "conditions" | "glossary" | "features" }`.

- [ ] **Step 1: Create the package**

`packages/pf2data/package.json`:

```json
{
  "name": "@pf2/pf2data",
  "version": "0.0.0",
  "type": "module",
  "bin": { "pf2data": "./src/cli.ts" },
  "dependencies": { "zod": "^3.23.0", "@pf2/schema": "*" }
}
```

`packages/pf2data/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../schema" }]
}
```

`packages/pf2data/pf2data.config.json` — the allowlist from the spec:

```json
{
  "upstream": {
    "repo": "https://github.com/foundryvtt/pf2e",
    "branch": "master"
  },
  "packs": [
    { "name": "pathfinder-monster-core", "kind": "creatures" },
    { "name": "pathfinder-npc-core", "kind": "creatures" },
    { "name": "pathfinder-bestiary", "kind": "creatures" },
    { "name": "pathfinder-bestiary-2", "kind": "creatures" },
    { "name": "kingmaker-bestiary", "kind": "creatures" },
    { "name": "kingmaker-features", "kind": "features" },
    { "name": "conditions", "kind": "conditions" },
    { "name": "bestiary-ability-glossary-srd", "kind": "glossary" },
    { "name": "bestiary-family-ability-glossary", "kind": "glossary" }
  ]
}
```

Run `npm install`.

- [ ] **Step 2: Write the failing test**

`packages/pf2data/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

const configPath = fileURLToPath(
  new URL("../pf2data.config.json", import.meta.url),
);

describe("loadConfig", () => {
  it("loads the shipped allowlist", () => {
    const config = loadConfig(configPath);
    expect(config.upstream.repo).toBe("https://github.com/foundryvtt/pf2e");
    expect(config.packs.map((p) => p.name)).toContain("kingmaker-bestiary");
  });

  it("exposes creature packs separately from reference packs", () => {
    const config = loadConfig(configPath);
    const creaturePacks = config.packs.filter((p) => p.kind === "creatures");
    expect(creaturePacks).toHaveLength(5);
  });

  it("rejects a config with an unknown pack kind", () => {
    expect(() => loadConfig(
      fileURLToPath(new URL("./fixtures/bad-config.json", import.meta.url)),
    )).toThrow();
  });
});
```

Also create `packages/pf2data/test/fixtures/bad-config.json`:

```json
{
  "upstream": { "repo": "https://example.com/x", "branch": "main" },
  "packs": [{ "name": "x", "kind": "spaceships" }]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 4: Implement**

`packages/pf2data/src/config.ts`:

```ts
import { readFileSync } from "node:fs";
import { z } from "zod";

export const PackConfigSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["creatures", "conditions", "glossary", "features"]),
});

export const Pf2DataConfigSchema = z.object({
  upstream: z.object({
    repo: z.string().url(),
    branch: z.string().min(1),
  }),
  packs: z.array(PackConfigSchema).min(1),
});

export type PackConfig = z.infer<typeof PackConfigSchema>;
export type Pf2DataConfig = z.infer<typeof Pf2DataConfigSchema>;

export function loadConfig(path: string): Pf2DataConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return Pf2DataConfigSchema.parse(raw);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/config.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/pf2data
git commit -m "feat(pf2data): package scaffold and pack allowlist config"
```

---

### Task 3: Fixtures and recursive pack walker

**Files:**
- Create: `packages/pf2data/test/fixtures/{the-stag-lord,nyrissa,akiros-ismort,troll}.json`
- Create: `packages/pf2data/src/io/walk.ts`
- Test: `packages/pf2data/test/walk.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `walkPack(packRoot: string): PackFile[]` where `PackFile = { slug: string; absolutePath: string }`. Recurses subdirectories (required — `pathfinder-npc-core` is nested). Skips any file whose basename starts with `_` (e.g. `_folders.json`). Results sorted by `slug` ascending.

- [ ] **Step 1: Download the fixtures**

```bash
mkdir -p packages/pf2data/test/fixtures
BASE=https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs
curl -sL "$BASE/kingmaker-bestiary/the-stag-lord.json"  -o packages/pf2data/test/fixtures/the-stag-lord.json
curl -sL "$BASE/kingmaker-bestiary/nyrissa.json"        -o packages/pf2data/test/fixtures/nyrissa.json
curl -sL "$BASE/kingmaker-bestiary/akiros-ismort.json"  -o packages/pf2data/test/fixtures/akiros-ismort.json
curl -sL "$BASE/pathfinder-bestiary/troll.json"         -o packages/pf2data/test/fixtures/troll.json
```

These four cover the hard cases: a legacy OGL actor with mixed item types, a spellcaster with 64 embedded spells across 3 spellcasting entries, a reaction whose trigger exists only in description HTML, and a creature with a weakness entry.

- [ ] **Step 2: Write the failing test**

`packages/pf2data/test/walk.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkPack } from "../src/io/walk.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "walk-"));
  writeFileSync(join(root, "goblin-warrior.json"), "{}");
  writeFileSync(join(root, "_folders.json"), "{}");
  writeFileSync(join(root, "notes.txt"), "ignore me");
  mkdirSync(join(root, "artisan"));
  writeFileSync(join(root, "artisan", "blacksmith.json"), "{}");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("walkPack", () => {
  it("finds nested json files and skips underscore-prefixed ones", () => {
    const files = walkPack(root);
    expect(files.map((f) => f.slug)).toEqual(["blacksmith", "goblin-warrior"]);
  });

  it("returns absolute paths that exist", () => {
    const files = walkPack(root);
    expect(files[0]!.absolutePath).toContain("artisan");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/walk.test.ts`
Expected: FAIL — cannot resolve `../src/io/walk.js`.

- [ ] **Step 4: Implement**

`packages/pf2data/src/io/walk.ts`:

```ts
import { readdirSync } from "node:fs";
import { join, basename } from "node:path";

export interface PackFile {
  slug: string;
  absolutePath: string;
}

export function walkPack(packRoot: string): PackFile[] {
  const found: PackFile[] = [];

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      if (entry.name.startsWith("_")) continue;
      found.push({ slug: basename(entry.name, ".json"), absolutePath: full });
    }
  };

  visit(packRoot);
  return found.sort((a, b) => a.slug.localeCompare(b.slug));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/walk.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/pf2data/src/io/walk.ts packages/pf2data/test
git commit -m "feat(pf2data): recursive pack walker and upstream fixtures"
```

---

### Task 4: Trait normalization

**Files:**
- Create: `packages/pf2data/src/normalize/traits.ts`
- Test: `packages/pf2data/test/traits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeTraits(raw: unknown): NormalizedTraits` where `NormalizedTraits = { rarity: "common" | "uncommon" | "rare" | "unique"; size: string; traits: string[] }`. Strips the five alignment traits. `size` is expanded from Foundry's abbreviation (`tiny`, `sm`, `med`, `lg`, `huge`, `grg`) to a full word.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/traits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeTraits } from "../src/normalize/traits.js";

const stagLord = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeTraits", () => {
  it("strips legacy alignment traits", () => {
    const result = normalizeTraits(stagLord.system.traits);
    expect(result.traits).toEqual(["human", "humanoid"]);
    expect(result.traits).not.toContain("chaotic");
    expect(result.traits).not.toContain("evil");
  });

  it("keeps rarity and expands size", () => {
    const result = normalizeTraits(stagLord.system.traits);
    expect(result.rarity).toBe("unique");
    expect(result.size).toBe("medium");
  });

  it("sorts traits for deterministic output", () => {
    const result = normalizeTraits({
      rarity: "common",
      size: { value: "grg" },
      value: ["zombie", "aberration", "good"],
    });
    expect(result.traits).toEqual(["aberration", "zombie"]);
    expect(result.size).toBe("gargantuan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/traits.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/traits.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/traits.ts`:

```ts
import { z } from "zod";

const ALIGNMENT_TRAITS = new Set([
  "lawful",
  "chaotic",
  "good",
  "evil",
  "neutral",
]);

const SIZES: Record<string, string> = {
  tiny: "tiny",
  sm: "small",
  med: "medium",
  lg: "large",
  huge: "huge",
  grg: "gargantuan",
};

const RawTraitsSchema = z.object({
  rarity: z.enum(["common", "uncommon", "rare", "unique"]).default("common"),
  size: z.object({ value: z.string() }),
  value: z.array(z.string()).default([]),
});

export interface NormalizedTraits {
  rarity: "common" | "uncommon" | "rare" | "unique";
  size: string;
  traits: string[];
}

export function normalizeTraits(raw: unknown): NormalizedTraits {
  const parsed = RawTraitsSchema.parse(raw);
  const size = SIZES[parsed.size.value];
  if (size === undefined) {
    throw new Error(`Unknown Foundry size abbreviation: ${parsed.size.value}`);
  }
  return {
    rarity: parsed.rarity,
    size,
    traits: parsed.value
      .filter((t) => !ALIGNMENT_TRAITS.has(t))
      .sort((a, b) => a.localeCompare(b)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/traits.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/traits.ts packages/pf2data/test/traits.test.ts
git commit -m "feat(pf2data): normalize traits and strip legacy alignments"
```

---

### Task 5: Defenses and vitals normalization

**Files:**
- Create: `packages/pf2data/src/normalize/defenses.ts`
- Test: `packages/pf2data/test/defenses.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeDefenses(system: unknown): Defenses` where

```ts
interface Defenses {
  ac: number;
  hp: number;
  saves: { fortitude: number; reflex: number; will: number };
  immunities: string[];
  weaknesses: { type: string; value: number }[];
  resistances: { type: string; value: number }[];
  perception: number;
  senses: string[];
  languages: string[];
  skills: Record<string, number>;
  abilityMods: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>;
  speeds: { type: string; value: number }[];
}
```

Field paths confirmed against upstream: `attributes.ac.value`, `attributes.hp.max`, `saves.<name>.value`, `attributes.immunities|weaknesses|resistances` (each **may be absent or null**), `perception.mod`, `perception.senses[].type`, `details.languages.value[]`, `skills.<name>.base`, `abilities.<name>.mod`, `attributes.speed.value` plus `attributes.speed.otherSpeeds[]`.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/defenses.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeDefenses } from "../src/normalize/defenses.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeDefenses", () => {
  it("reads core defences from a creature with no weaknesses", () => {
    const d = normalizeDefenses(load("the-stag-lord").system);
    expect(d.ac).toBe(23);
    expect(d.hp).toBe(110);
    expect(d.saves).toEqual({ fortitude: 15, reflex: 16, will: 9 });
    expect(d.perception).toBe(16);
    expect(d.immunities).toEqual([]);
    expect(d.weaknesses).toEqual([]);
    expect(d.resistances).toEqual([]);
  });

  it("reads a weakness and senses", () => {
    const d = normalizeDefenses(load("troll").system);
    expect(d.weaknesses).toEqual([{ type: "fire", value: 10 }]);
    expect(d.senses).toEqual(["darkvision"]);
    expect(d.languages).toEqual(["jotun"]);
  });

  it("flattens skills, ability mods and speeds", () => {
    const d = normalizeDefenses(load("the-stag-lord").system);
    expect(d.skills.stealth).toBe(14);
    expect(d.abilityMods.dex).toBe(4);
    expect(d.speeds).toEqual([{ type: "land", value: 20 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/defenses.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/defenses.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/defenses.ts`:

```ts
import { z } from "zod";

const IwrEntrySchema = z.object({
  type: z.string(),
  value: z.number().optional(),
});

const SystemSchema = z.object({
  abilities: z.record(z.object({ mod: z.number() })),
  attributes: z.object({
    ac: z.object({ value: z.number() }),
    hp: z.object({ max: z.number() }),
    speed: z.object({
      value: z.number(),
      otherSpeeds: z
        .array(z.object({ type: z.string(), value: z.number() }))
        .default([]),
    }),
    immunities: z.array(IwrEntrySchema).nullish(),
    weaknesses: z.array(IwrEntrySchema).nullish(),
    resistances: z.array(IwrEntrySchema).nullish(),
  }),
  details: z.object({
    languages: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
  perception: z.object({
    mod: z.number(),
    senses: z.array(z.object({ type: z.string() })).default([]),
  }),
  saves: z.object({
    fortitude: z.object({ value: z.number() }),
    reflex: z.object({ value: z.number() }),
    will: z.object({ value: z.number() }),
  }),
  skills: z.record(z.object({ base: z.number() })).default({}),
});

export interface Defenses {
  ac: number;
  hp: number;
  saves: { fortitude: number; reflex: number; will: number };
  immunities: string[];
  weaknesses: { type: string; value: number }[];
  resistances: { type: string; value: number }[];
  perception: number;
  senses: string[];
  languages: string[];
  skills: Record<string, number>;
  abilityMods: Record<string, number>;
  speeds: { type: string; value: number }[];
}

const valued = (
  entries: { type: string; value?: number }[] | null | undefined,
): { type: string; value: number }[] =>
  (entries ?? [])
    .map((e) => ({ type: e.type, value: e.value ?? 0 }))
    .sort((a, b) => a.type.localeCompare(b.type));

export function normalizeDefenses(system: unknown): Defenses {
  const s = SystemSchema.parse(system);

  const skills: Record<string, number> = {};
  for (const name of Object.keys(s.skills).sort()) {
    skills[name] = s.skills[name]!.base;
  }

  const abilityMods: Record<string, number> = {};
  for (const name of Object.keys(s.abilities).sort()) {
    abilityMods[name] = s.abilities[name]!.mod;
  }

  return {
    ac: s.attributes.ac.value,
    hp: s.attributes.hp.max,
    saves: {
      fortitude: s.saves.fortitude.value,
      reflex: s.saves.reflex.value,
      will: s.saves.will.value,
    },
    immunities: (s.attributes.immunities ?? [])
      .map((i) => i.type)
      .sort((a, b) => a.localeCompare(b)),
    weaknesses: valued(s.attributes.weaknesses),
    resistances: valued(s.attributes.resistances),
    perception: s.perception.mod,
    senses: s.perception.senses
      .map((x) => x.type)
      .sort((a, b) => a.localeCompare(b)),
    languages: [...(s.details.languages?.value ?? [])].sort((a, b) =>
      a.localeCompare(b),
    ),
    skills,
    abilityMods,
    speeds: [
      { type: "land", value: s.attributes.speed.value },
      ...[...s.attributes.speed.otherSpeeds].sort((a, b) =>
        a.type.localeCompare(b.type),
      ),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/defenses.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/defenses.ts packages/pf2data/test/defenses.test.ts
git commit -m "feat(pf2data): normalize creature defences and vitals"
```

---

### Task 6: Trigger extraction from description HTML

**Files:**
- Create: `packages/pf2data/src/normalize/html.ts`
- Test: `packages/pf2data/test/html.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractTrigger(html: string): string | null` and `extractRequirements(html: string): string | null`.

Upstream stores triggers as `<p><strong>Trigger</strong> …</p>` before an `<hr />`, not as a structured field. Akiros Ismort's "No Escape" has `system.trigger === null` while the trigger text sits in the description. This is why the tracker can show reaction triggers at all.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/html.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractTrigger, extractRequirements } from "../src/normalize/html.js";

const akiros = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/akiros-ismort.json", import.meta.url)),
    "utf8",
  ),
);

describe("extractTrigger", () => {
  it("pulls the trigger out of a real reaction description", () => {
    const noEscape = akiros.items.find((i: any) => i.name === "No Escape");
    expect(noEscape.system.trigger).toBeUndefined();
    expect(extractTrigger(noEscape.system.description.value)).toBe(
      "An adjacent foe moves away.",
    );
  });

  it("returns null when there is no trigger paragraph", () => {
    expect(extractTrigger("<p>Just a description.</p>")).toBeNull();
  });

  it("strips nested markup from the trigger text", () => {
    const html =
      "<p><strong>Trigger</strong> A creature within <em>30 feet</em> moves.</p><hr />";
    expect(extractTrigger(html)).toBe("A creature within 30 feet moves.");
  });
});

describe("extractRequirements", () => {
  it("pulls a requirements paragraph", () => {
    const html = "<p><strong>Requirements</strong> You are wielding a shield.</p>";
    expect(extractRequirements(html)).toBe("You are wielding a shield.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/html.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/html.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/html.ts`:

```ts
const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function extractLabelled(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<strong>\\s*${label}\\s*</strong>([\\s\\S]*?)</p>`,
    "i",
  );
  const match = pattern.exec(html);
  if (match === null) return null;
  const text = stripTags(match[1] ?? "");
  return text === "" ? null : text;
}

export function extractTrigger(html: string): string | null {
  return extractLabelled(html, "Trigger");
}

export function extractRequirements(html: string): string | null {
  return extractLabelled(html, "Requirements");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/html.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/html.ts packages/pf2data/test/html.test.ts
git commit -m "feat(pf2data): extract triggers and requirements from description html"
```

---

### Task 7: Action normalization

**Files:**
- Create: `packages/pf2data/src/normalize/actions.ts`
- Test: `packages/pf2data/test/actions.test.ts`

**Interfaces:**
- Consumes: `extractTrigger`, `extractRequirements` (Task 6).
- Produces: `normalizeActions(items: unknown[]): NormalizedAction[]` where

```ts
interface NormalizedAction {
  name: string;
  cost: "1" | "2" | "3" | "reaction" | "free" | "passive";
  category: string | null;
  traits: string[];
  trigger: string | null;
  requirements: string | null;
  frequency: { max: number; per: string } | null;
  description: string;
}
```

Mapping: `system.actionType.value` of `action` uses `system.actions.value` (1/2/3) as the cost; `reaction`, `free` and `passive` map straight through. Upstream `frequency` is `{ max, per, value? }` where `per` is either a bare word (`day`) or an ISO-8601 duration (`PT1M`). Sorted so limited-use actions come first, then by cost, then by name — the order the tracker's `<ActionList>` renders.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeActions } from "../src/normalize/actions.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeActions", () => {
  it("maps a reaction and recovers its trigger from html", () => {
    const actions = normalizeActions(load("akiros-ismort").items);
    const noEscape = actions.find((a) => a.name === "No Escape")!;
    expect(noEscape.cost).toBe("reaction");
    expect(noEscape.trigger).toBe("An adjacent foe moves away.");
  });

  it("maps a one-action ability", () => {
    const actions = normalizeActions(load("akiros-ismort").items);
    const rage = actions.find((a) => a.name === "Rage")!;
    expect(rage.cost).toBe("1");
    expect(rage.frequency).toBeNull();
  });

  it("captures frequency and sorts limited-use actions first", () => {
    const actions = normalizeActions(load("nyrissa").items);
    const quickened = actions.find((a) => a.name === "Quickened Casting")!;
    expect(quickened.frequency).toEqual({ max: 3, per: "day" });
    expect(actions[0]!.frequency).not.toBeNull();
  });

  it("ignores non-action items", () => {
    const actions = normalizeActions(load("the-stag-lord").items);
    expect(actions.map((a) => a.name)).not.toContain("Longsword");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/actions.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/actions.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/actions.ts`:

```ts
import { z } from "zod";
import { extractRequirements, extractTrigger } from "./html.js";

const ActionItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    category: z.string().nullish(),
    description: z.object({ value: z.string().default("") }),
    frequency: z
      .object({ max: z.number(), per: z.string() })
      .nullish(),
    trigger: z.string().nullish(),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export type ActionCost = "1" | "2" | "3" | "reaction" | "free" | "passive";

export interface NormalizedAction {
  name: string;
  cost: ActionCost;
  category: string | null;
  traits: string[];
  trigger: string | null;
  requirements: string | null;
  frequency: { max: number; per: string } | null;
  description: string;
}

const COST_ORDER: Record<ActionCost, number> = {
  free: 0,
  reaction: 1,
  "1": 2,
  "2": 3,
  "3": 4,
  passive: 5,
};

function costOf(system: z.infer<typeof ActionItemSchema>["system"]): ActionCost {
  const kind = system.actionType.value;
  if (kind !== "action") return kind;
  const n = system.actions?.value;
  if (n === 1 || n === 2 || n === 3) return String(n) as ActionCost;
  return "passive";
}

export function normalizeActions(items: unknown[]): NormalizedAction[] {
  const actions: NormalizedAction[] = [];

  for (const item of items) {
    const parsed = ActionItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, system } = parsed.data;
    const html = system.description.value;

    actions.push({
      name,
      cost: costOf(system),
      category: system.category ?? null,
      traits: [...(system.traits?.value ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
      trigger:
        system.trigger !== null && system.trigger !== undefined && system.trigger !== ""
          ? system.trigger
          : extractTrigger(html),
      requirements: extractRequirements(html),
      frequency: system.frequency
        ? { max: system.frequency.max, per: system.frequency.per }
        : null,
      description: html,
    });
  }

  return actions.sort((a, b) => {
    const limited = Number(b.frequency !== null) - Number(a.frequency !== null);
    if (limited !== 0) return limited;
    const cost = COST_ORDER[a.cost] - COST_ORDER[b.cost];
    if (cost !== 0) return cost;
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/actions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/actions.ts packages/pf2data/test/actions.test.ts
git commit -m "feat(pf2data): normalize creature actions with cost, trigger and frequency"
```

---

### Task 8: Attack normalization

**Files:**
- Create: `packages/pf2data/src/normalize/attacks.ts`
- Test: `packages/pf2data/test/attacks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeAttacks(items: unknown[]): NormalizedAttack[]` where

```ts
interface NormalizedAttack {
  name: string;
  kind: "melee" | "ranged";
  bonus: number;
  damage: { formula: string; type: string }[];
  traits: string[];
}
```

Source is items of `type === "melee"` (Foundry uses that type for ranged NPC attacks too, discriminated by `system.weaponType.value`). Damage lives in `system.damageRolls`, an **object keyed by random id**, values `{ damage, damageType }` — iterate values, sort by formula for determinism.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/attacks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeAttacks } from "../src/normalize/attacks.js";

const stagLord = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeAttacks", () => {
  it("reads bonus, damage and traits from a melee attack", () => {
    const attacks = normalizeAttacks(stagLord.items);
    const longsword = attacks.find((a) => a.name === "Longsword")!;
    expect(longsword.kind).toBe("melee");
    expect(longsword.bonus).toBe(15);
    expect(longsword.damage).toEqual([
      { formula: "1d8+5", type: "slashing" },
    ]);
    expect(longsword.traits).toEqual(["versatile-p"]);
  });

  it("classifies a ranged attack by weaponType", () => {
    const attacks = normalizeAttacks(stagLord.items);
    const bow = attacks.find((a) => a.name === "Composite Longbow")!;
    expect(bow.kind).toBe("ranged");
  });

  it("ignores items that are not attacks", () => {
    const attacks = normalizeAttacks(stagLord.items);
    expect(attacks.map((a) => a.name)).not.toContain("Hide Armor");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/attacks.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/attacks.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/attacks.ts`:

```ts
import { z } from "zod";

const AttackItemSchema = z.object({
  name: z.string(),
  type: z.literal("melee"),
  system: z.object({
    bonus: z.object({ value: z.number() }),
    damageRolls: z
      .record(z.object({ damage: z.string(), damageType: z.string() }))
      .default({}),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
    weaponType: z.object({ value: z.enum(["melee", "ranged"]) }).optional(),
  }),
});

export interface NormalizedAttack {
  name: string;
  kind: "melee" | "ranged";
  bonus: number;
  damage: { formula: string; type: string }[];
  traits: string[];
}

export function normalizeAttacks(items: unknown[]): NormalizedAttack[] {
  const attacks: NormalizedAttack[] = [];

  for (const item of items) {
    const parsed = AttackItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, system } = parsed.data;

    attacks.push({
      name,
      kind: system.weaponType?.value ?? "melee",
      bonus: system.bonus.value,
      damage: Object.values(system.damageRolls)
        .map((d) => ({ formula: d.damage, type: d.damageType }))
        .sort((a, b) => a.formula.localeCompare(b.formula)),
      traits: [...(system.traits?.value ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    });
  }

  return attacks.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/attacks.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/attacks.ts packages/pf2data/test/attacks.test.ts
git commit -m "feat(pf2data): normalize creature attacks"
```

---

### Task 9: Spellcasting normalization

**Files:**
- Create: `packages/pf2data/src/normalize/spellcasting.ts`
- Test: `packages/pf2data/test/spellcasting.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeSpellcasting(items: unknown[]): SpellcastingEntry[]` where

```ts
interface SpellcastingEntry {
  name: string;
  tradition: string;
  preparation: string;
  dc: number;
  attack: number;
  slots: { rank: number; max: number }[];
  spells: { name: string; rank: number }[];
}
```

Entries are items of `type === "spellcastingEntry"`; spells are items of `type === "spell"` linked back by `system.location.value === <entry _id>`. Slots live in `system.slots.slotN.max`. `system.spelldc.dc` is the save DC and `system.spelldc.value` the spell attack bonus.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/spellcasting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeSpellcasting } from "../src/normalize/spellcasting.js";

const nyrissa = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/nyrissa.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeSpellcasting", () => {
  it("finds all three of Nyrissa's entries", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "Arcane Focus Spells",
      "Arcane Spontaneous Spells",
      "Primal Innate Spells",
    ]);
  });

  it("reads tradition, preparation and dc", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.tradition).toBe("arcane");
    expect(spont.preparation).toBe("spontaneous");
    expect(spont.dc).toBe(46);
    expect(spont.attack).toBe(42);
  });

  it("attaches spells to the entry that owns them", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const total = entries.reduce((sum, e) => sum + e.spells.length, 0);
    expect(total).toBe(64);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.spells.some((s) => s.name === "Wish")).toBe(true);
  });

  it("reads slot maxima", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.slots).toContainEqual({ rank: 10, max: 1 });
    expect(spont.slots).toContainEqual({ rank: 1, max: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/spellcasting.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/spellcasting.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/spellcasting.ts`:

```ts
import { z } from "zod";

const EntryItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("spellcastingEntry"),
  system: z.object({
    prepared: z.object({ value: z.string() }),
    slots: z
      .record(z.object({ max: z.number(), value: z.number() }))
      .default({}),
    spelldc: z.object({ dc: z.number(), value: z.number() }),
    tradition: z.object({ value: z.string() }),
  }),
});

const SpellItemSchema = z.object({
  name: z.string(),
  type: z.literal("spell"),
  system: z.object({
    level: z.object({ value: z.number() }),
    location: z.object({ value: z.string().nullish() }),
  }),
});

export interface SpellcastingEntry {
  name: string;
  tradition: string;
  preparation: string;
  dc: number;
  attack: number;
  slots: { rank: number; max: number }[];
  spells: { name: string; rank: number }[];
}

export function normalizeSpellcasting(items: unknown[]): SpellcastingEntry[] {
  const entries = new Map<string, SpellcastingEntry>();

  for (const item of items) {
    const parsed = EntryItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { _id, name, system } = parsed.data;

    const slots = Object.entries(system.slots)
      .map(([key, slot]) => ({
        rank: Number.parseInt(key.replace("slot", ""), 10),
        max: slot.max,
      }))
      .filter((s) => Number.isFinite(s.rank) && s.max > 0)
      .sort((a, b) => a.rank - b.rank);

    entries.set(_id, {
      name,
      tradition: system.tradition.value,
      preparation: system.prepared.value,
      dc: system.spelldc.dc,
      attack: system.spelldc.value,
      slots,
      spells: [],
    });
  }

  for (const item of items) {
    const parsed = SpellItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const owner = parsed.data.system.location.value;
    if (owner === null || owner === undefined) continue;
    const entry = entries.get(owner);
    if (entry === undefined) continue;
    entry.spells.push({
      name: parsed.data.name,
      rank: parsed.data.system.level.value,
    });
  }

  for (const entry of entries.values()) {
    entry.spells.sort(
      (a, b) => b.rank - a.rank || a.name.localeCompare(b.name),
    );
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/spellcasting.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/spellcasting.ts packages/pf2data/test/spellcasting.test.ts
git commit -m "feat(pf2data): normalize spellcasting entries and their spells"
```

---

### Task 10: UUID link resolution and condition remap

**Files:**
- Create: `packages/pf2data/src/normalize/links.ts`
- Test: `packages/pf2data/test/links.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveLinks(html: string): string` and `collectLinks(html: string): LinkRef[]` where `LinkRef = { pack: string; id: string; label: string }`.

`@UUID[Compendium.pf2e.<pack>.Item.<id>]{Label}` becomes plain `Label` in emitted text, and the reference is collected separately. Legacy pack aliases are applied so `conditionitems` reads as `conditions`. Condition labels are remapped through the legacy slug table, so `Flat-Footed` emits as `Off-Guard`.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectLinks, resolveLinks } from "../src/normalize/links.js";

const html =
  "<p>The target is @UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]{Flat-Footed} " +
  "and takes @UUID[Compendium.pf2e.spells-srd.Item.abc123]{Fireball} damage.</p>";

describe("resolveLinks", () => {
  it("replaces uuid links with their label", () => {
    expect(resolveLinks(html)).toBe(
      "<p>The target is Off-Guard and takes Fireball damage.</p>",
    );
  });

  it("remaps legacy condition labels", () => {
    expect(resolveLinks(html)).not.toContain("Flat-Footed");
  });

  it("leaves text without links untouched", () => {
    expect(resolveLinks("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("collectLinks", () => {
  it("applies legacy pack aliases", () => {
    const refs = collectLinks(html);
    expect(refs).toEqual([
      { pack: "conditions", id: "AJh5ex99aV6VTggg", label: "Off-Guard" },
      { pack: "spells", id: "abc123", label: "Fireball" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/links.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/links.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/normalize/links.ts`:

```ts
const PACK_ALIASES: Record<string, string> = {
  conditionitems: "conditions",
  "spells-srd": "spells",
  actionspf2e: "actions",
  "equipment-srd": "equipment",
};

const CONDITION_LABELS: Record<string, string> = {
  "flat-footed": "Off-Guard",
};

const UUID_PATTERN =
  /@UUID\[Compendium\.pf2e\.([a-z0-9-]+)\.Item\.([A-Za-z0-9]+)\]\{([^}]*)\}/g;

export interface LinkRef {
  pack: string;
  id: string;
  label: string;
}

const remapLabel = (label: string): string =>
  CONDITION_LABELS[label.toLowerCase()] ?? label;

export function resolveLinks(html: string): string {
  return html.replace(UUID_PATTERN, (_match, _pack, _id, label: string) =>
    remapLabel(label),
  );
}

export function collectLinks(html: string): LinkRef[] {
  const refs: LinkRef[] = [];
  for (const match of html.matchAll(UUID_PATTERN)) {
    const rawPack = match[1] ?? "";
    refs.push({
      pack: PACK_ALIASES[rawPack] ?? rawPack,
      id: match[2] ?? "",
      label: remapLabel(match[3] ?? ""),
    });
  }
  return refs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/links.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/normalize/links.ts packages/pf2data/test/links.test.ts
git commit -m "feat(pf2data): resolve foundry uuid links and remap legacy conditions"
```

---

### Task 11: Creature schema and assembler

**Files:**
- Create: `packages/schema/src/creature.ts`, modify `packages/schema/src/index.ts`
- Create: `packages/pf2data/src/normalize/creature.ts`
- Test: `packages/pf2data/test/creature.test.ts`

**Interfaces:**
- Consumes: `parseSource` (Task 1), `normalizeTraits` (4), `normalizeDefenses` (5), `normalizeActions` (7), `normalizeAttacks` (8), `normalizeSpellcasting` (9), `resolveLinks` (10).
- Produces: `CreatureSchema` (zod) in `@pf2/schema`, type `Creature`, and `normalizeCreature(raw: unknown, pack: string, slug: string): Creature`.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/creature.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CreatureSchema } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeCreature", () => {
  it("produces a schema-valid creature", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
    );
    expect(() => CreatureSchema.parse(c)).not.toThrow();
  });

  it("builds the id from pack and slug", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
    );
    expect(c.id).toBe("kingmaker-bestiary/the-stag-lord");
    expect(c.name).toBe("The Stag Lord");
    expect(c.level).toBe(6);
    expect(c.source.remaster).toBe(false);
    expect(c.source.license).toBe("OGL");
  });

  it("carries actions, attacks and spellcasting through", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
    );
    expect(nyrissa.spellcasting).toHaveLength(3);
    expect(nyrissa.actions.length).toBeGreaterThan(0);
    expect(nyrissa.attacks.length).toBeGreaterThan(0);
  });

  it("leaves no unresolved uuid link in emitted text", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
    );
    expect(JSON.stringify(nyrissa)).not.toContain("@UUID[");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/creature.test.ts`
Expected: FAIL — `CreatureSchema` is not exported.

- [ ] **Step 3: Add the schema**

`packages/schema/src/creature.ts`:

```ts
import { z } from "zod";
import { CreatureSourceSchema } from "./source.js";

export const ActionCostSchema = z.enum([
  "1",
  "2",
  "3",
  "reaction",
  "free",
  "passive",
]);

export const ActionSchema = z.object({
  name: z.string(),
  cost: ActionCostSchema,
  category: z.string().nullable(),
  traits: z.array(z.string()),
  trigger: z.string().nullable(),
  requirements: z.string().nullable(),
  frequency: z.object({ max: z.number(), per: z.string() }).nullable(),
  description: z.string(),
});

export const AttackSchema = z.object({
  name: z.string(),
  kind: z.enum(["melee", "ranged"]),
  bonus: z.number(),
  damage: z.array(z.object({ formula: z.string(), type: z.string() })),
  traits: z.array(z.string()),
});

export const SpellcastingSchema = z.object({
  name: z.string(),
  tradition: z.string(),
  preparation: z.string(),
  dc: z.number(),
  attack: z.number(),
  slots: z.array(z.object({ rank: z.number(), max: z.number() })),
  spells: z.array(z.object({ name: z.string(), rank: z.number() })),
});

export const CreatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  foundryId: z.string(),
  name: z.string(),
  level: z.number().int(),
  rarity: z.enum(["common", "uncommon", "rare", "unique"]),
  size: z.string(),
  traits: z.array(z.string()),
  source: CreatureSourceSchema,
  ac: z.number(),
  hp: z.number(),
  saves: z.object({
    fortitude: z.number(),
    reflex: z.number(),
    will: z.number(),
  }),
  immunities: z.array(z.string()),
  weaknesses: z.array(z.object({ type: z.string(), value: z.number() })),
  resistances: z.array(z.object({ type: z.string(), value: z.number() })),
  perception: z.number(),
  senses: z.array(z.string()),
  languages: z.array(z.string()),
  skills: z.record(z.number()),
  abilityMods: z.record(z.number()),
  speeds: z.array(z.object({ type: z.string(), value: z.number() })),
  attacks: z.array(AttackSchema),
  actions: z.array(ActionSchema),
  spellcasting: z.array(SpellcastingSchema),
  gear: z.array(z.string()),
  publicNotes: z.string(),
});

export type Creature = z.infer<typeof CreatureSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Attack = z.infer<typeof AttackSchema>;
export type Spellcasting = z.infer<typeof SpellcastingSchema>;
```

`packages/schema/src/index.ts`:

```ts
export * from "./source.js";
export * from "./creature.js";
```

- [ ] **Step 4: Write the assembler**

`packages/pf2data/src/normalize/creature.ts`:

```ts
import { z } from "zod";
import { CreatureSchema, parseSource, type Creature } from "@pf2/schema";
import { normalizeTraits } from "./traits.js";
import { normalizeDefenses } from "./defenses.js";
import { normalizeActions } from "./actions.js";
import { normalizeAttacks } from "./attacks.js";
import { normalizeSpellcasting } from "./spellcasting.js";
import { resolveLinks } from "./links.js";

const ActorSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("npc"),
  items: z.array(z.unknown()).default([]),
  system: z.object({
    details: z.object({
      level: z.object({ value: z.number() }),
      publication: z.unknown(),
      publicNotes: z.string().default(""),
    }),
    traits: z.unknown(),
  }),
});

const GEAR_TYPES = new Set(["equipment", "weapon", "armor", "consumable"]);

export function normalizeCreature(
  raw: unknown,
  pack: string,
  slug: string,
): Creature {
  const actor = ActorSchema.parse(raw);
  const traits = normalizeTraits(actor.system.traits);
  const defenses = normalizeDefenses((raw as { system: unknown }).system);

  const gear = actor.items
    .map((i) => i as { type?: string; name?: string })
    .filter((i) => i.type !== undefined && GEAR_TYPES.has(i.type))
    .map((i) => i.name ?? "")
    .filter((n) => n !== "")
    .sort((a, b) => a.localeCompare(b));

  const actions = normalizeActions(actor.items).map((a) => ({
    ...a,
    description: resolveLinks(a.description),
    trigger: a.trigger === null ? null : resolveLinks(a.trigger),
    requirements: a.requirements === null ? null : resolveLinks(a.requirements),
  }));

  return CreatureSchema.parse({
    id: `${pack}/${slug}`,
    foundryId: actor._id,
    name: actor.name,
    level: actor.system.details.level.value,
    rarity: traits.rarity,
    size: traits.size,
    traits: traits.traits,
    source: parseSource(actor.system.details.publication, pack),
    ...defenses,
    attacks: normalizeAttacks(actor.items),
    actions,
    spellcasting: normalizeSpellcasting(actor.items),
    gear,
    publicNotes: resolveLinks(actor.system.details.publicNotes),
  } satisfies Creature);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/creature.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src packages/pf2data/src/normalize/creature.ts packages/pf2data/test/creature.test.ts
git commit -m "feat(schema): creature schema; feat(pf2data): creature assembler"
```

---

### Task 12: Deterministic JSON writer

**Files:**
- Create: `packages/pf2data/src/io/write.ts`
- Test: `packages/pf2data/test/write.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `stableStringify(value: unknown): string` and `writeJson(path: string, value: unknown): void`. Object keys sorted lexicographically at every depth, two-space indent, LF endings, trailing newline. Arrays are **not** reordered — ordering is each normalizer's responsibility.

This is what makes `git diff` after an update a meaningful record of upstream change rather than key-order noise.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/write.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/io/write.js";

describe("stableStringify", () => {
  it("sorts object keys at every depth", () => {
    const out = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });

  it("preserves array order", () => {
    expect(stableStringify(["z", "a"])).toBe('[\n  "z",\n  "a"\n]\n');
  });

  it("is stable across differently ordered but equal inputs", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("ends with exactly one newline", () => {
    const out = stableStringify({ a: 1 });
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("}\n\n")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/write.test.ts`
Expected: FAIL — cannot resolve `../src/io/write.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/io/write.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableStringify(value), "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/write.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/io/write.ts packages/pf2data/test/write.test.ts
git commit -m "feat(pf2data): deterministic json writer"
```

---

### Task 13: Index, book catalog and collision detection

**Files:**
- Create: `packages/schema/src/book.ts`, modify `packages/schema/src/index.ts`
- Create: `packages/pf2data/src/stages/index.ts`
- Test: `packages/pf2data/test/index-stage.test.ts`

**Interfaces:**
- Consumes: `Creature` (Task 11).
- Produces: `buildIndexes(creatures: Creature[]): IndexBuild` where

```ts
interface IndexBuild {
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;   // keyed by pack
  collisions: Collision[];
}
interface IndexEntry {
  id: string; name: string; slug: string; level: number;
  rarity: string; size: string; traits: string[];
  ac: number; hp: number; remaster: boolean; book: string;
}
interface Collision { slug: string; ids: string[] }
```

A collision is a slug present in more than one pack. Detection happens at build time and is recorded for auditing; **resolution does not happen here** — the tracker resolves against the GM's active book set at load time, so the winner depends on which books are enabled.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/index-stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Creature } from "@pf2/schema";
import { buildIndexes } from "../src/stages/index.js";

const creature = (
  pack: string,
  slug: string,
  overrides: Partial<Creature> = {},
): Creature =>
  ({
    id: `${pack}/${slug}`,
    foundryId: "x".repeat(16),
    name: slug.replace(/-/g, " "),
    level: 1,
    rarity: "common",
    size: "medium",
    traits: [],
    source: { pack, book: pack, license: "OGL", remaster: false },
    ac: 15,
    hp: 20,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    immunities: [],
    weaknesses: [],
    resistances: [],
    perception: 5,
    senses: [],
    languages: [],
    skills: {},
    abilityMods: {},
    speeds: [],
    attacks: [],
    actions: [],
    spellcasting: [],
    gear: [],
    publicNotes: "",
    ...overrides,
  }) as Creature;

describe("buildIndexes", () => {
  it("groups creatures into one index per pack", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("kingmaker-bestiary", "the-stag-lord"),
    ]);
    expect(Object.keys(build.indexes).sort()).toEqual([
      "kingmaker-bestiary",
      "pathfinder-bestiary",
    ]);
    expect(build.indexes["pathfinder-bestiary"]).toHaveLength(1);
  });

  it("builds a catalog entry per book with counts", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("pathfinder-bestiary", "owlbear"),
    ]);
    expect(build.books).toEqual([
      {
        pack: "pathfinder-bestiary",
        title: "pathfinder-bestiary",
        license: "OGL",
        remaster: false,
        creatureCount: 2,
        indexPath: "index/pathfinder-bestiary.json",
      },
    ]);
  });

  it("records cross-pack slug collisions without resolving them", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "barghest"),
      creature("pathfinder-monster-core", "barghest", {
        source: {
          pack: "pathfinder-monster-core",
          book: "Monster Core",
          license: "ORC",
          remaster: true,
        },
      }),
    ]);
    expect(build.collisions).toEqual([
      {
        slug: "barghest",
        ids: ["pathfinder-bestiary/barghest", "pathfinder-monster-core/barghest"],
      },
    ]);
    expect(build.indexes["pathfinder-bestiary"]).toHaveLength(1);
    expect(build.indexes["pathfinder-monster-core"]).toHaveLength(1);
  });

  it("sorts index entries by name", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "zombie"),
      creature("pathfinder-bestiary", "aboleth"),
    ]);
    expect(build.indexes["pathfinder-bestiary"]!.map((e) => e.slug)).toEqual([
      "aboleth",
      "zombie",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/index-stage.test.ts`
Expected: FAIL — cannot resolve `../src/stages/index.js`.

- [ ] **Step 3: Add the schema**

`packages/schema/src/book.ts`:

```ts
import { z } from "zod";

export const IndexEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  level: z.number().int(),
  rarity: z.string(),
  size: z.string(),
  traits: z.array(z.string()),
  ac: z.number(),
  hp: z.number(),
  remaster: z.boolean(),
  book: z.string(),
});

export const BookCatalogEntrySchema = z.object({
  pack: z.string(),
  title: z.string(),
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
  creatureCount: z.number().int().nonnegative(),
  indexPath: z.string(),
});

export const CollisionSchema = z.object({
  slug: z.string(),
  ids: z.array(z.string()).min(2),
});

export type IndexEntry = z.infer<typeof IndexEntrySchema>;
export type BookCatalogEntry = z.infer<typeof BookCatalogEntrySchema>;
export type Collision = z.infer<typeof CollisionSchema>;
```

Add `export * from "./book.js";` to `packages/schema/src/index.ts`.

- [ ] **Step 4: Implement the stage**

`packages/pf2data/src/stages/index.ts`:

```ts
import type {
  BookCatalogEntry,
  Collision,
  Creature,
  IndexEntry,
} from "@pf2/schema";

export interface IndexBuild {
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
  collisions: Collision[];
}

const slugOf = (id: string): string => id.slice(id.indexOf("/") + 1);

export function buildIndexes(creatures: Creature[]): IndexBuild {
  const indexes: Record<string, IndexEntry[]> = {};
  const bySlug = new Map<string, string[]>();

  for (const c of creatures) {
    const pack = c.source.pack;
    const slug = slugOf(c.id);

    (indexes[pack] ??= []).push({
      id: c.id,
      slug,
      name: c.name,
      level: c.level,
      rarity: c.rarity,
      size: c.size,
      traits: c.traits,
      ac: c.ac,
      hp: c.hp,
      remaster: c.source.remaster,
      book: c.source.book,
    });

    const sharing = bySlug.get(slug) ?? [];
    sharing.push(c.id);
    bySlug.set(slug, sharing);
  }

  for (const entries of Object.values(indexes)) {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  const books: BookCatalogEntry[] = Object.keys(indexes)
    .sort()
    .map((pack) => {
      const first = creatures.find((c) => c.source.pack === pack)!;
      return {
        pack,
        title: first.source.book,
        license: first.source.license,
        remaster: first.source.remaster,
        creatureCount: indexes[pack]!.length,
        indexPath: `index/${pack}.json`,
      };
    });

  const collisions: Collision[] = [...bySlug.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slug, ids]) => ({ slug, ids: [...ids].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return { books, indexes, collisions };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/index-stage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src packages/pf2data/src/stages/index.ts packages/pf2data/test/index-stage.test.ts
git commit -m "feat(pf2data): per-book indexes, book catalog and collision detection"
```

---

### Task 14: Upstream fetch stage with SHA pinning

**Files:**
- Create: `packages/schema/src/manifest.ts`, modify `packages/schema/src/index.ts`
- Create: `packages/pf2data/src/stages/fetch.ts`
- Test: `packages/pf2data/test/fetch.test.ts`

**Interfaces:**
- Consumes: `Pf2DataConfig` (Task 2).
- Produces: `fetchUpstream(options: FetchOptions): FetchResult` where `FetchOptions = { config: Pf2DataConfig; cacheDir: string; pinnedRef: string | null; useLatest: boolean; run?: RunGit }` and `FetchResult = { ref: string; packsDir: string; langPath: string }`, plus the constant `LANG_PATH = "static/lang/en.json"`. `RunGit = (args: string[], cwd: string) => string` is injected so the stage is testable without touching the network.

Uses `git clone --filter=blob:none --sparse` then `git sparse-checkout set` limited to the allowlisted packs, then `git checkout <ref>`. Without `--latest` it checks out the pinned SHA, which is what makes `update` byte-for-byte idempotent.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/fetch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchUpstream } from "../src/stages/fetch.js";
import type { Pf2DataConfig } from "../src/config.js";

const config: Pf2DataConfig = {
  upstream: { repo: "https://github.com/foundryvtt/pf2e", branch: "master" },
  packs: [
    { name: "conditions", kind: "conditions" },
    { name: "kingmaker-bestiary", kind: "creatures" },
  ],
};

function recorder() {
  const calls: string[][] = [];
  const run = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "rev-parse") return "abc123def456\n";
    return "";
  };
  return { calls, run };
}

describe("fetchUpstream", () => {
  it("sparse-checks-out only the allowlisted packs", () => {
    const { calls, run } = recorder();
    fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: true, run });
    const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
    expect(sparse).toContain("packs/conditions");
    expect(sparse).toContain("packs/kingmaker-bestiary");
    expect(sparse).not.toContain("packs/pathfinder-bestiary-3");
  });

  it("also checks out the localization file that holds glossary text", () => {
    const { calls, run } = recorder();
    fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: true, run });
    const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
    expect(sparse).toContain("static/lang/en.json");
  });

  it("checks out the pinned ref when not using latest", () => {
    const { calls, run } = recorder();
    const result = fetchUpstream({
      config, cacheDir: "/tmp/c", pinnedRef: "deadbeef", useLatest: false, run,
    });
    expect(calls.some((c) => c[0] === "checkout" && c[1] === "deadbeef")).toBe(true);
    expect(result.ref).toBe("deadbeef");
  });

  it("resolves the branch head when using latest", () => {
    const { run } = recorder();
    const result = fetchUpstream({
      config, cacheDir: "/tmp/c", pinnedRef: "old", useLatest: true, run,
    });
    expect(result.ref).toBe("abc123def456");
  });

  it("errors when neither a pin nor --latest is available", () => {
    const { run } = recorder();
    expect(() =>
      fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/no pinned ref/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/fetch.test.ts`
Expected: FAIL — cannot resolve `../src/stages/fetch.js`.

- [ ] **Step 3: Add the manifest schema**

`packages/schema/src/manifest.ts`:

```ts
import { z } from "zod";
import { CollisionSchema } from "./book.js";

export const ManifestSchema = z.object({
  toolVersion: z.string(),
  upstreamRepo: z.string(),
  upstreamRef: z.string(),
  generatedAt: z.string(),
  packs: z.array(z.string()),
  creatureCount: z.number().int().nonnegative(),
  collisions: z.array(CollisionSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
```

Add `export * from "./manifest.js";` to `packages/schema/src/index.ts`.

- [ ] **Step 4: Implement the stage**

`packages/pf2data/src/stages/fetch.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Pf2DataConfig } from "../config.js";

export type RunGit = (args: string[], cwd: string) => string;

export interface FetchOptions {
  config: Pf2DataConfig;
  cacheDir: string;
  pinnedRef: string | null;
  useLatest: boolean;
  run?: RunGit;
}

export interface FetchResult {
  ref: string;
  packsDir: string;
  langPath: string;
}

/** Glossary ability text lives here, not in the packs. See Task 18. */
export const LANG_PATH = "static/lang/en.json";

const defaultRun: RunGit = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

export function fetchUpstream(options: FetchOptions): FetchResult {
  const { config, cacheDir, pinnedRef, useLatest } = options;
  const run = options.run ?? defaultRun;

  if (pinnedRef === null && !useLatest) {
    throw new Error(
      "No pinned ref in data/manifest.json. Run with --latest to create one.",
    );
  }

  if (!existsSync(join(cacheDir, ".git"))) {
    run(
      [
        "clone",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        config.upstream.branch,
        config.upstream.repo,
        cacheDir,
      ],
      ".",
    );
  } else {
    run(["fetch", "origin", config.upstream.branch], cacheDir);
  }

  run(
    [
      "sparse-checkout",
      "set",
      ...config.packs.map((p) => `packs/${p.name}`),
      LANG_PATH,
    ],
    cacheDir,
  );

  const ref = useLatest
    ? run(["rev-parse", `origin/${config.upstream.branch}`], cacheDir).trim()
    : pinnedRef!;

  run(["checkout", ref], cacheDir);

  return {
    ref,
    packsDir: join(cacheDir, "packs"),
    langPath: join(cacheDir, LANG_PATH),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/fetch.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/manifest.ts packages/schema/src/index.ts packages/pf2data/src/stages/fetch.ts packages/pf2data/test/fetch.test.ts
git commit -m "feat(pf2data): upstream sparse fetch with sha pinning"
```

---

### Task 15: Verify stage

**Files:**
- Create: `packages/pf2data/src/stages/verify.ts`
- Test: `packages/pf2data/test/verify.test.ts`

**Interfaces:**
- Consumes: `CreatureSchema`, `Manifest`, `IndexEntry`, `BookCatalogEntry` (Tasks 11, 13, 14).
- Produces: `verifyDataset(input: VerifyInput): VerifyResult` where `VerifyInput = { creatures: unknown[]; books: BookCatalogEntry[]; indexes: Record<string, IndexEntry[]>; manifest: Manifest }` and `VerifyResult = { ok: boolean; failures: string[] }`.

Implements the six invariants from the spec: schema validity, book counts match index lengths, every index entry has a creature file, collision set matches the manifest, no alignment trait survives, no unresolved `@UUID[` remains.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/verify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";
import { buildIndexes } from "../src/stages/index.js";
import { verifyDataset } from "../src/stages/verify.js";

const stagLord = normalizeCreature(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
      "utf8",
    ),
  ),
  "kingmaker-bestiary",
  "the-stag-lord",
);

const manifest = (overrides: Partial<Manifest> = {}): Manifest => ({
  toolVersion: "0.0.0",
  upstreamRepo: "https://github.com/foundryvtt/pf2e",
  upstreamRef: "abc123",
  generatedAt: "2026-08-24T00:00:00.000Z",
  packs: ["kingmaker-bestiary"],
  creatureCount: 1,
  collisions: [],
  ...overrides,
});

describe("verifyDataset", () => {
  it("passes on a consistent dataset", () => {
    const build = buildIndexes([stagLord]);
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("fails when a book count disagrees with its index", () => {
    const build = buildIndexes([stagLord]);
    build.books[0]!.creatureCount = 99;
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/creatureCount/);
  });

  it("fails when an alignment trait survives normalization", () => {
    const tainted = { ...stagLord, traits: ["human", "evil"] };
    const build = buildIndexes([tainted]);
    const result = verifyDataset({
      creatures: [tainted],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/alignment/i);
  });

  it("fails when an unresolved uuid link remains", () => {
    const tainted = { ...stagLord, publicNotes: "see @UUID[Compendium.pf2e.x.Item.y]{Z}" };
    const build = buildIndexes([tainted]);
    const result = verifyDataset({
      creatures: [tainted],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/@UUID/);
  });

  it("fails when the collision set drifts from the manifest", () => {
    const build = buildIndexes([stagLord]);
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest({
        collisions: [{ slug: "barghest", ids: ["a/barghest", "b/barghest"] }],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/collision/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/verify.test.ts`
Expected: FAIL — cannot resolve `../src/stages/verify.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/stages/verify.ts`:

```ts
import {
  CreatureSchema,
  type BookCatalogEntry,
  type IndexEntry,
  type Manifest,
} from "@pf2/schema";
import { buildIndexes } from "./index.js";

const ALIGNMENT_TRAITS = new Set([
  "lawful",
  "chaotic",
  "good",
  "evil",
  "neutral",
]);

export interface VerifyInput {
  creatures: unknown[];
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
  manifest: Manifest;
}

export interface VerifyResult {
  ok: boolean;
  failures: string[];
}

export function verifyDataset(input: VerifyInput): VerifyResult {
  const failures: string[] = [];

  // 1. schema validity
  const parsed = [];
  for (const raw of input.creatures) {
    const result = CreatureSchema.safeParse(raw);
    if (!result.success) {
      const id = (raw as { id?: string }).id ?? "<unknown>";
      failures.push(`schema: ${id}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsed.push(result.data);
  }

  // 2. book counts match index lengths
  for (const book of input.books) {
    const entries = input.indexes[book.pack];
    if (entries === undefined) {
      failures.push(`books: ${book.pack} has no index`);
      continue;
    }
    if (entries.length !== book.creatureCount) {
      failures.push(
        `books: ${book.pack} creatureCount ${book.creatureCount} != index length ${entries.length}`,
      );
    }
  }

  // 3. every index entry has a creature
  const ids = new Set(parsed.map((c) => c.id));
  for (const entries of Object.values(input.indexes)) {
    for (const entry of entries) {
      if (!ids.has(entry.id)) {
        failures.push(`index: ${entry.id} has no creature record`);
      }
    }
  }

  // 4. collision set matches the manifest
  const actual = JSON.stringify(buildIndexes(parsed).collisions);
  const recorded = JSON.stringify(input.manifest.collisions);
  if (actual !== recorded) {
    failures.push(`collisions: computed set ${actual} != manifest set ${recorded}`);
  }

  // 5. no alignment trait survives
  for (const c of parsed) {
    for (const trait of c.traits) {
      if (ALIGNMENT_TRAITS.has(trait)) {
        failures.push(`alignment: ${c.id} still carries trait "${trait}"`);
      }
    }
  }

  // 6. no unresolved uuid links
  for (const c of parsed) {
    if (JSON.stringify(c).includes("@UUID[")) {
      failures.push(`links: ${c.id} contains an unresolved @UUID reference`);
    }
  }

  return { ok: failures.length === 0, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/verify.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pf2data/src/stages/verify.ts packages/pf2data/test/verify.test.ts
git commit -m "feat(pf2data): verify stage with dataset invariants"
```

---

### Task 16: Normalize stage and change reporting

**Files:**
- Create: `packages/pf2data/src/stages/normalize.ts`
- Create: `packages/pf2data/src/report.ts`
- Test: `packages/pf2data/test/report.test.ts`

**Interfaces:**
- Consumes: `walkPack` (Task 3), `normalizeCreature` (11), `stableStringify` (12).
- Produces:
  - `normalizePacks(packsDir: string, config: Pf2DataConfig): Creature[]`
  - `diffDataset(previous: Map<string, string>, next: Map<string, string>): DatasetDiff` where `DatasetDiff = { added: string[]; removed: string[]; modified: string[] }`. Both maps are id → `stableStringify` output.
  - `type ChangeStatus = "unchanged" | "updated"`, `statusOf(diff: DatasetDiff): ChangeStatus`.

`diffDataset` is what lets `update` report exactly what changed and choose exit code `0` versus `10`.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffDataset, statusOf } from "../src/report.js";

const map = (entries: [string, string][]) => new Map(entries);

describe("diffDataset", () => {
  it("reports nothing for identical datasets", () => {
    const a = map([["p/a", "{}"]]);
    const diff = diffDataset(a, map([["p/a", "{}"]]));
    expect(diff).toEqual({ added: [], removed: [], modified: [] });
    expect(statusOf(diff)).toBe("unchanged");
  });

  it("detects additions, removals and modifications", () => {
    const diff = diffDataset(
      map([["p/gone", "{}"], ["p/same", "{}"], ["p/changed", "{\"a\":1}"]]),
      map([["p/same", "{}"], ["p/changed", "{\"a\":2}"], ["p/new", "{}"]]),
    );
    expect(diff).toEqual({
      added: ["p/new"],
      removed: ["p/gone"],
      modified: ["p/changed"],
    });
    expect(statusOf(diff)).toBe("updated");
  });

  it("sorts each list for deterministic reporting", () => {
    const diff = diffDataset(map([]), map([["p/z", "{}"], ["p/a", "{}"]]));
    expect(diff.added).toEqual(["p/a", "p/z"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/report.test.ts`
Expected: FAIL — cannot resolve `../src/report.js`.

- [ ] **Step 3: Implement the reporter**

`packages/pf2data/src/report.ts`:

```ts
export interface DatasetDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export type ChangeStatus = "unchanged" | "updated";

export function diffDataset(
  previous: Map<string, string>,
  next: Map<string, string>,
): DatasetDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [id, content] of next) {
    const before = previous.get(id);
    if (before === undefined) added.push(id);
    else if (before !== content) modified.push(id);
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) removed.push(id);
  }

  const sort = (xs: string[]): string[] => xs.sort((a, b) => a.localeCompare(b));
  return { added: sort(added), removed: sort(removed), modified: sort(modified) };
}

export function statusOf(diff: DatasetDiff): ChangeStatus {
  const total =
    diff.added.length + diff.removed.length + diff.modified.length;
  return total === 0 ? "unchanged" : "updated";
}
```

- [ ] **Step 4: Implement the normalize stage**

`packages/pf2data/src/stages/normalize.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Creature } from "@pf2/schema";
import type { Pf2DataConfig } from "../config.js";
import { walkPack } from "../io/walk.js";
import { normalizeCreature } from "../normalize/creature.js";

export function normalizePacks(
  packsDir: string,
  config: Pf2DataConfig,
): Creature[] {
  const creatures: Creature[] = [];

  for (const pack of config.packs) {
    if (pack.kind !== "creatures") continue;
    for (const file of walkPack(join(packsDir, pack.name))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      if ((raw as { type?: string }).type !== "npc") continue;
      creatures.push(normalizeCreature(raw, pack.name, file.slug));
    }
  }

  return creatures.sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/report.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/pf2data/src/stages/normalize.ts packages/pf2data/src/report.ts packages/pf2data/test/report.test.ts
git commit -m "feat(pf2data): normalize stage and dataset change reporting"
```

---

### Task 17: CLI with structured output and exit codes

**Files:**
- Create: `packages/pf2data/src/cli.ts`
- Modify: `package.json` (root) — add the `data` script
- Test: `packages/pf2data/test/cli.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2, 12, 14, 15, 16.
- Produces: `parseArgs(argv: string[]): Command` where `Command = { name: "update"; latest: boolean } | { name: "status" } | { name: "verify" }`, and `runCli(argv: string[], io: CliIo): number` returning the exit code. `CliIo = { out: (s: string) => void; err: (s: string) => void; isTty: boolean }`.

Contract from the spec: JSON to stdout when stdout is not a TTY, prose to stderr always, exit codes `0` / `10` / `20` / `30` / `1`.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  it("parses update without latest", () => {
    expect(parseArgs(["update"])).toEqual({ name: "update", latest: false });
  });

  it("parses update --latest", () => {
    expect(parseArgs(["update", "--latest"])).toEqual({
      name: "update",
      latest: true,
    });
  });

  it("parses status and verify", () => {
    expect(parseArgs(["status"])).toEqual({ name: "status" });
    expect(parseArgs(["verify"])).toEqual({ name: "verify" });
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/unknown command/i);
  });

  it("rejects no command", () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/cli.test.ts`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/cli.ts`:

```ts
#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ManifestSchema,
  type BookCatalogEntry,
  type IndexEntry,
  type Manifest,
} from "@pf2/schema";
import { loadConfig } from "./config.js";
import { writeJson, stableStringify } from "./io/write.js";
import { fetchUpstream } from "./stages/fetch.js";
import { normalizePacks } from "./stages/normalize.js";
import { buildIndexes } from "./stages/index.js";
import { verifyDataset } from "./stages/verify.js";
import { diffDataset, statusOf } from "./report.js";

export const EXIT = {
  unchanged: 0,
  updated: 10,
  verifyFailed: 20,
  upstreamError: 30,
  usageError: 1,
} as const;

export type Command =
  | { name: "update"; latest: boolean }
  | { name: "status" }
  | { name: "verify" };

const USAGE = "usage: pf2data <update [--latest] | status | verify>";

export function parseArgs(argv: string[]): Command {
  const [command, ...rest] = argv;
  if (command === undefined) throw new Error(USAGE);
  if (command === "update") {
    return { name: "update", latest: rest.includes("--latest") };
  }
  if (command === "status") return { name: "status" };
  if (command === "verify") return { name: "verify" };
  throw new Error(`unknown command "${command}". ${USAGE}`);
}

export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
  isTty: boolean;
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DATA_DIR = join(ROOT, "data");
const CACHE_DIR = join(ROOT, ".cache", "pf2e");
const CONFIG_PATH = join(ROOT, "packages/pf2data/pf2data.config.json");
const MANIFEST_PATH = join(DATA_DIR, "manifest.json");
const TOOL_VERSION = "0.1.0";

function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  return ManifestSchema.parse(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

interface OnDiskDataset {
  creatures: unknown[];
  raw: Map<string, string>;
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
}

/** Reads the committed dataset. Used by `verify`, and by `update` to diff. */
function readDataset(manifest: Manifest | null): OnDiskDataset {
  const empty: OnDiskDataset = {
    creatures: [],
    raw: new Map(),
    books: [],
    indexes: {},
  };
  if (manifest === null) return empty;

  const booksPath = join(DATA_DIR, "books.json");
  const books: BookCatalogEntry[] = existsSync(booksPath)
    ? JSON.parse(readFileSync(booksPath, "utf8"))
    : [];

  const indexes: Record<string, IndexEntry[]> = {};
  const creatures: unknown[] = [];
  const raw = new Map<string, string>();

  for (const pack of manifest.packs) {
    const indexPath = join(DATA_DIR, "index", `${pack}.json`);
    if (!existsSync(indexPath)) continue;
    const entries: IndexEntry[] = JSON.parse(readFileSync(indexPath, "utf8"));
    indexes[pack] = entries;
    for (const entry of entries) {
      const file = join(DATA_DIR, "creatures", `${entry.id}.json`);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      raw.set(entry.id, text);
      creatures.push(JSON.parse(text));
    }
  }

  return { creatures, raw, books, indexes };
}

export function runCli(argv: string[], io: CliIo): number {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    io.err(`${(error as Error).message}\n`);
    return EXIT.usageError;
  }

  const config = loadConfig(CONFIG_PATH);
  const manifest = readManifest();
  const emit = (payload: unknown): void => {
    if (!io.isTty) io.out(stableStringify(payload));
  };

  if (command.name === "status") {
    io.err(
      manifest === null
        ? "No dataset generated yet. Run: pf2data update --latest\n"
        : `Pinned to ${manifest.upstreamRef}, ${manifest.creatureCount} creatures, generated ${manifest.generatedAt}\n`,
    );
    emit({ command: "status", manifest });
    return EXIT.unchanged;
  }

  if (command.name === "verify") {
    if (manifest === null) {
      io.err("No dataset generated yet. Run: pf2data update --latest\n");
      emit({ command: "verify", ok: false, failures: ["no dataset"] });
      return EXIT.verifyFailed;
    }
    const onDisk = readDataset(manifest);
    const result = verifyDataset({
      creatures: onDisk.creatures,
      books: onDisk.books,
      indexes: onDisk.indexes,
      manifest,
    });
    for (const failure of result.failures) io.err(`${failure}\n`);
    if (result.ok) io.err("dataset verified\n");
    emit({ command: "verify", ok: result.ok, failures: result.failures });
    return result.ok ? EXIT.unchanged : EXIT.verifyFailed;
  }

  let fetched;
  try {
    fetched = fetchUpstream({
      config,
      cacheDir: CACHE_DIR,
      pinnedRef: manifest?.upstreamRef ?? null,
      useLatest: command.latest,
    });
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  const creatures = normalizePacks(fetched.packsDir, config);
  const build = buildIndexes(creatures);

  const nextManifest: Manifest = {
    toolVersion: TOOL_VERSION,
    upstreamRepo: config.upstream.repo,
    upstreamRef: fetched.ref,
    generatedAt: manifest?.generatedAt ?? new Date().toISOString(),
    packs: config.packs.map((p) => p.name),
    creatureCount: creatures.length,
    collisions: build.collisions,
  };

  const verification = verifyDataset({
    creatures,
    books: build.books,
    indexes: build.indexes,
    manifest: nextManifest,
  });

  if (!verification.ok) {
    for (const failure of verification.failures) io.err(`${failure}\n`);
    emit({ command: command.name, ok: false, failures: verification.failures });
    return EXIT.verifyFailed;
  }

  const previous = readDataset(manifest).raw;
  const next = new Map(creatures.map((c) => [c.id, stableStringify(c)]));
  const diff = diffDataset(previous, next);
  const status = statusOf(diff);

  if (status === "updated") {
    nextManifest.generatedAt = new Date().toISOString();
  }

  for (const id of diff.removed) {
    rmSync(join(DATA_DIR, "creatures", `${id}.json`), { force: true });
  }
  for (const creature of creatures) {
    writeJson(join(DATA_DIR, "creatures", `${creature.id}.json`), creature);
  }
  for (const [pack, entries] of Object.entries(build.indexes)) {
    writeJson(join(DATA_DIR, "index", `${pack}.json`), entries);
  }
  writeJson(join(DATA_DIR, "books.json"), build.books);
  writeJson(MANIFEST_PATH, nextManifest);

  io.err(
    `${status}: +${diff.added.length} -${diff.removed.length} ~${diff.modified.length} at ${fetched.ref}\n`,
  );
  emit({
    command: "update",
    ok: true,
    status,
    upstreamRef: fetched.ref,
    creatureCount: creatures.length,
    ...diff,
  });

  return status === "updated" ? EXIT.updated : EXIT.unchanged;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(
    runCli(process.argv.slice(2), {
      out: (s) => process.stdout.write(s),
      err: (s) => process.stderr.write(s),
      isTty: process.stdout.isTTY === true,
    }),
  );
}
```

Add to the root `package.json` scripts:

```json
"data": "tsx packages/pf2data/src/cli.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/cli.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests across both packages.

- [ ] **Step 6: Commit**

```bash
git add packages/pf2data/src/cli.ts package.json
git commit -m "feat(pf2data): cli with structured output and exit codes"
```

---

### Task 18: Conditions and glossary reference data

**Files:**
- Create: `packages/schema/src/reference.ts`, modify `packages/schema/src/index.ts`
- Create: `packages/pf2data/src/normalize/localize.ts`
- Create: `packages/pf2data/src/stages/reference.ts`
- Modify: `packages/pf2data/src/cli.ts`
- Test: `packages/pf2data/test/reference.test.ts`

**Interfaces:**
- Consumes: `walkPack` (Task 3), `resolveLinks` (Task 10), `LANG_PATH` (Task 14).
- Produces:
  - `resolveLocalize(html: string, lang: LangTable): string`, `LangTable = Record<string, string>`
  - `loadGlossaryLang(langFilePath: string): LangTable` — flattens `PF2E.NPC.Abilities.Glossary.*` into dotted keys
  - `buildConditions(packsDir: string): Condition[]`
  - `buildGlossary(packsDir: string, lang: LangTable, packs: string[]): GlossaryEntry[]`

```ts
interface Condition {
  slug: string; name: string; isValued: boolean; description: string;
}
interface GlossaryEntry {
  slug: string; name: string; cost: ActionCost; traits: string[]; description: string;
}
```

Two upstream facts drive this task. Conditions carry `system.value.isValued`,
which tells the tracker whether a condition takes a numeric value (frightened 2)
or is binary (prone). And glossary abilities store their text as
`<p>@Localize[PF2E.NPC.Abilities.Glossary.Grab]</p>` — the actual prose lives in
`static/lang/en.json`, so it must be resolved or the emitted glossary is empty
placeholders. There are 53 such keys.

Per the spec, `conditions.json` is **reference text only**: mechanical effects
are hand-implemented in the tracker's rules module, so Foundry `rules[]` arrays
are deliberately not emitted.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLocalize } from "../src/normalize/localize.js";

describe("resolveLocalize", () => {
  it("substitutes a localization key with its text", () => {
    const lang = {
      "PF2E.NPC.Abilities.Glossary.Grab": "<p>The monster grabs you.</p>",
    };
    expect(
      resolveLocalize("<p>@Localize[PF2E.NPC.Abilities.Glossary.Grab]</p>", lang),
    ).toBe("<p><p>The monster grabs you.</p></p>");
  });

  it("leaves an unknown key untouched so it is visible in verification", () => {
    const html = "<p>@Localize[PF2E.Missing.Key]</p>";
    expect(resolveLocalize(html, {})).toBe(html);
  });

  it("resolves every key in a document", () => {
    const lang = { A: "one", B: "two" };
    expect(resolveLocalize("@Localize[A] and @Localize[B]", lang)).toBe(
      "one and two",
    );
  });

  it("leaves text without localize markers untouched", () => {
    expect(resolveLocalize("<p>plain</p>", {})).toBe("<p>plain</p>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/reference.test.ts`
Expected: FAIL — cannot resolve `../src/normalize/localize.js`.

- [ ] **Step 3: Implement the localizer**

`packages/pf2data/src/normalize/localize.ts`:

```ts
import { readFileSync } from "node:fs";

export type LangTable = Record<string, string>;

const LOCALIZE_PATTERN = /@Localize\[([A-Za-z0-9._-]+)\]/g;

export function resolveLocalize(html: string, lang: LangTable): string {
  return html.replace(LOCALIZE_PATTERN, (match, key: string) =>
    lang[key] ?? match,
  );
}

/** Flattens PF2E.NPC.Abilities.Glossary.* into dotted keys. */
export function loadGlossaryLang(langFilePath: string): LangTable {
  const root: unknown = JSON.parse(readFileSync(langFilePath, "utf8"));
  const table: LangTable = {};

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      table[path] = node;
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };

  walk(root, "");
  return table;
}
```

- [ ] **Step 4: Add the reference schemas**

`packages/schema/src/reference.ts`:

```ts
import { z } from "zod";
import { ActionCostSchema } from "./creature.js";

export const ConditionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  isValued: z.boolean(),
  description: z.string(),
});

export const GlossaryEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  cost: ActionCostSchema,
  traits: z.array(z.string()),
  description: z.string(),
});

export type Condition = z.infer<typeof ConditionSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
```

Add `export * from "./reference.js";` to `packages/schema/src/index.ts`.

- [ ] **Step 5: Implement the reference stage**

`packages/pf2data/src/stages/reference.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Condition, GlossaryEntry } from "@pf2/schema";
import { walkPack } from "../io/walk.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";

const ConditionItemSchema = z.object({
  name: z.string(),
  type: z.literal("condition"),
  system: z.object({
    description: z.object({ value: z.string().default("") }),
    value: z.object({ isValued: z.boolean() }),
  }),
});

const GlossaryItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    description: z.object({ value: z.string().default("") }),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export function buildConditions(packsDir: string): Condition[] {
  const conditions: Condition[] = [];

  for (const file of walkPack(join(packsDir, "conditions"))) {
    const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
    const parsed = ConditionItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    conditions.push({
      slug: file.slug,
      name: parsed.data.name,
      isValued: parsed.data.system.value.isValued,
      description: resolveLinks(parsed.data.system.description.value),
    });
  }

  return conditions.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildGlossary(
  packsDir: string,
  lang: LangTable,
  packs: string[],
): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = GlossaryItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      const { name, system } = parsed.data;

      const kind = system.actionType.value;
      const n = system.actions?.value;
      const cost =
        kind !== "action"
          ? kind
          : n === 1 || n === 2 || n === 3
            ? (String(n) as GlossaryEntry["cost"])
            : "passive";

      entries.push({
        slug: file.slug,
        name,
        cost,
        traits: [...(system.traits?.value ?? [])].sort((a, b) =>
          a.localeCompare(b),
        ),
        description: resolveLinks(
          resolveLocalize(system.description.value, lang),
        ),
      });
    }
  }

  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}
```

- [ ] **Step 6: Wire it into the CLI**

In `packages/pf2data/src/cli.ts`, add the imports:

```ts
import { loadGlossaryLang } from "./normalize/localize.js";
import { buildConditions, buildGlossary } from "./stages/reference.js";
```

and immediately after the `writeJson(join(DATA_DIR, "books.json"), build.books);`
line, add:

```ts
  const lang = loadGlossaryLang(fetched.langPath);
  const glossaryPacks = config.packs
    .filter((p) => p.kind === "glossary")
    .map((p) => p.name);
  writeJson(join(DATA_DIR, "conditions.json"), buildConditions(fetched.packsDir));
  writeJson(
    join(DATA_DIR, "glossary.json"),
    buildGlossary(fetched.packsDir, lang, glossaryPacks),
  );
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run packages/pf2data/test/reference.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/reference.ts packages/schema/src/index.ts packages/pf2data/src/normalize/localize.ts packages/pf2data/src/stages/reference.ts packages/pf2data/src/cli.ts packages/pf2data/test/reference.test.ts
git commit -m "feat(pf2data): emit condition and glossary reference data"
```

---

### Task 19: First real dataset generation

**Files:**
- Create: `data/**` (generated)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the complete CLI (Task 17).
- Produces: the committed dataset.

This is the first end-to-end run against real upstream data. Expect roughly 1263 creatures across five creature packs.

- [ ] **Step 1: Confirm `.cache/` is ignored**

`.gitignore` must contain `node_modules/`, `dist/`, `.cache/`. It already does from the spec commit; verify.

- [ ] **Step 2: Run the pipeline for the first time**

```bash
npm run data -- update --latest
echo "exit: $?"
```

Expected: exit `10` (updated). Stderr reports `updated: +1263 -0 ~0 at <sha>`.

If it exits `20`, read the failure lines on stderr — the verify invariants name the offending creature id and the reason. Fix the relevant normalizer, re-run.

- [ ] **Step 3: Confirm idempotency**

```bash
npm run data -- update
echo "exit: $?"
git status --porcelain data/ | head
```

Expected: exit `0` (unchanged), and `git status` reports **no modifications** under `data/`. If any file changed, some normalizer is non-deterministic — find it via `git diff data/` and add the missing sort.

- [ ] **Step 4: Confirm the machine-readable contract**

```bash
npm run data -- status | head -20
npm run data -- verify > /dev/null; echo "verify exit: $?"
```

Expected: `status` emits parseable JSON on stdout; `verify` exits `0`.

- [ ] **Step 5: Spot-check the Kingmaker content**

```bash
node -e "const c=require('./data/creatures/kingmaker-bestiary/the-stag-lord.json'); console.log(c.name, c.level, c.ac, c.hp, c.source.remaster)"
```

Expected: `The Stag Lord 6 23 110 false`.

Then confirm the reference data resolved — this catches an unresolved
`@Localize` marker, which would otherwise ship an empty glossary:

```bash
node -e "
const c=require('./data/conditions.json'), g=require('./data/glossary.json');
console.log('conditions', c.length, 'valued:', c.filter(x=>x.isValued).length);
console.log('glossary', g.length);
const grab=g.find(x=>x.slug==='grab');
console.log('grab resolved:', !grab.description.includes('@Localize'));
"
```

Expected: roughly 43 conditions with a double-digit valued count, roughly 100
glossary entries, and `grab resolved: true`.

- [ ] **Step 6: Commit the dataset**

```bash
git add data
git commit -m "data: initial normalized dataset from foundryvtt/pf2e"
```

---

### Task 20: Generated schema documentation and agent guide

**Files:**
- Create: `packages/pf2data/src/docs/schema-doc.ts`
- Modify: `packages/pf2data/src/cli.ts`
- Create: `AGENTS.md`
- Create: `data/SCHEMA.md` (generated)
- Test: `packages/pf2data/test/schema-doc.test.ts`

**Interfaces:**
- Consumes: `CreatureSchema`, `IndexEntrySchema`, `BookCatalogEntrySchema`, `ManifestSchema` (Tasks 11, 13, 14), `ConditionSchema`, `GlossaryEntrySchema` (Task 18).
- Produces: `renderSchemaDoc(): string` — Markdown describing every emitted file and every creature field. Written to `data/SCHEMA.md` by `update`.

The spec's agent-friendliness requirement: an agent reads one file before touching the dataset.

- [ ] **Step 1: Write the failing test**

`packages/pf2data/test/schema-doc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSchemaDoc } from "../src/docs/schema-doc.js";

describe("renderSchemaDoc", () => {
  it("documents every emitted file", () => {
    const doc = renderSchemaDoc();
    for (const path of [
      "manifest.json",
      "books.json",
      "index/<pack>.json",
      "creatures/<pack>/<slug>.json",
      "conditions.json",
      "glossary.json",
    ]) {
      expect(doc).toContain(path);
    }
  });

  it("documents the creature fields an agent needs", () => {
    const doc = renderSchemaDoc();
    for (const field of ["ac", "hp", "saves", "actions", "spellcasting", "remaster"]) {
      expect(doc).toContain(field);
    }
  });

  it("documents the exit codes", () => {
    const doc = renderSchemaDoc();
    expect(doc).toContain("10");
    expect(doc).toContain("verification failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/pf2data/test/schema-doc.test.ts`
Expected: FAIL — cannot resolve `../src/docs/schema-doc.js`.

- [ ] **Step 3: Implement**

`packages/pf2data/src/docs/schema-doc.ts`:

```ts
export function renderSchemaDoc(): string {
  return `# Generated dataset schema

This file is generated by \`pf2data update\`. Do not edit by hand.

## Files

| Path | Contents |
|---|---|
| \`manifest.json\` | Upstream repo and pinned ref, generation timestamp, pack list, creature count, build-time collision set. |
| \`books.json\` | Book catalog: \`pack\`, \`title\`, \`license\`, \`remaster\`, \`creatureCount\`, \`indexPath\`. |
| \`index/<pack>.json\` | Search index for one book. Load only the books in use. |
| \`creatures/<pack>/<slug>.json\` | One full creature record. Fetch lazily. |
| \`conditions.json\` | Condition reference text: \`slug\`, \`name\`, \`isValued\`, \`description\`. Reference only -- mechanical effects are hand-implemented in the tracker's rules module. |
| \`glossary.json\` | Monster ability glossary (Grab, Attack of Opportunity, ...): \`slug\`, \`name\`, \`cost\`, \`traits\`, \`description\`. |
| \`SCHEMA.md\` | This file. |

## Index entry fields

\`id\`, \`slug\`, \`name\`, \`level\`, \`rarity\`, \`size\`, \`traits\`, \`ac\`, \`hp\`, \`remaster\`, \`book\`.

## Creature fields

Identity: \`id\` (\`<pack>/<slug>\`), \`foundryId\`, \`name\`, \`level\`, \`rarity\`, \`size\`, \`traits\`, \`source\` (\`pack\`, \`book\`, \`license\`, \`remaster\`).

Defences: \`ac\`, \`hp\`, \`saves\` (\`fortitude\`, \`reflex\`, \`will\`), \`immunities\`, \`weaknesses\`, \`resistances\`.

Other statistics: \`perception\`, \`senses\`, \`languages\`, \`skills\`, \`abilityMods\`, \`speeds\`.

Combat: \`attacks\` (\`name\`, \`kind\`, \`bonus\`, \`damage\`, \`traits\`), \`actions\` (\`name\`, \`cost\`, \`category\`, \`traits\`, \`trigger\`, \`requirements\`, \`frequency\`, \`description\`), \`spellcasting\` (\`name\`, \`tradition\`, \`preparation\`, \`dc\`, \`attack\`, \`slots\`, \`spells\`).

Reference: \`gear\`, \`publicNotes\`.

\`cost\` is one of \`1\`, \`2\`, \`3\`, \`reaction\`, \`free\`, \`passive\`.

## Notes

- \`remaster\` is per creature, not per repository. Legacy Bestiary 1 and 2 creatures coexist with Monster Core ones by design, because Kingmaker cites them.
- Legacy alignment traits are stripped. \`flat-footed\` is emitted as \`off-guard\`.
- Slug collisions across books are **recorded, not resolved**. Resolution happens in the tracker against the active book set, remaster winning.

## CLI exit codes

| Code | Meaning |
|---|---|
| 0 | Success, no change |
| 10 | Success, data updated |
| 20 | Verification failed |
| 30 | Upstream or network error |
| 1 | Usage error |

Structured JSON is written to stdout when stdout is not a TTY. Human-readable output always goes to stderr.
`;
}
```

- [ ] **Step 4: Wire it into the CLI**

In `packages/pf2data/src/cli.ts`, add the import:

```ts
import { renderSchemaDoc } from "./docs/schema-doc.js";
```

and, immediately after the `writeJson(MANIFEST_PATH, nextManifest);` line, add:

```ts
  writeFileSync(join(DATA_DIR, "SCHEMA.md"), renderSchemaDoc(), "utf8");
```

adding `writeFileSync` to the existing `node:fs` import.

- [ ] **Step 5: Write the agent guide**

`AGENTS.md`:

```markdown
# Agent guide

## Dataset

Pathfinder 2e creature data lives in `data/`, generated from `foundryvtt/pf2e`.
**Read `data/SCHEMA.md` before touching it.** Never hand-edit anything under
`data/` — it is regenerated wholesale.

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
```

- [ ] **Step 6: Run tests and regenerate**

```bash
npx vitest run packages/pf2data/test/schema-doc.test.ts
npm test
npm run data -- update
```

Expected: all tests PASS; `update` exits `0` with `data/SCHEMA.md` newly created.

- [ ] **Step 7: Commit**

```bash
git add packages/pf2data/src/docs packages/pf2data/src/cli.ts packages/pf2data/test/schema-doc.test.ts AGENTS.md data/SCHEMA.md
git commit -m "feat(pf2data): generated schema doc and agent guide"
```

---

## Done

At this point the pipeline is complete and the dataset is committed. Sub-project
2 (the tracker app) consumes `@pf2/schema` directly and fetches `data/books.json`,
`data/index/<pack>.json` and `data/creatures/<pack>/<slug>.json` over HTTP from
GitHub Pages.
