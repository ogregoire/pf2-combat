import { format } from "../i18n/format.js";
import { STRINGS_EN } from "../i18n/en.js";
import { STRINGS_FR } from "../i18n/fr.js";
import { actionPool } from "./actions.js";
import { compareStrings } from "./compare.js";
import { CONDITIONS, type AppliedCondition, type ConditionSlug } from "./conditions.js";
import { dieBands, type Degree, type DieBand } from "./degrees.js";

export type PromptTiming = "start" | "end";
export type PromptLang = "en" | "fr";

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
  /** The condition's display name for the requested `lang` — what
   * PromptCard's badge shows, so it never has to re-derive it from
   * `CONDITIONS` itself. Equal to `CONDITIONS[slug].name` in English. */
  label: string;
}

export interface PromptsInput {
  combatantId: string;
  conditions: AppliedCondition[];
  timing: PromptTiming;
}

const RECOVERY_LADDER: Degree[] = [
  "critical-success",
  "success",
  "failure",
  "critical-failure",
];

// French condition names for exactly the slugs a prompt's own text ever
// names — dying, slowed, stunned, frightened, persistent-damage (the only
// slugs with a startOfTurn/endOfTurn behaviour in rules/conditions.ts).
// Static, not fetched: this file has to stay pure (no I/O), the same reason
// `CONDITIONS` itself hardcodes its English names rather than reading
// data/conditions.json at runtime. Taken verbatim from
// data/i18n/fr/conditions.json.
const FR_CONDITION_NAMES: Partial<Record<ConditionSlug, string>> = {
  dying: "Mourant",
  slowed: "Ralenti",
  stunned: "Étourdi",
  frightened: "Effrayé",
  "persistent-damage": "Dégâts persistants",
};

function conditionName(slug: ConditionSlug, lang: PromptLang): string {
  if (lang !== "fr") return CONDITIONS[slug].name;
  return FR_CONDITION_NAMES[slug] ?? CONDITIONS[slug].name;
}

function strings(lang: PromptLang): Record<keyof typeof STRINGS_EN, string> {
  return lang === "fr" ? STRINGS_FR : STRINGS_EN;
}

// Dying value change per degree of success (GM Core / Player Core, Recovery
// Checks). Reducing to 0 leaves the creature stable but still unconscious —
// see the "dying" entry in data/conditions.json — so we don't claim it wakes
// up here.
const RECOVERY_EFFECT: Record<Degree, (value: number) => number> = {
  "critical-success": (value) => Math.max(0, value - 2),
  success: (value) => Math.max(0, value - 1),
  failure: (value) => value + 1,
  "critical-failure": (value) => value + 2,
};

const bandLabel = (band: DieBand): string =>
  band.from === band.to ? `nat ${band.from}` : `${band.from}–${band.to}`;

const recovery = (id: string, value: number, lang: PromptLang): Prompt => {
  const s = strings(lang);
  const dc = 10 + value;
  const dyingName = conditionName("dying", lang).toLowerCase();
  // Recovery checks are flat checks — no modifier — so the crit bands must
  // be derived from all twenty faces (dieBands), not from DC +/-10
  // arithmetic: with dc always >= 10, a hand-rolled ">= dc + 10" band is
  // never reachable on a d20 and only the natural-20 shift can crit-succeed.
  const bands = dieBands(0, dc);
  const outcomes: PromptOutcome[] = [];
  for (const degree of RECOVERY_LADDER) {
    const band = bands[degree];
    if (band === null) continue;
    outcomes.push({
      label: bandLabel(band),
      effect: format(s.PROMPT_NAME_VALUE, { name: dyingName, value: RECOVERY_EFFECT[degree](value) }),
    });
  }
  return {
    id, timing: "start", slug: "dying",
    title: s.PROMPT_RECOVERY_TITLE,
    computation: format(s.PROMPT_RECOVERY_COMPUTATION, { dc }),
    derivation: format(s.PROMPT_RECOVERY_DERIVATION, { name: dyingName, value, dc }),
    outcomes,
    autoApplied: null,
    label: conditionName("dying", lang),
  };
};

const actionLoss = (id: string, slug: ConditionSlug, value: number, lang: PromptLang): Prompt => {
  const s = strings(lang);
  const before = actionPool({ slowed: 0, stunned: 0, quickened: false }).total;
  const after = actionPool({
    slowed: slug === "slowed" ? value : 0,
    stunned: slug === "stunned" ? value : 0,
    quickened: false,
  }).total;
  return {
    id, timing: "start", slug,
    title: format(s.PROMPT_ACTION_LOSS_TITLE, { value, plural: value === 1 ? "" : "s" }),
    computation: format(s.PROMPT_NAME_VALUE, { name: conditionName(slug, lang), value }),
    derivation: null,
    outcomes: [],
    autoApplied: format(s.PROMPT_ACTION_POOL_AUTO_APPLIED, { before, after }),
    label: conditionName(slug, lang),
  };
};

export function promptsFor(input: PromptsInput, lang: PromptLang = "en"): Prompt[] {
  const s = strings(lang);
  const prompts: Prompt[] = [];

  for (const c of input.conditions) {
    const def = CONDITIONS[c.slug];
    const id = `${input.combatantId}:${input.timing}:${c.slug}`;
    const label = conditionName(c.slug, lang);

    if (input.timing === "start" && def.startOfTurn === "recovery-check") {
      prompts.push(recovery(id, c.value, lang));
    }
    if (input.timing === "start" && def.startOfTurn === "reduce-actions") {
      prompts.push(actionLoss(id, c.slug, c.value, lang));
    }
    if (input.timing === "end" && def.endOfTurn === "decrement") {
      prompts.push({
        id, timing: "end", slug: c.slug,
        title: format(s.PROMPT_CONDITION_DECREASES_TITLE, { name: label }),
        computation: format(s.PROMPT_NAME_DECREASE, {
          name: label.toLowerCase(),
          from: c.value,
          to: Math.max(0, c.value - 1),
        }),
        derivation: null,
        outcomes: [],
        autoApplied: null,
        label,
      });
    }
    if (input.timing === "end" && def.endOfTurn === "persistent-damage") {
      prompts.push({
        id, timing: "end", slug: c.slug,
        title: s.PROMPT_PERSISTENT_DAMAGE_TITLE,
        computation: format(s.PROMPT_PERSISTENT_DAMAGE_COMPUTATION, {
          formula: c.formula ?? s.PROMPT_PERSISTENT_DAMAGE_FORMULA_FALLBACK,
        }),
        derivation: null,
        outcomes: [
          { label: "15+", effect: s.PROMPT_PERSISTENT_DAMAGE_ENDS },
          { label: "1–14", effect: s.PROMPT_PERSISTENT_DAMAGE_CONTINUES },
        ],
        autoApplied: null,
        label,
      });
    }
  }

  return prompts.sort((a, b) => compareStrings(a.slug, b.slug));
}
