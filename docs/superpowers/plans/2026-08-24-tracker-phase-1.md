# PF2 Combat Tracker — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running, deployable tracker the GM can use for one real fight: load a book, search creatures, add several at once, roll initiative, advance turns, apply damage, and read the exact dice to roll for a Strike.

**Architecture:** Vite + React + TypeScript, static-only for GitHub Pages. All game logic lives in a dependency-free `rules/` module of pure functions, unit-tested without React. A thin Zustand store holds encounter state and calls into `rules/`. Data is fetched from the committed `data/` directory produced by the `pf2data` pipeline (already on `main`), typed via the shared `@pf2/schema` package.

**Tech Stack:** Node 22+, TypeScript 5.x (ESM), React 19, Vite 6, Zustand 5 + Immer, `idb` for IndexedDB, Vitest + React Testing Library. `zod` and `@pf2/schema` already in the workspace.

**Spec:** `docs/superpowers/specs/2026-08-24-pf2-tracker-design.md`

## Global Constraints

- Node 22+. ESM only. Static build — no server, no backend calls.
- `rules/` is **pure**: no React, no I/O, no `Date.now()`, no randomness. Dice are rolled physically by the GM; the app never generates a random number.
- Every emitted/derived array sorted by a stable, locale-independent key. Reuse `compareStrings` from `packages/pf2data/src/util.ts` by copying it into `rules/` (do not import across package boundaries into the app).
- Creature ids are exactly `<pack>/<slug>`.
- **Only the worst status penalty of a type applies**, and likewise the best bonus of a type. Untyped penalties stack.
- **A natural 20 raises the degree of success one step; a natural 1 lowers it.**
- Prompts are dismissed by explicit click. Never a timer, never auto-dismiss.
- The action pool is an **indicator, never a blocker**. Unaffordable actions render disabled but visible; Next always works.
- Damage type selection resets to `none` after every damage application.
- XP award per character is the plain sum of creature XP, **not** adjusted for party size.
- Visual direction: dark warm near-black ground, ember accent, Spectral / IBM Plex Sans / IBM Plex Mono. Match the approved mockups in `mockups/*.dc.html` for spacing, colour and density — they are the reference, lift exact values from them.

## Out of scope for phase 1 (phase 2)

Difficulty rating badges, group builder UI (groups exist in the model but are created only via a minimal control), spellcasting panel, save-based ability assistant, export/import, absent-player toggling, Delay/Ready.

## File Structure

```
packages/app/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/
    main.tsx, App.tsx
    rules/
      compare.ts            locale-independent comparator
      modifiers.ts          bonus/penalty stacking
      conditions.ts         curated condition catalogue + effects
      degrees.ts            degrees of success, natural 20/1
      map.ts                multiple attack penalty
      actions.ts            action pool: slowed/stunned/quickened
      strike.ts             strike resolution → outcome ladder
      prompts.ts            start/end-of-turn prompt derivation
      xp.ts                 creature XP by level delta, encounter total
    data/
      catalog.ts            books.json + per-book index loading
      creatures.ts          lazy creature fetch + cache
    state/
      types.ts              Combatant, Group, Encounter, Party
      store.ts              Zustand store
      persist.ts            IndexedDB save/load
    components/
      EncounterScreen.tsx
      CombatantList.tsx  CombatantRow.tsx  GroupHeader.tsx  RowPopover.tsx
      ActiveCombatant.tsx  StatBlockHeader.tsx  DefensesPanel.tsx
      ActionList.tsx  ActionCard.tsx  AttacksPanel.tsx  RollAssistant.tsx
      TurnManager.tsx  ActionPips.tsx  NextButton.tsx  ReactionWatch.tsx
      TurnPrompts.tsx  PromptCard.tsx
      AddCombatants.tsx  PartyManager.tsx
    styles/tokens.css
  test/ …
```

---

### Task 1: App scaffold that builds and deploys

**Files:**
- Create: `packages/app/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `packages/app/src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`
- Modify: root `package.json` (workspace scripts), root `tsconfig.json` (add reference)
- Test: `packages/app/test/smoke.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a Vite app that builds to `packages/app/dist` with `base: "/pf2-combat-tracker/"`.

- [ ] **Step 1: Create the package**

`packages/app/package.json`:

```json
{
  "name": "@pf2/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "immer": "^10.1.0",
    "idb": "^8.0.0",
    "@pf2/schema": "*"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^25.0.0"
  }
}
```

`packages/app/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site under the repository name.
export default defineConfig({
  base: "/pf2-combat-tracker/",
  plugins: [react()],
  publicDir: "../../data-public",
});
```

`packages/app/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "noEmit": false,
    "emitDeclarationOnly": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "../schema" }]
}
```

`packages/app/index.html`:

```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PF2 Combat Tracker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Design tokens lifted from the approved mockups**

`packages/app/src/styles/tokens.css` — copy the exact oklch values used in `mockups/Main.dc.html`:

```css
:root {
  --bg: oklch(0.16 0.012 60);
  --panel: oklch(0.175 0.012 60);
  --panel-raised: oklch(0.21 0.013 60);
  --panel-high: oklch(0.235 0.016 60);
  --border: oklch(0.30 0.015 60);
  --border-strong: oklch(0.40 0.03 55);
  --text: oklch(0.92 0.01 80);
  --text-dim: oklch(0.72 0.012 75);
  --text-faint: oklch(0.60 0.012 75);
  --accent: oklch(0.70 0.15 55);
  --accent-bg: oklch(0.27 0.030 55);
  --accent-text: oklch(0.94 0.09 65);
  --danger: oklch(0.62 0.16 28);
  --danger-bg: oklch(0.34 0.11 28);
  --ok: oklch(0.60 0.15 145);
  --ok-bg: oklch(0.28 0.08 145);
  --info: oklch(0.72 0.11 200);
  --info-bg: oklch(0.22 0.025 200);
  --cond: oklch(0.72 0.07 300);
  --cond-bg: oklch(0.32 0.07 300);
  --font-display: Spectral, Georgia, serif;
  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 14px;
}
```

`packages/app/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`packages/app/src/App.tsx`:

```tsx
export function App(): React.ReactElement {
  return <div>PF2 Combat Tracker</div>;
}
```

- [ ] **Step 3: Wire the workspace**

Add to root `package.json` scripts: `"app": "npm run dev -w @pf2/app"` and `"build:app": "npm run build -w @pf2/app"`.
Add `{ "path": "packages/app" }` to the root `tsconfig.json` references array — **append, do not rewrite the file**.

Run `npm install`.

- [ ] **Step 4: Configure vitest for the app**

Modify root `vitest.config.ts` — the `test` block gains an environment mapping so app tests run in jsdom while pipeline tests stay in node:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
    environmentMatchGlobs: [["packages/app/test/**", "jsdom"]],
  },
});
```

- [ ] **Step 5: Write the smoke test**

`packages/app/test/smoke.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

describe("App", () => {
  it("renders", () => {
    render(<App />);
    expect(screen.getByText("PF2 Combat Tracker")).toBeDefined();
  });
});
```

- [ ] **Step 6: Verify**

Run: `npx vitest run packages/app/test/smoke.test.tsx` → PASS.
Run: `npm test` → all previous 137 pipeline tests still pass.
Run: `npm run build:app` → builds without error.
Run: `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/app package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "feat(app): vite react scaffold with design tokens"
```

---

### Task 2: Locale-independent comparator and modifier stacking

**Files:**
- Create: `packages/app/src/rules/compare.ts`, `src/rules/modifiers.ts`
- Test: `packages/app/test/modifiers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `compareStrings(a: string, b: string): number` — code-unit ordering, locale-independent.
  - `type ModifierType = "status" | "circumstance" | "item" | "untyped"`
  - `interface Modifier { value: number; type: ModifierType; source: string }`
  - `interface ModifierResult { total: number; applied: Modifier[]; suppressed: Modifier[] }`
  - `resolveModifiers(mods: Modifier[]): ModifierResult`

PF2 stacking: for each of status/circumstance/item, only the **highest positive** and the **lowest negative** apply; untyped modifiers all stack. `applied` and `suppressed` exist so the UI can show an auditable ledger — the reason a GM trusts the number.

- [ ] **Step 1: Write the failing test**

`packages/app/test/modifiers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveModifiers, type Modifier } from "../src/rules/modifiers.js";
import { compareStrings } from "../src/rules/compare.js";

const m = (value: number, type: Modifier["type"], source: string): Modifier => ({
  value,
  type,
  source,
});

describe("compareStrings", () => {
  it("orders by code unit, not locale", () => {
    expect(compareStrings("Z", "a")).toBeLessThan(0);
    expect(compareStrings("a", "b")).toBeLessThan(0);
    expect(compareStrings("a", "a")).toBe(0);
  });
});

describe("resolveModifiers", () => {
  it("applies only the worst status penalty", () => {
    const r = resolveModifiers([
      m(-1, "status", "sickened 1"),
      m(-2, "status", "frightened 2"),
    ]);
    expect(r.total).toBe(-2);
    expect(r.applied.map((x) => x.source)).toEqual(["frightened 2"]);
    expect(r.suppressed.map((x) => x.source)).toEqual(["sickened 1"]);
  });

  it("applies only the best bonus of a type", () => {
    const r = resolveModifiers([
      m(1, "status", "bless"),
      m(2, "status", "heroism"),
    ]);
    expect(r.total).toBe(2);
    expect(r.applied.map((x) => x.source)).toEqual(["heroism"]);
  });

  it("keeps a bonus and a penalty of the same type", () => {
    const r = resolveModifiers([
      m(2, "status", "heroism"),
      m(-1, "status", "sickened 1"),
    ]);
    expect(r.total).toBe(1);
    expect(r.applied).toHaveLength(2);
  });

  it("stacks across different types", () => {
    const r = resolveModifiers([
      m(-2, "status", "frightened 2"),
      m(-2, "circumstance", "off-guard"),
      m(1, "item", "weapon potency"),
    ]);
    expect(r.total).toBe(-3);
  });

  it("stacks every untyped modifier", () => {
    const r = resolveModifiers([
      m(-1, "untyped", "a"),
      m(-1, "untyped", "b"),
      m(-1, "untyped", "c"),
    ]);
    expect(r.total).toBe(-3);
    expect(r.suppressed).toEqual([]);
  });

  it("returns zero for no modifiers", () => {
    expect(resolveModifiers([]).total).toBe(0);
  });

  it("orders applied deterministically by type then source", () => {
    const r = resolveModifiers([
      m(-2, "status", "zeta"),
      m(-2, "circumstance", "alpha"),
    ]);
    expect(r.applied.map((x) => x.source)).toEqual(["alpha", "zeta"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/modifiers.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/compare.ts`:

```ts
/**
 * Locale-independent ordering. `localeCompare` follows the machine's ICU
 * locale, which made the data pipeline non-deterministic across machines;
 * the same trap applies to anything the UI sorts and then persists.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
```

`packages/app/src/rules/modifiers.ts`:

