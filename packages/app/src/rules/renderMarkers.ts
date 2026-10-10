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
 *
 * The generated text follows `lang`: French text carries the very same
 * markers (about 2,000 checks, 1,600 damage rolls and 700 areas across the
 * French creature overlays), and rendering them in English left "vous
 * pouvez tenter un DC 11 flat check" in the middle of French prose. French
 * reads the way the French rulebooks print it: "test nu DD 11", "jet de
 * Volonté basique DD 20", "2d6 feu persistant", "cône de 9 m".
 */
import { damageTypeName } from "./damage.js";

type Lang = "en" | "fr";

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

const FR_SAVES: Record<string, string> = { fortitude: "Vigueur", reflex: "Réflexes", will: "Volonté" };

const FR_SKILLS: Record<string, string> = {
  acrobatics: "Acrobaties", arcana: "Arcanes", athletics: "Athlétisme", crafting: "Artisanat",
  deception: "Duperie", diplomacy: "Diplomatie", intimidation: "Intimidation", lore: "Connaissance",
  medicine: "Médecine", nature: "Nature", occultism: "Occultisme", performance: "Représentation",
  religion: "Religion", society: "Société", stealth: "Discrétion", survival: "Survie",
  thievery: "Vol", perception: "Perception",
};

/** "test de Duperie", "test d'Athlétisme" — French elides "de" before a vowel. */
function frTestOf(name: string): string {
  return /^[aeiouhéè]/i.test(name) ? `test d'${name}` : `test de ${name}`;
}

function renderCheckFr(type: string, dc: number | null, basic: boolean): string {
  const dcPart = dc !== null ? ` DD ${dc}` : "";
  if (SAVE_TYPES.has(type)) return `jet de ${FR_SAVES[type]}${basic ? " basique" : ""}${dcPart}`;
  if (type === "flat") return `test nu${dcPart}`;
  return `${frTestOf(FR_SKILLS[type] ?? titleCase(type))}${dcPart}`;
}

function renderCheck(parts: string[], lang: Lang): string | null {
  const type = stripTypePrefix((parts[0] ?? "").trim());
  if (type === "") return null;

  let dc: number | null = null;
  let basic = false;
  for (const raw of parts.slice(1)) {
    const p = raw.trim();
    if (p === "basic" || p === "basic:true") basic = true;
    else if (p.startsWith("dc:")) {
      const raw = p.slice("dc:".length);
      // A computed DC (stupefied's `resolve(5+@item.badge.value)`) has no
      // number to print; the prose around it always states it ("a DC equal
      // to 5 + your stupefied value"), so it renders as a check with no DC.
      // Anything else that isn't a number stays visible, as before.
      if (raw.startsWith("resolve(")) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      dc = n;
    }
    // options, traits, defense, name, against, showDC — ignored gracefully.
  }

  if (lang === "fr") return renderCheckFr(type, dc, basic);
  const isSave = SAVE_TYPES.has(type);
  const suffix = isSave ? "save" : "check";
  const typeLabel = isSave ? type[0]!.toUpperCase() + type.slice(1) : type === "flat" ? "flat" : titleCase(type);
  const dcPart = dc !== null ? `${basic ? "basic " : ""}DC ${dc} ` : "";
  return `${dcPart}${typeLabel} ${suffix}`;
}

function stripEnclosingParens(formula: string): string {
  return formula.startsWith("(") && formula.endsWith(")") ? formula.slice(1, -1).trim() : formula;
}

const FR_DAMAGE_CATEGORY: Record<string, string> = {
  persistent: "persistant",
  splash: "d'éclaboussure",
  precision: "de précision",
};

/** French puts the type first and the category after it — "1d6 feu
 * persistant" where English reads "1d6 persistent fire". */
function frDamageTags(tags: string[]): string {
  const types = tags.filter((t) => !(t in FR_DAMAGE_CATEGORY)).map((t) => damageTypeName(t, "fr"));
  const categories = tags.filter((t) => t in FR_DAMAGE_CATEGORY).map((t) => FR_DAMAGE_CATEGORY[t]!);
  return [...types, ...categories].join(" ");
}

function renderDamageComponent(raw: string, lang: Lang): string | null {
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
  return `${formula} ${lang === "fr" ? frDamageTags(tags) : tags.join(" ")}`.trim();
}

function renderDamage(parts: string[], lang: Lang): string | null {
  const formulaPart = (parts[0] ?? "").trim();
  if (formulaPart === "") return null;
  const components = splitTopLevel(formulaPart, ",");
  const rendered: string[] = [];
  for (const comp of components) {
    const r = renderDamageComponent(comp, lang);
    if (r === null) return null;
    rendered.push(r);
  }
  return rendered.join(" plus ");
}

const FR_SHAPES: Record<string, string> = {
  burst: "explosion", cone: "cône", line: "ligne", emanation: "émanation",
  cube: "cube", square: "carré", cylinder: "cylindre", rect: "rectangle",
};

/** Feet to the French rulebooks' metres: every 5 feet is 1,5 m. */
function frMetres(feet: number): string {
  return `${String(Math.round(feet * 0.3 * 10) / 10).replace(".", ",")} m`;
}

function renderTemplate(parts: string[], lang: Lang): string | null {
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
  if (lang === "fr") return `${FR_SHAPES[shape] ?? shape} de ${frMetres(distance)}`;
  return `${distance}-foot ${shape}`;
}

export function renderMarkers(html: string, lang: Lang = "en"): string {
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
    if (kind === "Check") generated = renderCheck(parts, lang);
    else if (kind === "Damage") generated = renderDamage(parts, lang);
    else generated = renderTemplate(parts, lang);

    if (label !== null) result += label;
    else if (generated !== null) result += generated;
    else result += html.slice(m.index, afterIdx); // unparseable — leave visible

    i = afterIdx;
  }

  return result;
}
