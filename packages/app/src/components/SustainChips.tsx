import { useSustainedName } from "../hooks/useSustainedName.js";
import { format, useT } from "../i18n/index.js";
import type { Combatant } from "../state/types.js";

/** A row's concentration, named with its cause — "Sustaining Enthrall" —
 * so the GM sees who is holding a spell up whoever's turn it is. */
export function SustainChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const t = useT();
  const nameOf = useSustainedName(combatant);
  const effects = combatant.sustaining ?? [];
  if (effects.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "3px" }}>
      {effects.map((e) => (
        <span
          key={e.id}
          data-testid="sustain-chip"
          style={{
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "2px",
            background: "var(--info-bg)",
            color: "var(--info)",
            border: "1px solid var(--info-border)",
          }}
        >
          {format(t("SUSTAINING_CHIP"), { effect: nameOf(e) })}
        </span>
      ))}
    </div>
  );
}