```ts
import { compareStrings } from "./compare.js";

export type ModifierType = "status" | "circumstance" | "item" | "untyped";

export interface Modifier {
  value: number;
  type: ModifierType;
  source: string;
}

export interface ModifierResult {
  total: number;
  applied: Modifier[];
  suppressed: Modifier[];
}

const TYPED: ModifierType[] = ["status", "circumstance", "item"];

const order = (a: Modifier, b: Modifier): number =>
  compareStrings(a.type, b.type) || compareStrings(a.source, b.source);

/**
 * PF2 stacking: within status, circumstance and item, only the highest bonus
 * and the lowest penalty apply. Untyped modifiers all stack. `suppressed`
 * carries what was dropped so the UI can explain the number.
 */
export function resolveModifiers(mods: Modifier[]): ModifierResult {
  const applied: Modifier[] = [];
  const suppressed: Modifier[] = [];

  for (const type of TYPED) {
    const ofType = mods.filter((x) => x.type === type);
    const bonuses = ofType.filter((x) => x.value > 0);
    const penalties = ofType.filter((x) => x.value < 0);

    const best = bonuses.reduce<Modifier | null>(
      (acc, x) => (acc === null || x.value > acc.value ? x : acc),
      null,
    );
    const worst = penalties.reduce<Modifier | null>(
      (acc, x) => (acc === null || x.value < acc.value ? x : acc),
      null,
    );

    for (const x of ofType) {
      if (x === best || x === worst) applied.push(x);
      else suppressed.push(x);
    }
  }

  for (const x of mods) {
    if (x.type === "untyped" && x.value !== 0) applied.push(x);
  }

  applied.sort(order);
  suppressed.sort(order);

  return {
    total: applied.reduce((sum, x) => sum + x.value, 0),
    applied,
    suppressed,
  };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/modifiers.test.ts` → PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules packages/app/test/modifiers.test.ts
git commit -m "feat(app): pf2 modifier stacking with auditable ledger"
```

---

### Task 3: Degrees of success

**Files:**
- Create: `packages/app/src/rules/degrees.ts`
- Test: `packages/app/test/degrees.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Degree = "critical-success" | "success" | "failure" | "critical-failure"`
  - `degreeOf(total: number, dc: number, naturalRoll?: number): Degree`
  - `interface DieBand { from: number; to: number }`
  - `type DieBands = Record<Degree, DieBand | null>`
  - `dieBands(modifier: number, dc: number): DieBands` — the d20 faces producing each degree, or `null` when that degree is unreachable.

`dieBands` is the whole point of the assistant: the GM reads a face, not an
arithmetic problem. It is derived by evaluating all twenty faces through
`degreeOf` rather than by arithmetic on the DC — the natural-20 and natural-1
shifts apply to *every* degree, not just the critical band, and deriving from
the one function that knows the rules keeps the two from disagreeing.

- [ ] **Step 1: Write the failing test**

`packages/app/test/degrees.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { degreeOf, dieBands } from "../src/rules/degrees.js";

describe("degreeOf", () => {
  it("grades by margin against the DC", () => {
    expect(degreeOf(31, 21)).toBe("critical-success");
    expect(degreeOf(21, 21)).toBe("success");
    expect(degreeOf(20, 21)).toBe("failure");
    expect(degreeOf(12, 21)).toBe("failure");
    // Exactly ten below the DC is a critical failure — symmetric with the
    // ten-above rule for critical success.
    expect(degreeOf(11, 21)).toBe("critical-failure");
    expect(degreeOf(10, 21)).toBe("critical-failure");
  });

  it("raises one step on a natural 20", () => {
    expect(degreeOf(25, 21, 20)).toBe("critical-success");
    expect(degreeOf(15, 21, 20)).toBe("success");
    expect(degreeOf(5, 21, 20)).toBe("failure");
  });

  it("lowers one step on a natural 1", () => {
    expect(degreeOf(31, 21, 1)).toBe("success");
    expect(degreeOf(21, 21, 1)).toBe("failure");
    expect(degreeOf(15, 21, 1)).toBe("critical-failure");
  });

  it("cannot shift past either end of the ladder", () => {
    expect(degreeOf(60, 21, 20)).toBe("critical-success");
    expect(degreeOf(1, 21, 1)).toBe("critical-failure");
  });
});

