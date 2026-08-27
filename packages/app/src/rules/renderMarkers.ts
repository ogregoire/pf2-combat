/**
 * Turns the three inline markers PF2E stat block text still carries —
 * `@Check[...]`, `@Damage[...]`, `@Template[...]` — into the plain text a
 * printed stat block would read, e.g. `@Check[flat|dc:15]` -> "DC 15 flat
 * check". An explicit `{label}` suffix on the marker always wins over the
 * generated text, since that's the source data's own override.
 *
 * Deliberately narrow: unknown parameters (`options`, `traits`, `name`,
 * `against`, `showDC`, `shortLabel`, ...) are ignored rather than rendered,
 * and anything this can't confidently parse — a malformed bracket, a
 * `@actor.flags...` roll-data reference standing in for a damage type, the
 * rare doubly-nested formula — is left in the output untouched, verbatim,
 * rather than silently dropped or half-rendered. That keeps a new upstream
 * marker shape diagnosable (it just shows up raw) instead of invisible.
 */

/** The marker families this renderer knows how to turn into plain text —
 * the single source for the regex below, and exported so a test can assert
 * it agrees with pf2data's `verifyI18nMarkup` allow-list
 * (packages/pf2data/src/stages/verify.ts). The two lists are hand-maintained
 * copies in different packages with nothing else tying them together; the
 * dangerous drift direction is this one narrowing while verify's stays
 * wide, since that ships raw `@Family[...]` markup to the GM's screen with
 * nothing anywhere to catch it. */
export const RENDERED_MARKER_FAMILIES = ["Check", "Damage", "Template"] as const;

const MARKER_START = new RegExp(`@(${RENDERED_MARKER_FAMILIES.join("|")})\\[`, "g");

/** Index of the bracket matching `open` (open must point at an opening
 * bracket character), or -1 if the string ends before it closes. */
function findMatchingBracket(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Splits on `sep` at bracket depth 0 only — a formula like
 * `1d6[persistent,acid],2d6[fire]` must split on the comma between the two
 * damage components, never the one inside a bracket. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function stripTypePrefix(token: string): string {
  return token.startsWith("type:") ? token.slice("type:".length) : token;
}

function titleCase(text: string): string {
  return text
    .split(/[\s-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const SAVE_TYPES = new Set(["will", "fortitude", "reflex"]);

function renderCheck(parts: string[]): string | null {
  const type = stripTypePrefix((parts[0] ?? "").trim());
  if (type === "") return null;

  let dc: number | null = null;
  let basic = false;
  for (const raw of parts.slice(1)) {
    const p = raw.trim();
    if (p === "basic" || p === "basic:true") basic = true;
    else if (p.startsWith("dc:")) {
      const n = Number(p.slice("dc:".length));
      if (!Number.isFinite(n)) return null;
      dc = n;
    }
    // options, traits, defense, name, against, showDC — ignored gracefully.
  }

  const isSave = SAVE_TYPES.has(type);
  const suffix = isSave ? "save" : "check";
  const typeLabel = isSave ? type[0]!.toUpperCase() + type.slice(1) : type === "flat" ? "flat" : titleCase(type);
  const dcPart = dc !== null ? `${basic ? "basic " : ""}DC ${dc} ` : "";
  return `${dcPart}${typeLabel} ${suffix}`;
}

function stripEnclosingParens(formula: string): string {
  return formula.startsWith("(") && formula.endsWith(")") ? formula.slice(1, -1).trim() : formula;
}

function renderDamageComponent(raw: string): string | null {
  const comp = raw.trim();
  const m = /^(.*)\[([^[\]]*)\]$/.exec(comp);
  if (!m) {
    // A bare formula with no `[type]` at all, e.g. `@Damage[2d6]`.
    if (comp === "" || comp.includes("[") || comp.includes("]")) return null;
    return stripEnclosingParens(comp);
  }
  const formula = stripEnclosingParens(m[1]!.trim());
  const bracket = m[2]!;
  if (formula.includes("[") || formula.includes("]")) return null; // doubly-nested — bail
  if (bracket.includes("@")) return null; // roll-data reference, not literal text
  const tags = bracket
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tags.length === 0) return null;
  return `${formula} ${tags.join(" ")}`.trim();
}

function renderDamage(parts: string[]): string | null {
  const formulaPart = (parts[0] ?? "").trim();
  if (formulaPart === "") return null;
  const components = splitTopLevel(formulaPart, ",");
  const rendered: string[] = [];
  for (const comp of components) {
    const r = renderDamageComponent(comp);
    if (r === null) return null;
    rendered.push(r);
  }
  return rendered.join(" plus ");
}

function renderTemplate(parts: string[]): string | null {
  const shape = stripTypePrefix((parts[0] ?? "").trim());
  if (shape === "") return null;
  let distance: number | null = null;
  for (const raw of parts.slice(1)) {
    const p = raw.trim();
    if (p.startsWith("distance:")) {
      const n = Number(p.slice("distance:".length));
      if (!Number.isFinite(n)) return null;
      distance = n;
    }
  }
  if (distance === null) return null;
  return `${distance}-foot ${shape}`;
}

export function renderMarkers(html: string): string {
  let result = "";
  let i = 0;
  MARKER_START.lastIndex = 0;

  while (i < html.length) {
    MARKER_START.lastIndex = i;
    const m = MARKER_START.exec(html);
    if (!m) {
      result += html.slice(i);
      break;
    }
    result += html.slice(i, m.index);

    const kind = m[1] as "Check" | "Damage" | "Template";
    const openBracket = m.index + m[0].length - 1;
    const closeBracket = findMatchingBracket(html, openBracket, "[", "]");
    if (closeBracket === -1) {
      // No matching close anywhere in the rest of the string — nothing more
      // to parse. Leave the remainder untouched.
      result += html.slice(m.index);
      i = html.length;
      break;
    }

    const inner = html.slice(openBracket + 1, closeBracket);
    let afterIdx = closeBracket + 1;
    let label: string | null = null;
    if (html[afterIdx] === "{") {
      const closeBrace = html.indexOf("}", afterIdx + 1);
      if (closeBrace !== -1) {
        label = html.slice(afterIdx + 1, closeBrace);
        afterIdx = closeBrace + 1;
      }
    }

    const parts = splitTopLevel(inner, "|");
    let generated: string | null;
    if (kind === "Check") generated = renderCheck(parts);
    else if (kind === "Damage") generated = renderDamage(parts);
    else generated = renderTemplate(parts);

    if (label !== null) result += label;
    else if (generated !== null) result += generated;
    else result += html.slice(m.index, afterIdx); // unparseable — leave visible

    i = afterIdx;
  }

  return result;
}
