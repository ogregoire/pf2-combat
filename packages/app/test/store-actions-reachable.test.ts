import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { useEncounter } from "../src/state/store.js";

/**
 * Guardrail against a defect that has shipped six times in this app: a store
 * action gets written, reviewed, and merged, but no component or hook ever
 * calls it — the feature it powers is silently unreachable from the UI, and
 * every test keeps passing because tests call the store action directly
 * instead of driving the UI. Past occurrences: addCondition, setTarget,
 * setReactionSpent, group, removeCombatant, resetStrikes — each merged (or,
 * for resetStrikes, left behind by a refactor) with zero call sites under
 * packages/app/src/components or packages/app/src/hooks. Five of the six
 * were only caught by a whole-branch human review; one by chance. No test
 * caught any of them, because no test checked that the UI layer, not just
 * the store, actually reaches the action.
 *
 * This test enumerates every action the store exposes at runtime (any key
 * on the store whose value is a function) rather than a hardcoded list, so
 * a newly added action is covered automatically. For each one, it checks
 * whether the action's name is called or referenced anywhere under
 * components/ or hooks/. A plain regex is enough here (no AST parser): this
 * codebase wires every store action through the single consistent pattern
 * `const x = useEncounter((s) => s.actionName);`, so a genuinely dead
 * action's name appears, at most, once — on that declaration line — and a
 * live one is always invoked or passed on some other line too.
 */

const SRC_ROOT = resolve(process.cwd(), "packages/app/src");
const SCAN_DIRS = ["components", "hooks"];

/**
 * Deliberate exceptions to the "every action needs a UI call site" rule.
 * Every entry MUST carry a one-line reason — an empty or unjustified entry
 * defeats the guardrail (see the audit that introduced this test).
 */
const ALLOWLIST: Record<string, string> = {
  reset:
    "Test-only infrastructure: rewinds the module-level id counters and " +
    "clears both store slices between tests (see beforeEach in " +
    "test/store.test.ts and friends). The running app never resets itself " +
    "to a blank slate with fresh counters — on load it restores persisted " +
    "state instead (see restoreCombatantSequences in main.tsx).",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const scannedFiles = SCAN_DIRS.flatMap((dir) => walk(resolve(SRC_ROOT, dir)));
const uiSource = scannedFiles.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");

/** True if `name` is either invoked (`resetStrikes(id)`,
 * `useEncounter.getState().name(...)`) or passed as a bare callback
 * reference (`onConfirm={clearEnemies}`) anywhere in the scanned UI source. */
function hasUiCallSite(name: string): boolean {
  const invoked = new RegExp(`\\b${name}\\s*\\(`).test(uiSource);
  const passedAsCallback = new RegExp(`\\{\\s*${name}\\s*\\}`).test(uiSource);
  return invoked || passedAsCallback;
}

const state = useEncounter.getState();
const actionNames = Object.keys(state).filter(
  (key) => typeof (state as unknown as Record<string, unknown>)[key] === "function",
);

describe("every store action is reachable from the UI", () => {
  // If this ever fails, the enumeration below found nothing to check —
  // almost certainly because the store was restructured and the
  // "value is a function" heuristic no longer finds its actions, not
  // because the store legitimately shrank to under 10 actions.
  it("enumerated a plausible number of actions from the store", () => {
    expect(actionNames.length).toBeGreaterThan(10);
  });

  it("has a UI call site, or a documented allowlist reason, for every action", () => {
    const unreachable = actionNames
      .filter((name) => !(name in ALLOWLIST))
      .filter((name) => !hasUiCallSite(name));

    if (unreachable.length > 0) {
      throw new Error(
        `${unreachable.length} store action(s) are exported from useEncounter but have ` +
          `no call site anywhere under packages/app/src/components or ` +
          `packages/app/src/hooks: ${unreachable.join(", ")}.\n\n` +
          "This is not a style nit. It is the exact shape of a defect that has shipped " +
          "six times in this app (addCondition, setTarget, setReactionSpent, group, " +
          "removeCombatant, resetStrikes): the action is implemented, reviewed, and " +
          "covered by tests that call it directly on the store, but no component or " +
          "hook ever wires it to a real UI element — so the feature it powers is " +
          "silently unreachable by anyone using the app, and every test still passes. " +
          "Either add a real call site in a component/hook, or, if this is genuinely " +
          "test-only or otherwise deliberate, add it to the ALLOWLIST in this file " +
          "with a one-line justification.",
      );
    }
  });

  it("documents a real reason for every allowlisted action", () => {
    for (const [name, reason] of Object.entries(ALLOWLIST)) {
      expect(actionNames, `allowlisted "${name}" is not a store action anymore — remove this entry`).toContain(
        name,
      );
      expect(
        reason.trim().length,
        `allowlist entry for "${name}" needs a real one-line justification, not a placeholder`,
      ).toBeGreaterThan(10);
    }
  });
});