describe("dieBands", () => {
  it("computes the Stag Lord's longsword at +14 against AC 21", () => {
    const b = dieBands(14, 21);
    expect(b["critical-success"]).toEqual({ from: 17, to: 20 });
    expect(b.success).toEqual({ from: 7, to: 16 });
    expect(b.failure).toEqual({ from: 2, to: 6 });
    expect(b["critical-failure"]).toEqual({ from: 1, to: 1 });
  });

  it("lets a natural 20 succeed where the arithmetic cannot", () => {
    // +2 vs DC 30: a natural 20 totals 22, a failure, which the nat-20 shift
    // raises to a success — but NOT to a critical success.
    const b = dieBands(2, 30);
    expect(b.success).toEqual({ from: 20, to: 20 });
    expect(b["critical-success"]).toBeNull();
    expect(b.failure).toEqual({ from: 19, to: 19 });
  });

  it("reports unreachable degrees as null", () => {
    const b = dieBands(0, 40);
    expect(b["critical-success"]).toBeNull();
    expect(b.success).toBeNull();
    expect(b.failure).toEqual({ from: 20, to: 20 });
    expect(b["critical-failure"]).toEqual({ from: 1, to: 19 });
  });

  it("lets a natural 1 fail where the arithmetic cannot", () => {
    // +50 vs DC 5: every face crits except a natural 1, which drops one step.
    const b = dieBands(50, 5);
    expect(b["critical-success"]).toEqual({ from: 2, to: 20 });
    expect(b.success).toEqual({ from: 1, to: 1 });
    expect(b.failure).toBeNull();
    expect(b["critical-failure"]).toBeNull();
  });

  it("covers all twenty faces exactly once", () => {
    const b = dieBands(7, 18);
    const covered = Object.values(b)
      .filter((x) => x !== null)
      .flatMap((x) => Array.from({ length: x!.to - x!.from + 1 }, (_, i) => x!.from + i));
    expect(covered.sort((p, q) => p - q)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/degrees.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/degrees.ts`:

```ts
export type Degree =
  | "critical-success"
  | "success"
  | "failure"
  | "critical-failure";

const LADDER: Degree[] = [
  "critical-failure",
  "failure",
  "success",
  "critical-success",
];

const shift = (degree: Degree, steps: number): Degree => {
  const i = LADDER.indexOf(degree);
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, i + steps))]!;
};

export function degreeOf(
  total: number,
  dc: number,
  naturalRoll?: number,
): Degree {
  let degree: Degree;
  if (total >= dc + 10) degree = "critical-success";
  else if (total >= dc) degree = "success";
  else if (total > dc - 10) degree = "failure";
  else degree = "critical-failure";

  if (naturalRoll === 20) degree = shift(degree, 1);
  else if (naturalRoll === 1) degree = shift(degree, -1);
  return degree;
}

export interface DieBand {
  from: number;
  to: number;
}

export type DieBands = Record<Degree, DieBand | null>;

/**
 * The d20 faces producing each degree, derived by asking `degreeOf` about all
 * twenty faces rather than by arithmetic on the DC.
 *
 * Arithmetic is where this goes wrong: the natural-20 and natural-1 shifts
 * apply to EVERY degree, not only the critical band, so a face that would
 * merely fail can succeed on a 20 and a face that would crit can drop to a
 * plain success on a 1. Deriving from the single function that encodes the
 * rules means the ladder and the bands can never disagree.
 */
export function dieBands(modifier: number, dc: number): DieBands {
  const bands: DieBands = {
    "critical-success": null,
    success: null,
    failure: null,
    "critical-failure": null,
  };

  for (let face = 1; face <= 20; face += 1) {
    const degree = degreeOf(face + modifier, dc, face);
    const held = bands[degree];
    if (held === null) bands[degree] = { from: face, to: face };
    else held.to = face;
  }

  return bands;
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/degrees.test.ts` → PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/degrees.ts packages/app/test/degrees.test.ts
git commit -m "feat(app): degrees of success and d20 face bands"
```

---

### Task 4: Multiple attack penalty and the action pool

**Files:**
- Create: `packages/app/src/rules/map.ts`, `src/rules/actions.ts`
- Test: `packages/app/test/map.test.ts`, `packages/app/test/actions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mapPenalty(strikesMade: number, agile: boolean): number` — `0 / -5 / -10`, agile `0 / -4 / -8`, never worse than the second step.
  - `mapLadder(bonus: number, agile: boolean): number[]` — the three bonuses in order.
  - `actionPool(input: { slowed: number; stunned: number; quickened: boolean }): { total: number; lost: number; reasons: string[] }`

Stunned consumes and reduces itself; slowed applies every turn. Stunned takes precedence when both are present — the rules make stunned reduce the actions and *then* slowed does nothing additional beyond what stunned already removed. Model: lose `max(slowed, stunned)` actions.

- [ ] **Step 1: Write the failing tests**

`packages/app/test/map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapLadder, mapPenalty } from "../src/rules/map.js";

describe("mapPenalty", () => {
  it("is zero for the first strike", () => {
    expect(mapPenalty(0, false)).toBe(0);
  });

  it("is -5 then -10 for a normal weapon", () => {
    expect(mapPenalty(1, false)).toBe(-5);
    expect(mapPenalty(2, false)).toBe(-10);
  });

  it("is -4 then -8 for an agile weapon", () => {
    expect(mapPenalty(1, true)).toBe(-4);
    expect(mapPenalty(2, true)).toBe(-8);
  });

  it("never worsens past the third strike", () => {
    expect(mapPenalty(3, false)).toBe(-10);
    expect(mapPenalty(9, false)).toBe(-10);
    expect(mapPenalty(9, true)).toBe(-8);
  });
});

describe("mapLadder", () => {
  it("gives the three bonuses for the Stag Lord's longsword", () => {
    expect(mapLadder(15, false)).toEqual([15, 10, 5]);
  });

  it("uses the agile steps", () => {
    expect(mapLadder(15, true)).toEqual([15, 11, 7]);
  });
});
```

`packages/app/test/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { actionPool } from "../src/rules/actions.js";

describe("actionPool", () => {
  it("is three by default", () => {
    const p = actionPool({ slowed: 0, stunned: 0, quickened: false });
    expect(p.total).toBe(3);
    expect(p.lost).toBe(0);
  });

  it("loses actions to slowed", () => {
    const p = actionPool({ slowed: 1, stunned: 0, quickened: false });
    expect(p.total).toBe(2);
    expect(p.reasons).toContain("slowed 1");
  });

  it("takes the larger of slowed and stunned, not both", () => {
    const p = actionPool({ slowed: 1, stunned: 2, quickened: false });
    expect(p.total).toBe(1);
    expect(p.lost).toBe(2);
    expect(p.reasons).toContain("stunned 2");
    expect(p.reasons).not.toContain("slowed 1");
  });

  it("adds one for quickened", () => {
    const p = actionPool({ slowed: 0, stunned: 0, quickened: true });
    expect(p.total).toBe(4);
  });

  it("never drops below zero", () => {
    const p = actionPool({ slowed: 0, stunned: 9, quickened: false });
    expect(p.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run them — expect failure**

Run: `npx vitest run packages/app/test/map.test.ts packages/app/test/actions.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/map.ts`:

```ts
export function mapPenalty(strikesMade: number, agile: boolean): number {
  const step = agile ? 4 : 5;
  if (strikesMade <= 0) return 0;
  if (strikesMade === 1) return -step;
  return -step * 2;
}

export function mapLadder(bonus: number, agile: boolean): number[] {
  return [0, 1, 2].map((n) => bonus + mapPenalty(n, agile));
}
```

`packages/app/src/rules/actions.ts`:

```ts
export interface ActionPoolInput {
  slowed: number;
  stunned: number;
  quickened: boolean;
}

export interface ActionPool {
  total: number;
  lost: number;
  reasons: string[];
}

const BASE = 3;

/**
 * Stunned and slowed do not stack — the larger removes actions and the other
 * is absorbed by it. Quickened grants one extra action.
 */
export function actionPool(input: ActionPoolInput): ActionPool {
  const reasons: string[] = [];
  const lost = Math.max(input.slowed, input.stunned, 0);

  if (lost > 0) {
    reasons.push(
      input.stunned >= input.slowed
        ? `stunned ${input.stunned}`
        : `slowed ${input.slowed}`,
    );
  }
  if (input.quickened) reasons.push("quickened");

  const total = Math.max(0, BASE + (input.quickened ? 1 : 0) - lost);
  return { total, lost, reasons };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/map.test.ts packages/app/test/actions.test.ts` → PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/map.ts packages/app/src/rules/actions.ts packages/app/test/map.test.ts packages/app/test/actions.test.ts
git commit -m "feat(app): multiple attack penalty and action pool"
```

---

### Task 5: The curated condition catalogue

**Files:**
- Create: `packages/app/src/rules/conditions.ts`
- Test: `packages/app/test/conditions.test.ts`

**Interfaces:**
- Consumes: `Modifier` (Task 2).
- Produces:
  - `type ConditionSlug` — union of the curated slugs.
  - `interface ConditionDef { slug: ConditionSlug; name: string; valued: boolean; modifiers(value: number): Modifier[]; startOfTurn?: "reduce-actions" | "recovery-check"; endOfTurn?: "decrement" | "persistent-damage"; implies?: ConditionSlug[] }`
  - `CONDITIONS: Record<ConditionSlug, ConditionDef>`
  - `interface AppliedCondition { slug: ConditionSlug; value: number }`
  - `conditionModifiers(applied: AppliedCondition[], selector: Selector): Modifier[]` where `Selector = "melee-attack" | "ranged-attack" | "ac" | "fortitude" | "reflex" | "will" | "perception" | "skill"`

The curated set for phase 1, with their mechanical effect:

| slug | valued | effect |
|---|---|---|
| off-guard | no | −2 circumstance to AC |
| frightened | yes | −N status to all checks and DCs; decrements at end of turn |
| sickened | yes | −N status to all checks and DCs |
| clumsy | yes | −N status to AC, Reflex and ranged attacks (Dex-based) |
| enfeebled | yes | −N status to melee attacks only (Str-based) |
| stupefied | yes | −N status to Will and Perception (Int/Wis/Cha-based) |
| drained | yes | −N status to Fortitude |
| slowed | yes | start of turn: lose N actions |
| stunned | yes | start of turn: lose N actions, then reduce |
| quickened | no | +1 action |
| prone | no | −2 circumstance to attack; implies off-guard |
| grabbed | no | implies off-guard, immobilized |
| restrained | no | implies off-guard, immobilized |
| immobilized | no | no modifier |
| blinded | no | no modifier; does NOT confer off-guard (mediated by visibility rules we do not model) |
| dazzled | no | no modifier in phase 1 |
| deafened | no | no modifier in phase 1 |
| fatigued | no | −1 status to AC and saves |
| doomed | yes | no modifier; lowers the dying threshold |
| dying | yes | start of turn: recovery check |
| wounded | yes | no modifier; raises dying on re-entry |
| persistent-damage | yes | end of turn: roll, then DC 15 flat |

- [ ] **Step 1: Write the failing test**

`packages/app/test/conditions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONDITIONS, conditionModifiers } from "../src/rules/conditions.js";
import { resolveModifiers } from "../src/rules/modifiers.js";

describe("condition catalogue", () => {
  it("covers the curated set", () => {
    expect(Object.keys(CONDITIONS).length).toBeGreaterThanOrEqual(20);
    expect(CONDITIONS["off-guard"].valued).toBe(false);
    expect(CONDITIONS.frightened.valued).toBe(true);
  });

  it("marks the right timing hooks", () => {
    expect(CONDITIONS.slowed.startOfTurn).toBe("reduce-actions");
    expect(CONDITIONS.dying.startOfTurn).toBe("recovery-check");
    expect(CONDITIONS.frightened.endOfTurn).toBe("decrement");
    expect(CONDITIONS["persistent-damage"].endOfTurn).toBe("persistent-damage");
    expect(CONDITIONS.sickened.endOfTurn).toBeUndefined();
  });
});

describe("conditionModifiers", () => {
  it("gives off-guard a -2 circumstance penalty to AC only", () => {
    expect(conditionModifiers([{ slug: "off-guard", value: 0 }], "ac")).toEqual([
      { value: -2, type: "circumstance", source: "off-guard" },
    ]);
    expect(conditionModifiers([{ slug: "off-guard", value: 0 }], "attack")).toEqual([]);
  });

  it("applies frightened to every check", () => {
    for (const sel of ["attack", "fortitude", "reflex", "will", "perception"] as const) {
      expect(conditionModifiers([{ slug: "frightened", value: 2 }], sel)).toEqual([
        { value: -2, type: "status", source: "frightened 2" },
      ]);
    }
  });

  it("does not let sickened and frightened stack — worst status only", () => {
    const mods = conditionModifiers(
      [
        { slug: "sickened", value: 1 },
        { slug: "frightened", value: 2 },
      ],
      "attack",
    );
    expect(resolveModifiers(mods).total).toBe(-2);
  });

  it("applies clumsy to AC and Reflex but not Will", () => {
    const c = [{ slug: "clumsy" as const, value: 2 }];
    expect(conditionModifiers(c, "ac")).toHaveLength(1);
    expect(conditionModifiers(c, "reflex")).toHaveLength(1);
    expect(conditionModifiers(c, "will")).toEqual([]);
  });

  it("applies drained to Fortitude only", () => {
    const c = [{ slug: "drained" as const, value: 1 }];
    expect(conditionModifiers(c, "fortitude")).toHaveLength(1);
    expect(conditionModifiers(c, "reflex")).toEqual([]);
  });

  it("gives prone a -2 circumstance to attack", () => {
    expect(conditionModifiers([{ slug: "prone", value: 0 }], "attack")).toEqual([
      { value: -2, type: "circumstance", source: "prone" },
    ]);
  });

  it("applies fatigued to AC and every save", () => {
    const c = [{ slug: "fatigued" as const, value: 0 }];
    expect(conditionModifiers(c, "ac")).toHaveLength(1);
    expect(conditionModifiers(c, "will")).toHaveLength(1);
    expect(conditionModifiers(c, "attack")).toEqual([]);
  });

  it("returns modifiers sorted deterministically", () => {
    const mods = conditionModifiers(
      [
        { slug: "frightened", value: 1 },
        { slug: "fatigued", value: 0 },
      ],
      "will",
    );
    expect(mods.map((m) => m.source)).toEqual(["fatigued", "frightened 1"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/conditions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/conditions.ts`:

```ts
import { compareStrings } from "./compare.js";
import type { Modifier } from "./modifiers.js";

export type Selector =
  | "attack"
  | "ac"
  | "fortitude"
  | "reflex"
  | "will"
  | "perception"
  | "skill";

export type ConditionSlug =
  | "off-guard" | "frightened" | "sickened" | "clumsy" | "enfeebled"
  | "stupefied" | "drained" | "slowed" | "stunned" | "quickened"
  | "prone" | "grabbed" | "restrained" | "immobilized" | "blinded"
  | "dazzled" | "deafened" | "fatigued" | "doomed" | "dying"
  | "wounded" | "persistent-damage";

export interface ConditionDef {
  slug: ConditionSlug;
  name: string;
  valued: boolean;
  /** Selectors this condition penalises, given its value. */
  affects: (value: number) => { selectors: Selector[]; mod: Modifier } | null;
  startOfTurn?: "reduce-actions" | "recovery-check";
  endOfTurn?: "decrement" | "persistent-damage";
  implies?: ConditionSlug[];
}

const ALL_CHECKS: Selector[] = [
  "attack", "fortitude", "reflex", "will", "perception", "skill",
];

const status = (value: number, source: string): Modifier => ({
  value: -value,
  type: "status",
  source,
});

const circumstance = (value: number, source: string): Modifier => ({
  value: -value,
  type: "circumstance",
  source,
});

const def = (d: ConditionDef): ConditionDef => d;

export const CONDITIONS: Record<ConditionSlug, ConditionDef> = {
  "off-guard": def({
    slug: "off-guard", name: "Off-Guard", valued: false,
    affects: () => ({ selectors: ["ac"], mod: circumstance(2, "off-guard") }),
  }),
  frightened: def({
    slug: "frightened", name: "Frightened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `frightened ${v}`) }),
    endOfTurn: "decrement",
  }),
  sickened: def({
    slug: "sickened", name: "Sickened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `sickened ${v}`) }),
  }),
  clumsy: def({
    slug: "clumsy", name: "Clumsy", valued: true,
    affects: (v) => ({ selectors: ["ac", "reflex"], mod: status(v, `clumsy ${v}`) }),
  }),
  enfeebled: def({
    slug: "enfeebled", name: "Enfeebled", valued: true,
    affects: (v) => ({ selectors: ["attack"], mod: status(v, `enfeebled ${v}`) }),
  }),
  stupefied: def({
    slug: "stupefied", name: "Stupefied", valued: true,
    affects: (v) => ({ selectors: ["will"], mod: status(v, `stupefied ${v}`) }),
  }),
  drained: def({
    slug: "drained", name: "Drained", valued: true,
    affects: (v) => ({ selectors: ["fortitude"], mod: status(v, `drained ${v}`) }),
  }),
  slowed: def({
    slug: "slowed", name: "Slowed", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  stunned: def({
    slug: "stunned", name: "Stunned", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  quickened: def({
    slug: "quickened", name: "Quickened", valued: false, affects: () => null,
  }),
  prone: def({
    slug: "prone", name: "Prone", valued: false,
    affects: () => ({ selectors: ["attack"], mod: circumstance(2, "prone") }),
    implies: ["off-guard"],
  }),
  grabbed: def({
    slug: "grabbed", name: "Grabbed", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  restrained: def({
    slug: "restrained", name: "Restrained", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  immobilized: def({
    slug: "immobilized", name: "Immobilized", valued: false, affects: () => null,
  }),
  blinded: def({
    slug: "blinded", name: "Blinded", valued: false, affects: () => null,
    implies: ["off-guard"],
  }),
  dazzled: def({ slug: "dazzled", name: "Dazzled", valued: false, affects: () => null }),
  deafened: def({ slug: "deafened", name: "Deafened", valued: false, affects: () => null }),
  fatigued: def({
    slug: "fatigued", name: "Fatigued", valued: false,
    affects: () => ({
      selectors: ["ac", "fortitude", "reflex", "will"],
      mod: status(1, "fatigued"),
    }),
  }),
  doomed: def({ slug: "doomed", name: "Doomed", valued: true, affects: () => null }),
  dying: def({
    slug: "dying", name: "Dying", valued: true, affects: () => null,
    startOfTurn: "recovery-check",
  }),
  wounded: def({ slug: "wounded", name: "Wounded", valued: true, affects: () => null }),
  "persistent-damage": def({
    slug: "persistent-damage", name: "Persistent Damage", valued: true,
    affects: () => null, endOfTurn: "persistent-damage",
  }),
};

export interface AppliedCondition {
  slug: ConditionSlug;
  value: number;
}

export function conditionModifiers(
  applied: AppliedCondition[],
  selector: Selector,
): Modifier[] {
  const mods: Modifier[] = [];
  for (const c of applied) {
    const effect = CONDITIONS[c.slug].affects(c.value);
    if (effect === null) continue;
    if (!effect.selectors.includes(selector)) continue;
    mods.push(effect.mod);
  }
  return mods.sort((a, b) => compareStrings(a.source, b.source));
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/conditions.test.ts` → PASS, 10 tests.
Run: `npm test` → everything green.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/conditions.ts packages/app/test/conditions.test.ts
git commit -m "feat(app): curated pf2 condition catalogue with timing hooks"
```

---

### Task 6: Strike resolution — the roll assistant's engine

**Files:**
- Create: `packages/app/src/rules/strike.ts`
- Test: `packages/app/test/strike.test.ts`

**Interfaces:**
- Consumes: `resolveModifiers` (2), `dieBands` (3), `mapPenalty` (4), `conditionModifiers` (5).
- Produces:

```ts
interface StrikeInput {
  bonus: number;                       // the creature's printed attack bonus
  agile: boolean;
  strikesMade: number;
  attackerConditions: AppliedCondition[];
  targetConditions: AppliedCondition[];
  targetAc: number;
  damage: { formula: string; type: string }[];
  precision?: { formula: string; when: ConditionSlug };  // e.g. sneak attack
}

interface StrikeOutcome {
  degree: Degree;
  dieFrom: number | null;
  dieTo: number | null;
  damage: string | null;
}

interface StrikeResolution {
  modifier: number;
  ledger: ModifierResult;
  effectiveAc: number;
  acLedger: ModifierResult;
  outcomes: StrikeOutcome[];           // crit, hit, miss, crit miss — in that order
}

resolveStrike(input: StrikeInput): StrikeResolution
```

Damage strings are built, not rolled: a critical hit doubles the dice notation (`1d8+5` → `2d8+10`), and precision damage is appended when its triggering condition is on the target.

- [ ] **Step 1: Write the failing test**

`packages/app/test/strike.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveStrike, doubleFormula } from "../src/rules/strike.js";

describe("doubleFormula", () => {
  it("doubles dice count and flat modifier", () => {
    expect(doubleFormula("1d8+5")).toBe("2d8+10");
    expect(doubleFormula("2d6")).toBe("4d6");
    expect(doubleFormula("1d4+1")).toBe("2d4+2");
  });

  it("leaves a bare number doubled", () => {
    expect(doubleFormula("7")).toBe("14");
  });
});

describe("resolveStrike", () => {
  const base = {
    bonus: 15,
    agile: false,
    strikesMade: 0,
    attackerConditions: [],
    targetConditions: [],
    targetAc: 21,
    damage: [{ formula: "1d8+5", type: "slashing" }],
  };

  it("computes the plain case", () => {
    const r = resolveStrike(base);
    expect(r.modifier).toBe(15);
    expect(r.effectiveAc).toBe(21);
    const hit = r.outcomes.find((o) => o.degree === "success")!;
    expect(hit.dieFrom).toBe(6);
    expect(hit.damage).toBe("1d8+5 slashing");
  });

  it("folds the worst status penalty into the modifier once", () => {
    const r = resolveStrike({
      ...base,
      attackerConditions: [
        { slug: "sickened", value: 1 },
        { slug: "frightened", value: 2 },
      ],
    });
    expect(r.modifier).toBe(13);
    expect(r.ledger.suppressed.map((m) => m.source)).toContain("sickened 1");
  });

  it("applies MAP", () => {
    expect(resolveStrike({ ...base, strikesMade: 1 }).modifier).toBe(10);
    expect(resolveStrike({ ...base, strikesMade: 2 }).modifier).toBe(5);
    expect(resolveStrike({ ...base, strikesMade: 1, agile: true }).modifier).toBe(11);
  });

  it("lowers the target's AC when the target is off-guard", () => {
    const r = resolveStrike({
      ...base,
      targetConditions: [{ slug: "off-guard", value: 0 }],
    });
    expect(r.effectiveAc).toBe(19);
    expect(r.outcomes.find((o) => o.degree === "success")!.dieFrom).toBe(4);
  });

  it("doubles damage on a critical hit", () => {
    const crit = resolveStrike(base).outcomes.find(
      (o) => o.degree === "critical-success",
    )!;
    expect(crit.damage).toBe("2d8+10 slashing");
  });

  it("adds precision damage only when its condition is on the target", () => {
    const withPrecision = {
      ...base,
      precision: { formula: "2d6", when: "off-guard" as const },
    };
    expect(
      resolveStrike(withPrecision).outcomes.find((o) => o.degree === "success")!
        .damage,
    ).toBe("1d8+5 slashing");

    const r = resolveStrike({
      ...withPrecision,
      targetConditions: [{ slug: "off-guard", value: 0 }],
    });
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe(
      "1d8+5 slashing + 2d6 precision",
    );
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "2d8+10 slashing + 4d6 precision",
    );
  });

  it("returns four outcomes in ladder order with no damage on misses", () => {
    const r = resolveStrike(base);
    expect(r.outcomes.map((o) => o.degree)).toEqual([
      "critical-success", "success", "failure", "critical-failure",
    ]);
    expect(r.outcomes[2]!.damage).toBeNull();
    expect(r.outcomes[3]!.damage).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/strike.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/strike.ts`:

```ts
import { conditionModifiers, type AppliedCondition, type ConditionSlug } from "./conditions.js";
import { dieBands, type Degree } from "./degrees.js";
import { mapPenalty } from "./map.js";
import { resolveModifiers, type Modifier, type ModifierResult } from "./modifiers.js";

/** `1d8+5` → `2d8+10`. Dice count and flat bonus both double on a crit. */
export function doubleFormula(formula: string): string {
  const dice = /^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/.exec(formula.trim());
  if (dice !== null) {
    const count = Number(dice[1]) * 2;
    const flat = dice[3] === undefined ? "" : `+${Number(dice[3]) * 2}`;
    return `${count}d${dice[2]}${flat}`;
  }
  const flat = /^(\d+)$/.exec(formula.trim());
  if (flat !== null) return String(Number(flat[1]) * 2);
  return `(${formula}) x2`;
}

export interface StrikeInput {
  bonus: number;
  agile: boolean;
  strikesMade: number;
  attackerConditions: AppliedCondition[];
  targetConditions: AppliedCondition[];
  targetAc: number;
  damage: { formula: string; type: string }[];
  precision?: { formula: string; when: ConditionSlug };
}

export interface StrikeOutcome {
  degree: Degree;
  dieFrom: number | null;
  dieTo: number | null;
  damage: string | null;
}

export interface StrikeResolution {
  modifier: number;
  ledger: ModifierResult;
  effectiveAc: number;
  acLedger: ModifierResult;
  outcomes: StrikeOutcome[];
}

const damageText = (
  input: StrikeInput,
  crit: boolean,
  precisionActive: boolean,
): string => {
  const parts = input.damage.map((d) =>
    `${crit ? doubleFormula(d.formula) : d.formula} ${d.type}`,
  );
  if (precisionActive && input.precision !== undefined) {
    const f = crit
      ? doubleFormula(input.precision.formula)
      : input.precision.formula;
    parts.push(`${f} precision`);
  }
  return parts.join(" + ");
};

export function resolveStrike(input: StrikeInput): StrikeResolution {
  const attackMods: Modifier[] = [
    { value: input.bonus, type: "untyped", source: "attack bonus" },
    ...conditionModifiers(input.attackerConditions, "attack"),
  ];
  const map = mapPenalty(input.strikesMade, input.agile);
  if (map !== 0) {
    attackMods.push({ value: map, type: "untyped", source: "multiple attack penalty" });
  }
  const ledger = resolveModifiers(attackMods);

  const acMods: Modifier[] = [
    { value: input.targetAc, type: "untyped", source: "target AC" },
    ...conditionModifiers(input.targetConditions, "ac"),
  ];
  const acLedger = resolveModifiers(acMods);

  const modifier = ledger.total;
  const effectiveAc = acLedger.total;
  const bands = dieBands(modifier, effectiveAc);

  const precisionActive =
    input.precision !== undefined &&
    input.targetConditions.some((c) => c.slug === input.precision!.when);

  const LADDER_ORDER: Degree[] = [
    "critical-success",
    "success",
    "failure",
    "critical-failure",
  ];

  const outcomes: StrikeOutcome[] = LADDER_ORDER.map((degree) => {
    const band = bands[degree];
    const hits = degree === "critical-success" || degree === "success";
    return {
      degree,
      dieFrom: band === null ? null : band.from,
      dieTo: band === null ? null : band.to,
      damage: hits
        ? damageText(input, degree === "critical-success", precisionActive)
        : null,
    };
  });

  return { modifier, ledger, effectiveAc, acLedger, outcomes };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/strike.test.ts` → PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/strike.ts packages/app/test/strike.test.ts
git commit -m "feat(app): strike resolution producing the outcome ladder"
```

---

### Task 7: Encounter XP

**Files:**
- Create: `packages/app/src/rules/xp.ts`
- Test: `packages/app/test/xp.test.ts`

**Interfaces:**
- Produces: `creatureXp(creatureLevel: number, partyLevel: number): number`, `encounterXp(levels: number[], partyLevel: number): number`, `partyLevelFor(presentLevels: number[]): { level: number; extraPcs: number; derivation: string }`.

Creature XP by level delta, −4…+4: 10 / 15 / 20 / 30 / 40 / 60 / 80 / 120 / 160. Outside that range, 0 below −4 and 160 above +4.

Party level per GM Core *Group Parity and Party Level*, evaluated in order: one character two or more levels above the rest → use the rest's highest and add one extra PC per 2 full levels of excess; else at most two below the top → highest; else the average.

- [ ] **Step 1: Write the failing test**

`packages/app/test/xp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { creatureXp, encounterXp, partyLevelFor } from "../src/rules/xp.js";

describe("creatureXp", () => {
  it("uses the level-delta table", () => {
    expect(creatureXp(4, 4)).toBe(40);
    expect(creatureXp(6, 4)).toBe(80);
    expect(creatureXp(0, 4)).toBe(10);
    expect(creatureXp(3, 4)).toBe(30);
    expect(creatureXp(8, 4)).toBe(160);
  });

  it("clamps beyond the table", () => {
    expect(creatureXp(-2, 4)).toBe(0);
    expect(creatureXp(20, 4)).toBe(160);
  });
});

describe("encounterXp", () => {
  it("sums the Stag Lord encounter at party level 4", () => {
    // Stag Lord 6, Akiros 3, Dovan 2, three bandits at 0
    expect(encounterXp([6, 3, 2, 0, 0, 0], 4)).toBe(160);
  });
});

describe("partyLevelFor", () => {
  it("uses the highest when at most two are behind", () => {
    expect(partyLevelFor([5, 5, 4, 4]).level).toBe(5);
  });

  it("averages when everyone differs", () => {
    expect(partyLevelFor([3, 4, 5, 6]).level).toBe(5);
  });

  it("handles one character far ahead", () => {
    const r = partyLevelFor([3, 3, 3, 7]);
    expect(r.level).toBe(3);
    expect(r.extraPcs).toBe(2);
  });

  it("explains itself", () => {
    expect(partyLevelFor([5, 5, 4, 4]).derivation).toContain("highest");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/xp.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/xp.ts`:

```ts
const XP_BY_DELTA: Record<number, number> = {
  [-4]: 10, [-3]: 15, [-2]: 20, [-1]: 30,
  0: 40, 1: 60, 2: 80, 3: 120, 4: 160,
};

export function creatureXp(creatureLevel: number, partyLevel: number): number {
  const delta = creatureLevel - partyLevel;
  if (delta < -4) return 0;
  if (delta > 4) return 160;
  return XP_BY_DELTA[delta]!;
}

export function encounterXp(levels: number[], partyLevel: number): number {
  return levels.reduce((sum, l) => sum + creatureXp(l, partyLevel), 0);
}

export interface PartyLevel {
  level: number;
  extraPcs: number;
  derivation: string;
}

/**
 * GM Core, Group Parity and Party Level. Evaluated in order — the
 * one-character-far-ahead rule takes precedence over the highest/average
 * choice, because it changes both the level AND the effective party size.
 */
export function partyLevelFor(presentLevels: number[]): PartyLevel {
  if (presentLevels.length === 0) {
    return { level: 1, extraPcs: 0, derivation: "no players present" };
  }
  const sorted = [...presentLevels].sort((a, b) => b - a);
  const top = sorted[0]!;
  const rest = sorted.slice(1);

  if (rest.length > 0) {
    const restTop = rest[0]!;
    const excess = top - restTop;
    if (excess >= 2 && rest.every((l) => top - l >= 2)) {
      const extraPcs = Math.floor(excess / 2);
      return {
        level: restTop,
        extraPcs,
        derivation: `one character ${excess} levels ahead — party level ${restTop}, counted as ${extraPcs} extra PC(s)`,
      };
    }
  }

  const behind = sorted.filter((l) => l < top).length;
  if (behind <= 2) {
    return {
      level: top,
      extraPcs: 0,
      derivation: `${behind} behind the top — using the highest level ${top}`,
    };
  }

  const average = Math.round(
    presentLevels.reduce((a, b) => a + b, 0) / presentLevels.length,
  );
  return {
    level: average,
    extraPcs: 0,
    derivation: `levels ${sorted.join("/")} — average = ${average}`,
  };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/xp.test.ts` → PASS, 7 tests.
Run: `npm test` and `npm run typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/xp.ts packages/app/test/xp.test.ts
git commit -m "feat(app): encounter xp and party level derivation"
```

---

### Task 8: Turn prompt derivation

**Files:**
- Create: `packages/app/src/rules/prompts.ts`
- Test: `packages/app/test/prompts.test.ts`

**Interfaces:**
- Consumes: `CONDITIONS`, `AppliedCondition` (5); `actionPool` (4).
- Produces:

```ts
type PromptTiming = "start" | "end";
interface Prompt {
  id: string;                 // stable: `${combatantId}:${timing}:${slug}`
  timing: PromptTiming;
  slug: ConditionSlug;
  title: string;              // "Recovery check"
  computation: string;        // "1d20 flat check vs DC 12"
  derivation: string | null;  // "DC 10 + dying 2 = 12"
  outcomes: { label: string; effect: string }[];
  autoApplied: string | null; // "Action pool 3 -> 2"
}
promptsFor(input: { combatantId: string; conditions: AppliedCondition[]; timing: PromptTiming }): Prompt[]
```

Prompt ids are stable so acknowledgement survives re-render. Note the timing split: slowed/stunned and dying are `start`; frightened and persistent damage are `end`.

- [ ] **Step 1: Write the failing test**

`packages/app/test/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { promptsFor } from "../src/rules/prompts.js";

describe("promptsFor", () => {
  it("emits a recovery check with the computed DC at the start of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "dying", value: 2 }],
      timing: "start",
    });
    expect(p!.title).toBe("Recovery check");
    expect(p!.computation).toBe("1d20 flat check vs DC 12");
    expect(p!.derivation).toBe("DC 10 + dying 2 = 12");
    expect(p!.outcomes).toHaveLength(4);
  });

  it("emits an action-loss prompt marked as already applied", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "slowed", value: 1 }],
      timing: "start",
    });
    expect(p!.title).toContain("Lose 1 action");
    expect(p!.autoApplied).toBe("Action pool 3 → 2");
  });

  it("does not emit end-of-turn conditions at the start", () => {
    expect(
      promptsFor({
        combatantId: "c1",
        conditions: [{ slug: "frightened", value: 2 }],
        timing: "start",
      }),
    ).toEqual([]);
  });

  it("emits frightened decrement at the end of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "frightened", value: 2 }],
      timing: "end",
    });
    expect(p!.computation).toBe("frightened 2 → 1");
  });

  it("emits persistent damage with its flat check at the end of turn", () => {
    const [p] = promptsFor({
      combatantId: "c1",
      conditions: [{ slug: "persistent-damage", value: 6 }],
      timing: "end",
    });
    expect(p!.computation).toContain("1d6");
    expect(p!.computation).toContain("DC 15 flat");
  });

  it("gives stable ids so acknowledgement survives re-render", () => {
    const args = {
      combatantId: "c1",
      conditions: [{ slug: "dying" as const, value: 2 }],
      timing: "start" as const,
    };
    expect(promptsFor(args)[0]!.id).toBe(promptsFor(args)[0]!.id);
    expect(promptsFor(args)[0]!.id).toBe("c1:start:dying");
  });

  it("returns prompts in a deterministic order", () => {
    const ps = promptsFor({
      combatantId: "c1",
      conditions: [
        { slug: "slowed", value: 1 },
        { slug: "dying", value: 1 },
      ],
      timing: "start",
    });
    expect(ps.map((p) => p.slug)).toEqual(["dying", "slowed"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/prompts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/app/src/rules/prompts.ts`:

```ts
import { compareStrings } from "./compare.js";
import { CONDITIONS, type AppliedCondition, type ConditionSlug } from "./conditions.js";

export type PromptTiming = "start" | "end";

export interface PromptOutcome {
  label: string;
  effect: string;
}

export interface Prompt {
  id: string;
  timing: PromptTiming;
  slug: ConditionSlug;
  title: string;
  computation: string;
  derivation: string | null;
  outcomes: PromptOutcome[];
  autoApplied: string | null;
}

export interface PromptsInput {
  combatantId: string;
  conditions: AppliedCondition[];
  timing: PromptTiming;
}

const recovery = (id: string, value: number): Prompt => {
  const dc = 10 + value;
  return {
    id, timing: "start", slug: "dying",
    title: "Recovery check",
    computation: `1d20 flat check vs DC ${dc}`,
    derivation: `DC 10 + dying ${value} = ${dc}`,
    outcomes: [
      { label: `${dc + 10}+`, effect: "critical success — dying 0, conscious" },
      { label: `${dc}–${dc + 9}`, effect: `dying ${Math.max(0, value - 1)}` },
      { label: `2–${dc - 1}`, effect: `dying ${value + 1}` },
      { label: "nat 1", effect: `dying ${value + 2}` },
    ],
    autoApplied: null,
  };
};

const actionLoss = (id: string, slug: ConditionSlug, value: number): Prompt => ({
  id, timing: "start", slug,
  title: `Lose ${value} action${value === 1 ? "" : "s"} this turn`,
  computation: `${CONDITIONS[slug].name} ${value}`,
  derivation: null,
  outcomes: [],
  autoApplied: `Action pool 3 → ${Math.max(0, 3 - value)}`,
});

export function promptsFor(input: PromptsInput): Prompt[] {
  const prompts: Prompt[] = [];

  for (const c of input.conditions) {
    const def = CONDITIONS[c.slug];
    const id = `${input.combatantId}:${input.timing}:${c.slug}`;

    if (input.timing === "start" && def.startOfTurn === "recovery-check") {
      prompts.push(recovery(id, c.value));
    }
    if (input.timing === "start" && def.startOfTurn === "reduce-actions") {
      prompts.push(actionLoss(id, c.slug, c.value));
    }
    if (input.timing === "end" && def.endOfTurn === "decrement") {
      prompts.push({
        id, timing: "end", slug: c.slug,
        title: `${def.name} decreases`,
        computation: `${def.name.toLowerCase()} ${c.value} → ${Math.max(0, c.value - 1)}`,
        derivation: null,
        outcomes: [],
        autoApplied: null,
      });
    }
    if (input.timing === "end" && def.endOfTurn === "persistent-damage") {
      prompts.push({
        id, timing: "end", slug: c.slug,
        title: "Persistent damage",
        computation: `Roll 1d${c.value}, then DC 15 flat check to end it`,
        derivation: null,
        outcomes: [
          { label: "15+", effect: "the condition ends" },
          { label: "2–14", effect: "it persists" },
        ],
        autoApplied: null,
      });
    }
  }

  return prompts.sort((a, b) => compareStrings(a.slug, b.slug));
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/prompts.test.ts` → PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/rules/prompts.ts packages/app/test/prompts.test.ts
git commit -m "feat(app): turn prompt derivation with explicit computations"
```

---

### Task 9: Data access — books, indexes, creatures

**Files:**
- Create: `packages/app/src/data/catalog.ts`, `src/data/creatures.ts`
- Create: `data-public/` symlink strategy — see Step 1
- Test: `packages/app/test/catalog.test.ts`

**Interfaces:**
- Consumes: `BookCatalogEntry`, `IndexEntry`, `Creature` from `@pf2/schema`.
- Produces:
  - `loadBooks(fetchFn?): Promise<BookCatalogEntry[]>`
  - `loadIndex(pack, fetchFn?): Promise<IndexEntry[]>`
  - `resolveCollisions(entries: IndexEntry[]): IndexEntry[]` — remaster wins on a shared slug; losers dropped from search results.
  - `searchCreatures(entries, query): IndexEntry[]`
  - `loadCreature(id, fetchFn?): Promise<Creature>` with an in-memory cache.

`fetchFn` is injected so tests never touch the network or the filesystem.

- [ ] **Step 1: Make `data/` servable**

Vite serves `publicDir` at the site root. Add to root `package.json` scripts:

```json
"predev:app": "node scripts/link-data.mjs",
"prebuild:app": "node scripts/link-data.mjs"
```

Create `scripts/link-data.mjs`:

```js
import { mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Vite's publicDir is copied verbatim into the build. The dataset lives at the
// repo root, so expose it under data-public/data without duplicating 13 MB.
const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "data-public");
const link = resolve(publicDir, "data");

mkdirSync(publicDir, { recursive: true });
if (existsSync(link)) rmSync(link, { recursive: true, force: true });
symlinkSync(resolve(root, "data"), link, "dir");
console.log("linked data/ into data-public/");
```

Add `data-public/` to `.gitignore`.

- [ ] **Step 2: Write the failing test**

`packages/app/test/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  loadBooks, loadIndex, resolveCollisions, searchCreatures,
} from "../src/data/catalog.js";
import type { IndexEntry } from "@pf2/schema";

const entry = (over: Partial<IndexEntry>): IndexEntry =>
  ({
    id: "pathfinder-bestiary/troll", slug: "troll", name: "Troll",
    level: 5, rarity: "common", size: "large", traits: [],
    ac: 19, hp: 115, remaster: false, book: "Pathfinder Bestiary",
    ...over,
  }) as IndexEntry;

const fakeFetch = (body: unknown) =>
  async (): Promise<Response> =>
    new Response(JSON.stringify(body), { status: 200 });

describe("loadBooks", () => {
  it("reads the catalog", async () => {
    const books = await loadBooks(
      fakeFetch([{ pack: "x", title: "X", license: "ORC", remaster: true, creatureCount: 1, indexPath: "index/x.json", mixed: false }]),
    );
    expect(books[0]!.pack).toBe("x");
  });
});

describe("loadIndex", () => {
  it("reads a per-book index", async () => {
    const idx = await loadIndex("pathfinder-bestiary", fakeFetch([entry({})]));
    expect(idx[0]!.name).toBe("Troll");
  });
});

describe("resolveCollisions", () => {
  it("drops the legacy entry when a remaster shares the slug", () => {
    const out = resolveCollisions([
      entry({ id: "pathfinder-bestiary/barghest", slug: "barghest", name: "Barghest", remaster: false }),
      entry({ id: "pathfinder-monster-core/barghest", slug: "barghest", name: "Barghest", remaster: true }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.remaster).toBe(true);
  });

  it("keeps both when the slugs differ", () => {
    const out = resolveCollisions([
      entry({ slug: "troll", remaster: false }),
      entry({ id: "pathfinder-monster-core/forest-troll", slug: "forest-troll", name: "Forest Troll", remaster: true }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("is order-independent", () => {
    const a = entry({ id: "a/x", slug: "x", remaster: true });
    const b = entry({ id: "b/x", slug: "x", remaster: false });
    expect(resolveCollisions([a, b])[0]!.id).toBe("a/x");
    expect(resolveCollisions([b, a])[0]!.id).toBe("a/x");
  });
});

describe("searchCreatures", () => {
  const set = [
    entry({ slug: "troll", name: "Troll" }),
    entry({ id: "x/forest-troll", slug: "forest-troll", name: "Forest Troll" }),
    entry({ id: "x/goblin-warrior", slug: "goblin-warrior", name: "Goblin Warrior" }),
  ];

  it("matches case-insensitively on name", () => {
    expect(searchCreatures(set, "TROLL").map((e) => e.slug)).toEqual([
      "forest-troll", "troll",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(searchCreatures(set, "  ")).toHaveLength(3);
  });

  it("returns results sorted by name deterministically", () => {
    expect(searchCreatures(set, "o").map((e) => e.name)).toEqual([
      "Forest Troll", "Goblin Warrior", "Troll",
    ]);
  });
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npx vitest run packages/app/test/catalog.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`packages/app/src/data/catalog.ts`:

```ts
import type { BookCatalogEntry, IndexEntry } from "@pf2/schema";
import { compareStrings } from "../rules/compare.js";

export type FetchFn = (url: string) => Promise<Response>;

const defaultFetch: FetchFn = (url) => fetch(url);

const BASE = import.meta.env.BASE_URL ?? "/";

async function getJson<T>(path: string, fetchFn: FetchFn): Promise<T> {
  const res = await fetchFn(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadBooks(fetchFn: FetchFn = defaultFetch): Promise<BookCatalogEntry[]> {
  return getJson<BookCatalogEntry[]>("books.json", fetchFn);
}

export function loadIndex(pack: string, fetchFn: FetchFn = defaultFetch): Promise<IndexEntry[]> {
  return getJson<IndexEntry[]>(`index/${pack}.json`, fetchFn);
}

/**
 * A slug present in more than one active book resolves in favour of the
 * remaster entry; the legacy one is dropped from search results but remains
 * reachable by id. Which entry wins therefore depends on the books the GM has
 * enabled, which is why this runs here and not in the pipeline.
 */
export function resolveCollisions(entries: IndexEntry[]): IndexEntry[] {
  const bySlug = new Map<string, IndexEntry>();
  for (const e of entries) {
    const held = bySlug.get(e.slug);
    if (held === undefined) {
      bySlug.set(e.slug, e);
      continue;
    }
    if (e.remaster && !held.remaster) bySlug.set(e.slug, e);
    else if (e.remaster === held.remaster && compareStrings(e.id, held.id) < 0) {
      bySlug.set(e.slug, e);
    }
  }
  return [...bySlug.values()].sort((a, b) => compareStrings(a.id, b.id));
}

export function searchCreatures(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim().toLowerCase();
  const hits = q === "" ? [...entries] : entries.filter((e) => e.name.toLowerCase().includes(q));
  return hits.sort((a, b) => compareStrings(a.name, b.name) || compareStrings(a.id, b.id));
}
```

`packages/app/src/data/creatures.ts`:

```ts
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "./catalog.js";

const cache = new Map<string, Creature>();
const BASE = import.meta.env.BASE_URL ?? "/";

export async function loadCreature(
  id: string,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<Creature> {
  const held = cache.get(id);
  if (held !== undefined) return held;

  const res = await fetchFn(`${BASE}data/creatures/${id}.json`);
  if (!res.ok) throw new Error(`failed to load creature ${id}: ${res.status}`);
  const creature = (await res.json()) as Creature;
  cache.set(id, creature);
  return creature;
}

export function clearCreatureCache(): void {
  cache.clear();
}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run packages/app/test/catalog.test.ts` → PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/data scripts/link-data.mjs package.json .gitignore packages/app/test/catalog.test.ts
git commit -m "feat(app): data access for books, indexes and creatures"
```

---

### Task 10: Encounter state model and store

**Files:**
- Create: `packages/app/src/state/types.ts`, `src/state/store.ts`
- Test: `packages/app/test/store.test.ts`

**Interfaces:**
- Consumes: `actionPool` (4), `AppliedCondition` (5), `Creature`/`IndexEntry` from `@pf2/schema`.
- Produces the store and these types:

```ts
interface Player { id: string; name: string; level: number; ac: number;
                   saves: { fortitude: number; reflex: number; will: number };
                   hp?: number; present: boolean }
interface Combatant { id: string; kind: "pc" | "creature"; name: string;
                      creatureId?: string; label?: string;
                      hp: { current: number; max: number } | null;
                      ac: number | null;
                      saves: { fortitude: number; reflex: number; will: number } | null;
                      level: number; conditions: AppliedCondition[];
                      strikesMade: number; reactionSpent: boolean; defeated: boolean }
interface Entry { id: string; initiative: number; combatantIds: string[]; groupName: string | null }
interface Encounter { name: string; round: number; activeEntryIndex: number;
                      entries: Entry[]; combatants: Record<string, Combatant>;
                      targetId: string | null;
                      acknowledgedPrompts: string[] }
```

Store actions: `addCombatants(entry, quantity, initiative)`, `applyDamage(id, amount)`, `applyHealing(id, amount)`, `addCondition(id, slug, value)`, `removeCondition(id, slug)`, `recordStrike(id)`, `resetStrikes(id)`, `setTarget(id)`, `nextTurn()`, `acknowledgePrompt(promptId)`, `setPlayers(players)`.

`nextTurn()` advances the entry pointer, wrapping to index 0 and incrementing `round`; on wrap and on each new entry it refreshes reactions, resets `strikesMade` for that entry's combatants, and clears their acknowledged prompts.

- [ ] **Step 1: Write the failing test**

`packages/app/test/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useEncounter } from "../src/state/store.js";

const reset = () => useEncounter.getState().reset();

const addCreature = (name: string, initiative: number, hp = 20): string => {
  const id = useEncounter.getState().addCombatant({
    kind: "creature", name, level: 1, ac: 15,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    hp: { current: hp, max: hp },
  }, initiative);
  return id;
};

describe("encounter store", () => {
  beforeEach(reset);

  it("orders entries by initiative descending", () => {
    addCreature("low", 5);
    addCreature("high", 20);
    expect(
      useEncounter.getState().encounter.entries.map((e) => e.initiative),
    ).toEqual([20, 5]);
  });

  it("adds N copies with numbered labels", () => {
    useEncounter.getState().addMany(
      { kind: "creature", name: "Goblin Warrior", level: 1, ac: 16,
        saves: { fortitude: 5, reflex: 8, will: 3 }, hp: { current: 6, max: 6 } },
      3, 13,
    );
    const names = Object.values(useEncounter.getState().encounter.combatants).map((c) => c.label);
    expect(names).toEqual(["1", "2", "3"]);
  });

  it("applies damage without going below zero", () => {
    const id = addCreature("x", 10, 10);
    useEncounter.getState().applyDamage(id, 4);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(6);
    useEncounter.getState().applyDamage(id, 99);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(0);
    expect(useEncounter.getState().encounter.combatants[id]!.defeated).toBe(true);
  });

  it("heals without exceeding max", () => {
    const id = addCreature("x", 10, 10);
    useEncounter.getState().applyDamage(id, 8);
    useEncounter.getState().applyHealing(id, 99);
    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(10);
  });

  it("replaces a condition value rather than duplicating it", () => {
    const id = addCreature("x", 10);
    useEncounter.getState().addCondition(id, "frightened", 1);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.conditions).toEqual([{ slug: "frightened", value: 3 }]);
  });

  it("advances turns and increments the round on wrap", () => {
    addCreature("a", 20);
    addCreature("b", 10);
    const s = () => useEncounter.getState().encounter;
    expect(s().activeEntryIndex).toBe(0);
    useEncounter.getState().nextTurn();
    expect(s().activeEntryIndex).toBe(1);
    expect(s().round).toBe(1);
    useEncounter.getState().nextTurn();
    expect(s().activeEntryIndex).toBe(0);
    expect(s().round).toBe(2);
  });

  it("resets strikes and refreshes reactions when a turn begins", () => {
    const a = addCreature("a", 20);
    addCreature("b", 10);
    useEncounter.getState().recordStrike(a);
    useEncounter.getState().setReactionSpent(a, true);
    expect(useEncounter.getState().encounter.combatants[a]!.strikesMade).toBe(1);
    useEncounter.getState().nextTurn();
    useEncounter.getState().nextTurn();
    const c = useEncounter.getState().encounter.combatants[a]!;
    expect(c.strikesMade).toBe(0);
    expect(c.reactionSpent).toBe(false);
  });

  it("keeps acknowledged prompts until that combatant's turn comes round again", () => {
    const a = addCreature("a", 20);
    addCreature("b", 10);
    useEncounter.getState().acknowledgePrompt(`${a}:start:dying`);
    expect(useEncounter.getState().encounter.acknowledgedPrompts).toContain(`${a}:start:dying`);
    useEncounter.getState().nextTurn();
    expect(useEncounter.getState().encounter.acknowledgedPrompts).toContain(`${a}:start:dying`);
    useEncounter.getState().nextTurn();
    expect(useEncounter.getState().encounter.acknowledgedPrompts).not.toContain(`${a}:start:dying`);
  });

  it("groups combatants under one entry sharing an initiative", () => {
    const a = addCreature("a", 20);
    const b = addCreature("b", 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    const entries = useEncounter.getState().encounter.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.groupName).toBe("Gate Watch");
    expect(entries[0]!.initiative).toBe(15);
    expect(entries[0]!.combatantIds).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Write `packages/app/src/state/types.ts` with exactly the interfaces listed in this task's **Interfaces** block.

`packages/app/src/state/store.ts` — a Zustand store with Immer. Key behaviours the tests above pin down:

- `addCombatant(seed, initiative)` creates a combatant with a generated id (`c1`, `c2`, … from a monotonic counter — **not** random, so state is reproducible) and its own entry; entries stay sorted by initiative descending, ties broken by insertion order.
- `addMany(seed, quantity, initiative)` creates `quantity` combatants sharing one initiative, each with `label` set to its 1-based index, each in its own entry.
- `applyDamage` clamps at 0 and sets `defeated` when it reaches 0; `applyHealing` clamps at max and clears `defeated`.
- `addCondition` replaces an existing entry with the same slug rather than appending.
- `nextTurn()` increments `activeEntryIndex`; on wrap past the end it resets to 0 and increments `round`. Whenever an entry becomes active, every combatant in it gets `strikesMade = 0` and `reactionSpent = false`, and every acknowledged prompt id prefixed with those combatant ids is dropped.
- `group(ids, name, initiative)` removes those combatants from their current entries, deletes any entry left empty, and creates one entry holding them all.
- `reset()` restores an empty encounter and resets the id counter — used by tests.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/store.test.ts` → PASS, 9 tests.
Run: `npm test` and `npm run typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/state packages/app/test/store.test.ts
git commit -m "feat(app): encounter state model and store"
```

---

### Task 11: Combatant list with hover popover

**Files:**
- Create: `packages/app/src/components/CombatantList.tsx`, `CombatantRow.tsx`, `GroupHeader.tsx`, `RowPopover.tsx`
- Test: `packages/app/test/combatant-list.test.tsx`

**Interfaces:**
- Consumes: the store (10), `conditionModifiers` (5).
- Produces: `<CombatantList />` reading the store directly; `<RowPopover combatantId />`.

Visual reference: `mockups/Main.dc.html`, left pane. Lift the exact spacing, colours and row anatomy — initiative in mono at 17px, name, HP bar with `current/max`, AC and the three saves right-aligned in mono, condition chips beneath. Group headers carry the shared initiative and a member count; members are indented behind a coloured left border. Defeated combatants render at 42% opacity with a struck-through name.

The popover opens on row hover, anchored `left: calc(100% + 10px)`, and stays open while the pointer is inside it. Implement with `onMouseEnter`/`onMouseLeave` on a wrapper that contains **both** row and popover, so moving the pointer into the popover does not close it.

The damage-type selector appears **only** when the creature has damage-type IWR, and lists only those types. Selection resets to `none` after Damage is pressed.

- [ ] **Step 1: Write the failing test**

`packages/app/test/combatant-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CombatantList } from "../src/components/CombatantList.js";
import { useEncounter } from "../src/state/store.js";

const seed = (over = {}) => ({
  kind: "creature" as const, name: "Stag Lord Bandit", level: 0, ac: 15,
  saves: { fortitude: 6, reflex: 7, will: 4 },
  hp: { current: 16, max: 16 }, ...over,
});

describe("CombatantList", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows initiative, name, HP, AC and saves", () => {
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);
    expect(screen.getByText("19")).toBeDefined();
    expect(screen.getByText("Stag Lord Bandit")).toBeDefined();
    expect(screen.getByText("16/16")).toBeDefined();
    expect(screen.getByText(/AC 15/)).toBeDefined();
    expect(screen.getByText("6 / 7 / 4")).toBeDefined();
  });

  it("renders condition chips", () => {
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<CombatantList />);
    expect(screen.getByText("FRIGHTENED 2")).toBeDefined();
  });

  it("opens the popover on hover and applies damage", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);

    await user.hover(screen.getByText("Stag Lord Bandit"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "7");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(9);
  });

  it("hides the damage-type selector when the creature has no damage-type IWR", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(seed(), 19);
    render(<CombatantList />);
    await user.hover(screen.getByText("Stag Lord Bandit"));
    expect(screen.queryByRole("group", { name: "damage type" })).toBeNull();
    expect(screen.getByText(/damage type is irrelevant/i)).toBeDefined();
  });

  it("shows only the relevant damage types when the creature has IWR", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      seed({
        name: "Skeletal Tiger Lord",
        iwr: {
          immunities: ["mental", "poison"],
          weaknesses: [],
          resistances: [{ type: "cold", value: 10 }, { type: "fire", value: 10 }],
        },
      }),
      19,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Skeletal Tiger Lord"));
    const group = screen.getByRole("group", { name: "damage type" });
    expect(group.textContent).toContain("cold");
    expect(group.textContent).toContain("fire");
    expect(group.textContent).not.toContain("bludgeoning");
  });

  it("greys out a defeated combatant", () => {
    const id = useEncounter.getState().addCombatant(seed(), 19);
    useEncounter.getState().applyDamage(id, 99);
    render(<CombatantList />);
    expect(screen.getByText("DEFEATED")).toBeDefined();
  });

  it("renders a group header with its shared initiative", () => {
    const a = useEncounter.getState().addCombatant(seed({ name: "Akiros" }), 20);
    const b = useEncounter.getState().addCombatant(seed({ name: "Dovan" }), 10);
    useEncounter.getState().group([a, b], "Gate Watch", 15);
    render(<CombatantList />);
    expect(screen.getByText("GATE WATCH")).toBeDefined();
    expect(screen.getByText("15")).toBeDefined();
    expect(screen.getByText("Akiros")).toBeDefined();
    expect(screen.getByText("Dovan")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/combatant-list.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the components**

Add an `iwr` field to the combatant seed and `Combatant` type: `{ immunities: string[]; weaknesses: {type,value}[]; resistances: {type,value}[] } | null`, populated from the creature record when one is added from the dataset.

Write a `DAMAGE_TYPES` set in `rules/damage.ts` listing the PF2 damage types, so the popover can filter a creature's IWR down to damage-relevant entries:

```ts
export const DAMAGE_TYPES = new Set([
  "bludgeoning", "piercing", "slashing",
  "acid", "cold", "electricity", "fire", "force", "sonic", "vitality", "void",
  "mental", "poison", "bleed", "precision", "spirit",
]);

export interface RelevantType { type: string; label: string }

export function relevantDamageTypes(iwr: {
  immunities: string[];
  weaknesses: { type: string; value: number }[];
  resistances: { type: string; value: number }[];
} | null): RelevantType[] { /* immunities → "IMM", weakness/resistance → its value */ }
```

Then build the components to the mockup's anatomy. Every interactive control needs an accessible name — the tests use `getByLabelText("amount")` and `getByRole("group", { name: "damage type" })`.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/combatant-list.test.tsx` → PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components packages/app/src/rules/damage.ts packages/app/test/combatant-list.test.tsx
git commit -m "feat(app): combatant list with hover damage popover"
```

---

### Task 12: Turn manager, prompts and the Next button

**Files:**
- Create: `packages/app/src/components/TurnManager.tsx`, `ActionPips.tsx`, `NextButton.tsx`, `ReactionWatch.tsx`, `TurnPrompts.tsx`, `PromptCard.tsx`
- Test: `packages/app/test/turn-manager.test.tsx`

**Interfaces:**
- Consumes: store (10), `promptsFor` (8), `actionPool` (4).
- Produces: `<TurnManager />`, `<TurnPrompts />`.

Visual reference: `mockups/Main.dc.html` right pane and `mockups/TurnAssistant.dc.html` left column.

Behaviour the tests pin:
- Round counter and action pips reflect the active combatant's pool.
- Prompts render for the active combatant, split start/end, and each carries an acknowledge control. **Acknowledging removes it from view; nothing auto-dismisses.**
- `<NextButton>` always enabled, showing the outstanding unacknowledged count when non-zero.
- `<ReactionWatch>` lists combatants with an unspent reaction and their trigger text, and **scrolls independently** — assert the scroll container exists with `overflow-y: auto`.

- [ ] **Step 1: Write the failing test**

`packages/app/test/turn-manager.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TurnManager } from "../src/components/TurnManager.js";
import { useEncounter } from "../src/state/store.js";

const add = (name: string, init: number): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 1, ac: 15,
      saves: { fortitude: 5, reflex: 5, will: 5 },
      hp: { current: 20, max: 20 } },
    init,
  );

describe("TurnManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the round and three action pips", () => {
    add("a", 20);
    render(<TurnManager />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getAllByTestId("action-pip")).toHaveLength(3);
  });

  it("reduces the pips when the active combatant is slowed", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(2);
  });

  it("renders a start-of-turn prompt with its computation", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 2);
    render(<TurnManager />);
    expect(screen.getByText("Recovery check")).toBeDefined();
    expect(screen.getByText("1d20 flat check vs DC 12")).toBeDefined();
    expect(screen.getByText("DC 10 + dying 2 = 12")).toBeDefined();
  });

  it("dismisses a prompt only on click", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getByText(/Lose 1 action/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByText(/Lose 1 action/)).toBeNull();
  });

  it("keeps Next enabled but shows the outstanding count", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 1);
    render(<TurnManager />);
    const next = screen.getByRole("button", { name: /next combatant/i });
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/1 unacknowledged/i)).toBeDefined();
  });

  it("advances the turn when Next is pressed", async () => {
    const user = userEvent.setup();
    add("a", 20);
    add("b", 10);
    render(<TurnManager />);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });

  it("scrolls the reaction list independently", () => {
    add("a", 20);
    render(<TurnManager />);
    const list = screen.getByTestId("reaction-scroll");
    expect(list.style.overflowY).toBe("auto");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/turn-manager.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Build to the mockups. Notes that matter:
- Action pips: render three (or the pool size) elements with `data-testid="action-pip"`, and those representing remaining actions additionally `data-testid="action-pip-filled"`.
- Prompt acknowledgement calls `acknowledgePrompt(prompt.id)`; a prompt whose id is in `acknowledgedPrompts` is not rendered.
- The reaction container carries `data-testid="reaction-scroll"` and inline `overflowY: "auto"` with `minHeight: 0` inside a flex column.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/turn-manager.test.tsx` → PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components packages/app/test/turn-manager.test.tsx
git commit -m "feat(app): turn manager with click-dismissed prompts"
```

---

### Task 13: Active combatant, strikes and the roll assistant

**Files:**
- Create: `packages/app/src/components/ActiveCombatant.tsx`, `StatBlockHeader.tsx`, `DefensesPanel.tsx`, `AttacksPanel.tsx`, `ActionList.tsx`, `ActionCard.tsx`, `RollAssistant.tsx`
- Test: `packages/app/test/roll-assistant.test.tsx`

**Interfaces:**
- Consumes: store (10), `resolveStrike` (6), `mapLadder` (4), `actionPool` (4).
- Produces: `<ActiveCombatant />`.

Behaviour:
- Stat block header, defences strip and action list per the mockup; limited-use actions (those with a `frequency`) sort first, then by cost, then name; unaffordable actions render `disabled` but visible.
- Each Strike row shows its MAP ladder with the applicable bonus highlighted.
- With a target selected, `<RollAssistant>` shows the modifier ledger, the roll line and the four-row outcome ladder with damage per row.
- Pressing a Strike records it (`recordStrike`), advancing the MAP.

- [ ] **Step 1: Write the failing test**

`packages/app/test/roll-assistant.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { useEncounter } from "../src/state/store.js";

const stagLord = {
  kind: "creature" as const, name: "The Stag Lord", level: 6, ac: 23,
  saves: { fortitude: 15, reflex: 16, will: 9 },
  hp: { current: 78, max: 110 },
  attacks: [
    { name: "Longsword", kind: "melee", bonus: 15, traits: [],
      damage: [{ formula: "1d8+5", type: "slashing", category: null }], effects: [] },
  ],
  actions: [
    { name: "Hunt Prey", cost: "1", traits: ["concentrate"], frequency: null,
      trigger: null, requirements: null, description: "<p>Designate prey.</p>", category: "offensive" },
    { name: "Unfair Aim", cost: "2", traits: [], frequency: null,
      trigger: null, requirements: null, description: "<p>Line up a shot.</p>", category: "offensive" },
  ],
};

const target = {
  kind: "pc" as const, name: "Valeria", level: 4, ac: 21,
  saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null,
};

describe("RollAssistant", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the MAP ladder with the first bonus active", () => {
    useEncounter.getState().addCombatant(stagLord, 19);
    render(<ActiveCombatant />);
    expect(screen.getByText("+15")).toBeDefined();
    expect(screen.getByText("+10")).toBeDefined();
    expect(screen.getByText("+5")).toBeDefined();
  });

  it("computes the outcome ladder against the selected target", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    expect(screen.getByText("1d20 + 15")).toBeDefined();
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("16");
    expect(screen.getByTestId("outcome-success").textContent).toContain("6");
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("2d8+10");
  });

  it("folds the worst status penalty into the ledger and shows what was suppressed", async () => {
    const user = userEvent.setup();
    const sid = useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    useEncounter.getState().addCondition(sid, "sickened", 1);
    useEncounter.getState().addCondition(sid, "frightened", 2);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    expect(screen.getByText("1d20 + 13")).toBeDefined();
    expect(screen.getByText(/sickened 1/)).toBeDefined();
  });

  it("disables an action the pool cannot afford but keeps it visible", () => {
    const id = useEncounter.getState().addCombatant(stagLord, 19);
    useEncounter.getState().addCondition(id, "slowed", 2);
    render(<ActiveCombatant />);
    const unfair = screen.getByRole("button", { name: /Unfair Aim/ });
    expect(unfair.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Unfair Aim")).toBeDefined();
  });

  it("advances the MAP when a strike is recorded", async () => {
    const user = userEvent.setup();
    const sid = useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    await user.click(screen.getByRole("button", { name: /record strike/i }));
    expect(useEncounter.getState().encounter.combatants[sid]!.strikesMade).toBe(1);
    expect(screen.getByText("1d20 + 10")).toBeDefined();
  });

  it("prompts for a target when none is selected", () => {
    useEncounter.getState().addCombatant(stagLord, 19);
    render(<ActiveCombatant />);
    expect(screen.getByText(/select a target/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/roll-assistant.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Build to `mockups/Main.dc.html` (centre pane) and `mockups/TurnAssistant.dc.html` (right column). Outcome rows carry `data-testid={`outcome-${degree}`}`.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/roll-assistant.test.tsx` → PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components packages/app/test/roll-assistant.test.tsx
git commit -m "feat(app): active combatant panel and roll assistant"
```

---

### Task 14: Add combatants and the party roster

**Files:**
- Create: `packages/app/src/components/AddCombatants.tsx`, `PartyManager.tsx`
- Test: `packages/app/test/add-combatants.test.tsx`

**Interfaces:**
- Consumes: `searchCreatures`, `resolveCollisions`, `loadCreature` (9); store (10).
- Produces: `<AddCombatants />`, `<PartyManager />`.

`<AddCombatants>` searches the active books' resolved index, shows each result's book and a REMASTER badge, carries a quantity stepper, and — when the encounter is running — an initiative field plus the "acts this round / next round" derivation.

`<PartyManager>` edits players: name, level, **AC, Fortitude, Reflex, Will**, present toggle. Those four numbers are what make the roll assistant work against PCs.

- [ ] **Step 1: Write the failing test**

`packages/app/test/add-combatants.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddCombatants } from "../src/components/AddCombatants.js";
import { PartyManager } from "../src/components/PartyManager.js";
import { useEncounter } from "../src/state/store.js";
import type { IndexEntry } from "@pf2/schema";

const entries: IndexEntry[] = [
  { id: "pathfinder-monster-core/goblin-warrior", slug: "goblin-warrior",
    name: "Goblin Warrior", level: -1, rarity: "common", size: "small",
    traits: ["goblin"], ac: 16, hp: 6, remaster: true, book: "Monster Core" },
  { id: "pathfinder-bestiary/troll", slug: "troll", name: "Troll", level: 5,
    rarity: "common", size: "large", traits: ["giant"], ac: 19, hp: 115,
    remaster: false, book: "Pathfinder Bestiary" },
] as IndexEntry[];

describe("AddCombatants", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("filters as the GM types", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.type(screen.getByLabelText(/search/i), "gob");
    expect(screen.getByText("Goblin Warrior")).toBeDefined();
    expect(screen.queryByText("Troll")).toBeNull();
  });

  it("shows the source book and marks remaster entries", () => {
    render(<AddCombatants entries={entries} />);
    expect(screen.getByText("Monster Core")).toBeDefined();
    expect(screen.getByText("REMASTER")).toBeDefined();
    expect(screen.getByText(/Pathfinder Bestiary/)).toBeDefined();
  });

  it("adds several at once", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    const stepper = screen.getByLabelText(/quantity/i);
    await user.clear(stepper);
    await user.type(stepper, "6");
    await user.type(screen.getByLabelText(/initiative/i), "13");
    await user.click(screen.getByRole("button", { name: /add 6/i }));
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(6);
  });
});

describe("PartyManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("captures AC and all three saves for a player", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add player/i }));
    await user.type(screen.getByLabelText(/^name/i), "Valeria");
    await user.type(screen.getByLabelText(/^level/i), "4");
    await user.type(screen.getByLabelText(/^ac/i), "21");
    await user.type(screen.getByLabelText(/fortitude/i), "10");
    await user.type(screen.getByLabelText(/reflex/i), "12");
    await user.type(screen.getByLabelText(/will/i), "9");

    const player = useEncounter.getState().players[0]!;
    expect(player).toMatchObject({
      name: "Valeria", level: 4, ac: 21,
      saves: { fortitude: 10, reflex: 12, will: 9 },
    });
  });

  it("toggles presence", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Kesten", level: 5, ac: 22,
        saves: { fortitude: 12, reflex: 9, will: 10 }, present: true },
    ]);
    render(<PartyManager />);
    await user.click(screen.getByRole("checkbox", { name: /present/i }));
    expect(useEncounter.getState().players[0]!.present).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/add-combatants.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Build to `mockups/AddCombatants.dc.html`. Every field needs an accessible label matching the queries above.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/add-combatants.test.tsx` → PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components packages/app/test/add-combatants.test.tsx
git commit -m "feat(app): add-combatants search and party roster with defences"
```

