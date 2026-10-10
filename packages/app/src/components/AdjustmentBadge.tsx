import { useT } from "../i18n/index.js";
import type { Combatant } from "../state/types.js";

/** "ELITE" or "WEAK" beside a creature's name, wherever the name is shown
 * with its level — the level already reads adjusted, and this says why.
 * Nothing for a normal creature. */
export function AdjustmentBadge({ combatant, size = 10 }: { combatant: Combatant; size?: number }): React.ReactElement | null {
  const t = useT();
  const kind = combatant.adjustment?.kind;
  if (kind === undefined) return null;
  const elite = kind === "elite";
  return (
    <span
      style={{
        fontSize: `${size}px`,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "1px 5px",
        borderRadius: "2px",
        alignSelf: "center",
        background: elite ? "var(--danger-bg)" : "var(--info-bg)",
        color: elite ? "var(--danger)" : "var(--info)",
      }}
    >
      {t(elite ? "ADJUSTMENT_ELITE" : "ADJUSTMENT_WEAK")}
    </span>
  );
}
