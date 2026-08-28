import { z } from "zod";
import { extractRequirements, extractTrigger } from "./html.js";
import { resolveLocalize, type LangTable } from "./localize.js";
import { compareStrings } from "../util.js";
import { describeItem, itemHasType } from "./item.js";

const ActionItemSchema = z.object({
  _id: z.string(),
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
  foundryId: string;
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

export function normalizeActions(
  items: unknown[],
  lang: LangTable,
): NormalizedAction[] {
  const actions: NormalizedAction[] = [];

  for (const item of items) {
    const parsed = ActionItemSchema.safeParse(item);
    if (!parsed.success) {
      // Two very different situations share this branch. An item of another
      // TYPE (a Strike, a spell, a piece of gear) is expected here and is
      // skipped. An item that IS `type: "action"` but fails validation is
      // upstream drift, and skipping it would delete an ability from the
      // creature with no error and no report line -- a dropped array element
      // never reaches normalizePacks' `.failures`, which only collects
      // THROWN errors. So that case is made loud.
      if (itemHasType(item, "action")) {
        throw new Error(
          `action item ${describeItem(item)} failed validation: ${
            parsed.error.issues[0]?.message ?? "invalid"
          } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`,
        );
      }
      continue;
    }
    const { _id, name, system } = parsed.data;
    // Localize first, links later (in normalizeCreature): localized glossary
    // text itself contains @UUID references that must survive to be resolved.
    const html = resolveLocalize(system.description.value, lang);

    actions.push({
      foundryId: _id,
      name,
      cost: costOf(system),
      category: system.category ?? null,
      traits: [...(system.traits?.value ?? [])].sort(compareStrings),
      trigger:
        system.trigger !== null && system.trigger !== undefined && system.trigger !== ""
          ? resolveLocalize(system.trigger, lang)
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
    return compareStrings(a.name, b.name);
  });
}