---

### Task 15: Persistence

**Files:**
- Create: `packages/app/src/state/persist.ts`
- Modify: `packages/app/src/state/store.ts` (subscribe)
- Test: `packages/app/test/persist.test.ts`

**Interfaces:**
- Produces: `saveEncounter(state)`, `loadEncounter()`, `savePlayers(players)`, `loadPlayers()`, `SCHEMA_VERSION`, `migrate(raw)`.

Two IndexedDB object stores, `encounters` and `parties`. Saves are debounced. State carries `schemaVersion`; `migrate` handles older payloads so a fight saved weeks ago still opens.

- [ ] **Step 1: Write the failing test**

`packages/app/test/persist.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, SCHEMA_VERSION } from "../src/state/persist.js";

describe("migrate", () => {
  it("passes through current-version payloads unchanged", () => {
    const payload = { schemaVersion: SCHEMA_VERSION, encounter: { round: 3 } };
    expect(migrate(payload)).toEqual(payload);
  });

  it("upgrades a version-0 payload lacking schemaVersion", () => {
    const out = migrate({ encounter: { round: 2 } });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects a payload from a future version", () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 99 })).toThrow(/newer/i);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/persist.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`persist.ts` uses `idb`'s `openDB` with `encounters` and `parties` stores keyed by a fixed id (`"current"`). `migrate(raw)` sets `schemaVersion` when absent, throws on a future version, and returns the payload. The store subscribes with a 400 ms debounce; the subscription is created in `main.tsx`, not inside the store module, so tests importing the store never touch IndexedDB.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/app/test/persist.test.ts` → PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/state/persist.ts packages/app/test/persist.test.ts
