import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareStrings } from "../src/rules/compare.js";
import { STRINGS_EN, STRINGS_FR } from "../src/i18n/index.js";

/**
 * Guardrail against a defect that has shipped before in this app's i18n
 * conversion: a component gets its copy hardcoded in English at write time,
 * the Task 11 sweep that routed every other literal through the `t()`
 * catalogue misses it, and it renders untranslated forever after — nobody
 * notices because every other string on screen looks right. The literal
 * `"of"` in `ActionPips.tsx`'s "{remaining} of {total}" line was exactly
 * this: it survived the whole French-localisation conversion and rendered
 * English regardless of the language toggle. It has since been folded into
 * the `ACTIONS_REMAINING_OF_TOTAL` catalogue key, but nothing stopped a
 * regression like it from being written again.
 *
 * This test enumerates every component under packages/app/src/components
 * (not a hardcoded list) and flags any user-visible literal — JSX text,
 * `aria-label`, `title`, `placeholder` — that isn't a value already present
 * in the catalogue (either language: a literal that happens to match French
 * copy pasted in directly is just as much a bug as one matching English).
 * It also checks, independently of the TypeScript `keyof typeof STRINGS_EN`
 * constraint on `fr.ts`, that every English key has a French counterpart at
 * runtime — belt-and-suspenders with the compile-time check, and with
 * i18n-catalogue.test.ts's "fr covers every en key" assertion, so this file
 * stays a self-contained guardrail against the whole class of defect.
 *
 * Detection is a plain regex, not an AST parse — see the false-positive
 * notes below and in the project report for what that trades away.
 */

const SRC_ROOT = resolve(process.cwd(), "packages/app/src");
const COMPONENTS_DIR = resolve(SRC_ROOT, "components");

/**
 * Deliberate exceptions: literal text that is legitimately not a catalogue
 * value. Every entry MUST carry a one-line reason — an empty or
 * unjustified entry defeats the guardrail (see store-actions-reachable.test.ts,
 * which this file is modelled on).
 */
