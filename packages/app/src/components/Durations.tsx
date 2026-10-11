import { format, useT } from "../i18n/index.js";
import type { Expiry } from "../rules/conditions.js";
import { useEncounter } from "../state/store.js";
import { activeCombatantOf } from "./TurnPrompts.js";

interface Choice {
  key: string;
  label: string;
  expires: Expiry | null;
}

/**
 * The durations the GM can set on a condition or effect, counted from the
 * turn in progress — whose it is is usually what caused it: "until the end
 * of this turn", "until the start (or end) of its next turn", "for N
 * rounds" (ending as that creature's turn starts N rounds on, as PF2
 * counts them).
 */
function useChoices(): { choices: Choice[]; describe: (e: Expiry) => string } {
  const t = useT();
  const encounter = useEncounter((s) => s.encounter);
  const active = activeCombatantOf(encounter.entries, encounter.activeEntryIndex, encounter.combatants);
  const round = encounter.round;
  const nameOf = (id: string): string => encounter.combatants[id]?.name ?? "?";
  const describe = (e: Expiry): string =>
    format(t(e.at === "start" ? "EXPIRY_AT_START" : "EXPIRY_AT_END"), { name: nameOf(e.combatantId), round: e.round });
  const choices: Choice[] = [{ key: "none", label: t("EXPIRY_NONE"), expires: null }];
  if (active) {
    const name = active.name;
    const at = (r: number, when: Expiry["at"]): Expiry => ({ round: r, combatantId: active.id, at: when });
    choices.push(
      { key: "end-this", label: format(t("EXPIRY_END_THIS_TURN"), { name }), expires: at(round, "end") },
      { key: "start-next", label: format(t("EXPIRY_START_NEXT_TURN"), { name }), expires: at(round + 1, "start") },
      { key: "end-next", label: format(t("EXPIRY_END_NEXT_TURN"), { name }), expires: at(round + 1, "end") },
    );
    for (const n of [2, 3, 4, 5, 10]) {
      choices.push({ key: `rounds-${n}`, label: format(t("EXPIRY_ROUNDS"), { n }), expires: at(round + n, "start") });
    }
  }
  return { choices, describe };
}

const same = (a: Expiry | null | undefined, b: Expiry | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.round === b.round && a.at === b.at && a.combatantId === b.combatantId);

/** Picks when a condition or effect ends. Once set, it reads as when it
 * ends — "start of Rigg's turn, round 4" — whatever turn it is now. */
export function DurationSelect({
  value,
  onChange,
  label,
}: {
  value: Expiry | undefined;
  onChange: (expires: Expiry | null) => void;
  label: string;
}): React.ReactElement {
  const { choices, describe } = useChoices();
  const current = value ? choices.find((c) => same(c.expires, value)) : choices[0];
  const options = current ? choices : [{ key: "current", label: describe(value!), expires: value! }, ...choices];
  return (
    <select
      aria-label={label}
      value={current?.key ?? "current"}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(options.find((c) => c.key === e.target.value)?.expires ?? null)}
      style={{
        fontFamily: "inherit",
        fontSize: "10.5px",
        maxWidth: "150px",
        padding: "3px 2px",
        borderRadius: "3px",
        border: "1px solid var(--border-strong)",
        background: value ? "var(--info-bg)" : "var(--bg)",
        color: value ? "var(--info)" : "var(--text-dim)",
      }}
    >
      {options.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/** "Ends at the start of Rigg's turn, round 4" — for hover text. */
export function useDescribeExpiry(): (e: Expiry | undefined) => string | null {
  const { describe } = useChoices();
  return (e) => (e ? describe(e) : null);
}