git commit -m "feat(app): indexeddb persistence with schema migration"
```

---

### Task 16: Assemble the screen and deploy

**Files:**
- Modify: `packages/app/src/App.tsx`
- Create: `packages/app/src/components/EncounterScreen.tsx`
- Create: `.github/workflows/pages.yml`
- Test: `packages/app/test/encounter-screen.test.tsx`

**Interfaces:**
- Consumes: everything.
- Produces: the three-pane screen and a GitHub Pages deployment.

- [ ] **Step 1: Write the failing test**

`packages/app/test/encounter-screen.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EncounterScreen } from "../src/components/EncounterScreen.js";
import { useEncounter } from "../src/state/store.js";

describe("EncounterScreen", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("renders all three panes", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 78, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByTestId("combatant-list")).toBeDefined();
    expect(screen.getByTestId("active-combatant")).toBeDefined();
    expect(screen.getByTestId("turn-manager")).toBeDefined();
  });

  it("shows the XP award, which does not change with party size", () => {
    useEncounter.getState().setPlayers([
      { id: "p1", name: "A", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
      { id: "p2", name: "B", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
    ]);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByText(/80/)).toBeDefined();
    expect(screen.getByText(/XP each/i)).toBeDefined();
  });

  it("runs a whole turn end to end", async () => {
    const user = userEvent.setup();
    const a = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Alpha", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      20,
    );
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      10,
    );
    render(<EncounterScreen />);

    await user.hover(screen.getByText("Alpha"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Damage" }));
    expect(useEncounter.getState().encounter.combatants[a]!.hp!.current).toBe(15);

    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run packages/app/test/encounter-screen.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the screen**

`EncounterScreen.tsx` composes the top bar (encounter name, XP award, dual difficulty placeholder, present count) and the three panes, each carrying its `data-testid`. `App.tsx` renders it. Follow `mockups/Main.dc.html` for layout and spacing.

- [ ] **Step 4: GitHub Pages workflow**

`.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build:app
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/app/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Add `.nojekyll` at the repo root — the dataset is served as static files and Jekyll's underscore rules must not interfere.

- [ ] **Step 5: Verify**

Run: `npx vitest run packages/app/test/encounter-screen.test.tsx` → PASS, 3 tests.
Run: `npm test` → everything green.
Run: `npm run typecheck` → clean.
Run: `npm run build:app` → builds; confirm `packages/app/dist/index.html` exists and `dist/data/books.json` was copied.

- [ ] **Step 6: Commit**

```bash
git add packages/app .github/workflows/pages.yml .nojekyll
git commit -m "feat(app): assemble the encounter screen and deploy to pages"
```

---

## Done

Phase 1 ends with a deployable tracker that runs one real fight: books load, creatures search and add in bulk, initiative orders them, turns advance with prompts that state their computation, damage applies from the row popover, and a Strike against a selected target resolves to the die faces to roll.