const ALLOWLIST: Record<string, string> = {
  "&mdash;": "HTML entity for an em dash used as a bare visual separator " +
    "(EncounterScreen.tsx's XP-not-yet-available state) — a punctuation mark, not copy to translate.",
  "&minus;": "HTML entity for a minus sign used as a step-button glyph " +
    "(AddCombatants.tsx's quantity stepper) — a symbol, not copy to translate.",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * True for a candidate that is structurally never real copy in this
 * codebase: either it carries no letters at all (bare punctuation, a
 * mono-spaced numeral, a `{expr}` result), or it contains a colon. A colon
 * inside a scanned "literal" is the signature of the regex crossing two
 * adjacent TypeScript type annotations on one line (e.g.
 * `Map<string, X>, b: Array<Y>` reads, to a `>...<` scan, as the fragment
 * "b: Array") rather than an actual `>text<` false JSX text node — a check
 * of every catalogue value in en.ts and fr.ts confirms none of them
 * legitimately contains a colon, so excluding it costs nothing real.
 */
function isStructurallyNotCopy(candidate: string): boolean {
  if (!/[A-Za-z]/.test(candidate)) return true;
  if (candidate.includes(":")) return true;
  return false;
}

type Finding = { file: string; line: number; kind: string; text: string };

function findLiterals(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const stripped = stripComments(readFileSync(file, "utf8"));
    const lines = stripped.split("\n");
    lines.forEach((line, idx) => {
      // JSX text nodes: text between a tag-closing `>` and the next `<` on
      // the same line. The `(?<!=)` excludes `=>` (arrow functions), whose
      // `>` would otherwise be misread as a JSX tag close and swallow
      // whatever TypeScript syntax follows up to the next `<` (a generic's
      // opening bracket, a comparison operator) as "text". Restricting to a
      // single line (no `s`/dotall) is deliberate: a version that scanned
      // across lines matched TypeScript generics and arrow-function return
      // types throughout the file (`Promise<Creature>`, `(_, i) => i <
      // remaining`) at roughly the same rate as it matched anything real —
      // exactly the false-positive shape this project already declined a
      // guardrail over once. Every literal this codebase currently renders
      // is written on one line, so this costs no real coverage today; a
      // multi-line JSX text node added later would need a smarter check.
      const textRe = /(?<!=)>([^<>{}\n]+)</g;
      let m: RegExpExecArray | null;
      while ((m = textRe.exec(line))) {
        const text = m[1].trim();
        if (!text || isStructurallyNotCopy(text)) continue;
        findings.push({ file, line: idx + 1, kind: "JSX text", text });
      }

      // aria-label / title / placeholder, only in literal-quoted form
      // (`attr="..."` or `attr='...'`). `attr={...}` expressions (variables,
      // template literals interpolating data-driven values like a creature
      // or condition name) are deliberately out of reach here — they carry
      // no fixed English string to compare against the catalogue, and every
      // instance in this codebase already reads from data or from `t()`.
      const attrRe = /\b(aria-label|title|placeholder)=(["'])((?:(?!\2)[^\\]|\\.)*)\2/g;
      while ((m = attrRe.exec(line))) {
        const text = m[3].trim();
        if (!text || isStructurallyNotCopy(text)) continue;
        findings.push({ file, line: idx + 1, kind: m[1], text });
      }
    });
  }
  return findings;
}

const componentFiles = walk(COMPONENTS_DIR);
const catalogueValues = new Set(
  [...Object.values(STRINGS_EN), ...Object.values(STRINGS_FR)].map((v) => v.trim()),
);

describe("every component literal is in the i18n catalogue", () => {
  it("scanned a plausible number of component files", () => {
    // If this ever fails, the component tree was restructured and the walk
    // above found nothing — not because the app legitimately shrank to
    // under 10 components.
    expect(componentFiles.length).toBeGreaterThan(10);
  });

  it("has no user-visible literal outside the catalogue, or a documented allowlist reason", () => {
    const findings = findLiterals(componentFiles);
    const unmatched = findings.filter(
      (f) => !catalogueValues.has(f.text) && !(f.text in ALLOWLIST),
    );

    if (unmatched.length > 0) {
      const lines = unmatched.map(
        (f) => `  ${f.file.replace(SRC_ROOT + "/", "")}:${f.line} (${f.kind}) ${JSON.stringify(f.text)}`,
      );
      throw new Error(
        `${unmatched.length} literal(s) under packages/app/src/components are not present in ` +
          "either language's i18n catalogue (src/i18n/en.ts, src/i18n/fr.ts):\n" +
          lines.join("\n") +
          "\n\nThis is the exact shape of a defect that has already shipped once: a hardcoded " +
          'string ("of" in ActionPips.tsx) survived the whole French-localisation conversion ' +
          "and rendered untranslated regardless of the language toggle. Either add the string " +
          "to the catalogue and route it through useT()/format(), or, if it is genuinely not " +
          "translatable copy (a symbol, an HTML entity), add it to the ALLOWLIST in this file " +
          "with a one-line justification.",
      );
    }
  });

  it("documents a real reason for every allowlisted literal", () => {
    for (const [text, reason] of Object.entries(ALLOWLIST)) {
      expect(
        reason.trim().length,
        `allowlist entry for ${JSON.stringify(text)} needs a real one-line justification, not a placeholder`,
      ).toBeGreaterThan(10);
    }
  });

  it("fr covers every en key at runtime, not just at compile time", () => {
    // fr.ts is typed as Record<keyof typeof STRINGS_EN, string>, so a missing
    // key is already a compile error — this is the same assertion made at
    // runtime, so a future refactor that loosens the type doesn't silently
    // reopen the gap. Mirrors i18n-catalogue.test.ts's "fr covers every en
    // key" check; kept here too so this guardrail is self-contained.
    expect(Object.keys(STRINGS_FR).sort(compareStrings)).toEqual(
      Object.keys(STRINGS_EN).sort(compareStrings),
    );
  });
});
