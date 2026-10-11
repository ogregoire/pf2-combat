import { Fragment } from "react";
import { formatParts, useT } from "../i18n/index.js";
import { useConditionTooltip } from "../hooks/useConditionTooltip.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { actionPool } from "../rules/actions.js";
import type { ConditionSlug } from "../rules/conditions.js";
import { conditionDisplayName } from "../rules/traitInfo.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { deltaColor } from "./deltaTone.js";

const PIP_FILLED = "var(--action)";
const PIP_EMPTY_STROKE = "var(--action-empty)";
const BASE_ACTIONS = 3;

/** Derives the action-pool input from the combatant's own conditions —
 * slowed/stunned don't stack (actionPool takes the larger), quickened adds
 * one. Matches the reviewed rules/actions.ts contract. */
function poolInputFor(combatant: Combatant): { slowed: number; stunned: number; quickened: boolean } {
  return {
    slowed: combatant.conditions.find((c) => c.slug === "slowed")?.value ?? 0,
    stunned: combatant.conditions.find((c) => c.slug === "stunned")?.value ?? 0,
    quickened: combatant.conditions.some((c) => c.slug === "quickened"),
  };
}

/** The three (or more, if quickened) action-economy pips — Main.dc.html's
 * "ACTIONS REMAINING" block, laid out as one row in the centre pane's turn
 * strip (TurnEconomy), beside the actions they are spent on. Pip count is
 * the greater of the base 3 and the pool total, so a reduced pool still
 * shows the lost pips as empty rather than shrinking the row. */
export function ActionPips({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const tooltip = useConditionTooltip();
  const input = poolInputFor(combatant);
  const pool = actionPool(input);
  // What changed the pool, named in the display language and hoverable:
  // the larger of slowed and stunned (they don't stack), and quickened.
  const reasons: { slug: ConditionSlug; value: number | null }[] = [];
  if (pool.lost > 0) reasons.push(input.stunned >= input.slowed ? { slug: "stunned", value: input.stunned } : { slug: "slowed", value: input.slowed });
  if (input.quickened) reasons.push({ slug: "quickened", value: null });
  const remaining = Math.max(0, pool.total - combatant.actionsSpent);
  const pipCount = Math.max(BASE_ACTIONS, pool.total);
  const pips = Array.from({ length: pipCount }, (_, i) => i < remaining);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>
        {t("ACTIONS_REMAINING_HEADING")}
      </div>
      <div style={{ display: "flex", gap: "5px" }}>
        {pips.map((filled, i) => (
          <span key={i} data-testid="action-pip">
            {filled ? (
              <svg data-testid="action-pip-filled" width="22" height="22" viewBox="0 0 12 12">
                <path d="M6 0.6 11.4 6 6 11.4 0.6 6Z" fill={PIP_FILLED} />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 12 12">
                <path d="M6 0.6 11.4 6 6 11.4 0.6 6Z" fill="none" stroke={PIP_EMPTY_STROKE} strokeWidth="1.1" />
              </svg>
            )}
          </span>
        ))}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
        {reasons.length > 0
          ? formatParts(t("ACTIONS_REMAINING_OF_TOTAL"), {
              remaining: String(remaining),
              // The turn's total against the usual 3: green above, red below.
              total: (
                <span key="total" style={{ color: deltaColor(pool.total - BASE_ACTIONS), fontWeight: 600 }}>
                  {pool.total}
                </span>
              ),
              reasons: (
                <Fragment key="reasons">
                  {reasons.map((r, i) => (
                    <Fragment key={r.slug}>
                      {i > 0 && ", "}
                      <span title={tooltip(r.slug, r.value)} style={{ cursor: "help" }}>
                        {conditionDisplayName(r.slug, glossary, lang).toLowerCase()}
                        {r.value !== null ? ` ${r.value}` : ""}
                      </span>
                    </Fragment>
                  ))}
                </Fragment>
              ),
            })
          : `${remaining} ${t("ACTIONS_UNIT")}`}
      </div>
    </div>
  );
}
