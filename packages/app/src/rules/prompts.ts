import { actionPool } from "./actions.js";
import { compareStrings } from "./compare.js";
import { CONDITIONS, type AppliedCondition, type ConditionSlug } from "./conditions.js";
import { dieBands, type Degree, type DieBand } from "./degrees.js";

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

const RECOVERY_LADDER: Degree[] = [
  "critical-success",
  "success",
  "failure",
  "critical-failure",
];

// Dying value change per degree of success (GM Core / Player Core, Recovery
// Checks). Reducing to 0 leaves the creature stable but still unconscious —
// see the "dying" entry in data/conditions.json — so we don't claim it wakes
// up here.
const RECOVERY_EFFECT: Record<Degree, (value: number) => string> = {
  "critical-success": (value) => `dying ${Math.max(0, value - 2)}`,
  success: (value) => `dying ${Math.max(0, value - 1)}`,
  failure: (value) => `dying ${value + 1}`,
  "critical-failure": (value) => `dying ${value + 2}`,
};

const bandLabel = (band: DieBand): string =>
  band.from === band.to ? `nat ${band.from}` : `${band.from}–${band.to}`;

const recovery = (id: string, value: number): Prompt => {
  const dc = 10 + value;
  // Recovery checks are flat checks — no modifier — so the crit bands must
  // be derived from all twenty faces (dieBands), not from DC +/-10
  // arithmetic: with dc always >= 10, a hand-rolled ">= dc + 10" band is
  // never reachable on a d20 and only the natural-20 shift can crit-succeed.
  const bands = dieBands(0, dc);
  const outcomes: PromptOutcome[] = [];
  for (const degree of RECOVERY_LADDER) {
    const band = bands[degree];
    if (band === null) continue;
    outcomes.push({ label: bandLabel(band), effect: RECOVERY_EFFECT[degree](value) });
  }
  return {
    id, timing: "start", slug: "dying",
    title: "Recovery check",
    computation: `1d20 flat check vs DC ${dc}`,
    derivation: `DC 10 + dying ${value} = ${dc}`,
    outcomes,
    autoApplied: null,
  };
};

const actionLoss = (id: string, slug: ConditionSlug, value: number): Prompt => {
  const before = actionPool({ slowed: 0, stunned: 0, quickened: false }).total;
  const after = actionPool({
    slowed: slug === "slowed" ? value : 0,
    stunned: slug === "stunned" ? value : 0,
    quickened: false,
  }).total;
  return {
    id, timing: "start", slug,
    title: `Lose ${value} action${value === 1 ? "" : "s"} this turn`,
    computation: `${CONDITIONS[slug].name} ${value}`,
    derivation: null,
    outcomes: [],
    autoApplied: `Action pool ${before} → ${after}`,
  };
};

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
        computation: `Roll ${c.formula ?? "the persistent damage"}, then DC 15 flat check to end it`,
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
