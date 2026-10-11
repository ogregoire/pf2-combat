import { modifiersFor, type ModifierSources } from "./effects.js";
import { resolveModifiers } from "./modifiers.js";
import type { DcShift } from "./renderMarkers.js";

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/**
 * How far a creature's own DCs — the ones its abilities print, "DC 28 Will
 * save" — have moved: GM Core's elite (+2) or weak (−2), and its conditions
 * and effects on "all checks and DCs" (frightened, sickened…). Null when
 * they haven't. `eliteLabel` names the step in the hover text.
 */
export function abilityDcShift(
  combatant: ModifierSources & { adjustment?: { kind: "elite" | "weak" } },
  heading: string,
  stepLabel: (kind: "elite" | "weak") => string,
): DcShift | null {
  const step = combatant.adjustment ? (combatant.adjustment.kind === "elite" ? 2 : -2) : 0;
  const mods = resolveModifiers(modifiersFor(combatant, "class-dc"));
  const value = step + mods.total;
  if (value === 0) return null;
  const lines = [
    ...(step !== 0 ? [`${signed(step)} ${stepLabel(combatant.adjustment!.kind)}`] : []),
    ...mods.applied.map((m) => `${signed(m.value)} ${m.source}`),
  ];
  return { value, hover: [`${heading} ${signed(value)}`, ...lines].join("\n") };
}

/** "DC 28" in plain prose (87 abilities write it out rather than as a
 * check marker), shifted the same way — not a flat check's. Text between
 * tags only. */
export function shiftProseDcs(html: string, shift: DcShift | null, lang: "en" | "fr", render: (dc: number) => string): string {
  if (!shift) return html;
  const label = lang === "fr" ? "DD" : "DC";
  const pattern = new RegExp(`\\b${label} (\\d+)(?! (?:flat|nu)\\b)`, "g");
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(pattern, (_m, n: string) => `${label} ${render(Number(n))}`)))
    .join("");
}
