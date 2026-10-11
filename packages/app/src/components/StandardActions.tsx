import { useState } from "react";
import type { FetchFn } from "../data/catalog.js";
import { useStandardActions, type StandardActionItem } from "../hooks/useStandardActions.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { useT, type StringKey } from "../i18n/index.js";
import { canDelayOrReady, canReact } from "../rules/conditions.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { ActionCard } from "./ActionCard.js";
import { FoldHeading } from "./FoldHeading.js";
import { remainingActionsFor } from "./TurnManager.js";

/**
 * PF2's standard actions — the basic actions anyone can take (Stride, Step,
 * Raise a Shield, ...) and the encounter skill actions (Shove, Trip,
 * Demoralize, ...) — above the active combatant's own abilities, folded to
 * a single line so they don't push those down. Folded by default, and every action in it folded too: the GM knows these by name,
 * so each card shows its Use button while folded, spending the action (or
 * the reaction) straight away; unfolding a card is only for its rules text.
 * Folds again whenever the turn passes to someone else.
 */
export function StandardActions({ combatant, fetchFn }: { combatant: Combatant; fetchFn?: FetchFn }): React.ReactElement | null {
  const t = useT();
  const { basic, skill } = useStandardActions(fetchFn);
  const glossary = useTraitGlossary(fetchFn);
  const spendActions = useEncounter((s) => s.spendActions);
  const recordStrike = useEncounter((s) => s.recordStrike);
  const addEffect = useEncounter((s) => s.addEffect);
  const round = useEncounter((s) => s.encounter.round);
  const setReactionSpent = useEncounter((s) => s.setReactionSpent);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [turnOf, setTurnOf] = useState(combatant.id);
  if (turnOf !== combatant.id) {
    setTurnOf(combatant.id);
    setOpen(false);
    setExpanded(null);
  }
  if (basic.length + skill.length === 0) return null;

  const remaining = remainingActionsFor(combatant);

  const card = ({ slug, action }: StandardActionItem): React.ReactElement => {
    const key = slug;
    const n = action.cost === "1" || action.cost === "2" || action.cost === "3" ? Number(action.cost) : 0;
    // Confused and Fleeing forbid Ready; Confused (and anything that can't
    // act) forbids every reaction.
    const forbidden = slug === "ready" && !canDelayOrReady(combatant.conditions);
    const spec =
      action.cost === "reaction"
        ? { disabled: combatant.reactionSpent || !canReact(combatant.conditions), onUse: () => setReactionSpent(combatant.id, true) }
        : n > 0
          ? {
              disabled: forbidden || n > remaining,
              onUse: () => {
                spendActions(combatant.id, n);
                // An attack (Trip, Grapple, Shove…) counts toward the
                // multiple attack penalty like a Strike.
                if (action.traits.includes("attack")) recordStrike(combatant.id);
                // Raise a Shield and Take Cover put their AC bonus on.
                if (slug === "raise-a-shield") {
                  addEffect(combatant.id, {
                    label: t("EFFECT_RAISED_SHIELD"), value: 2, type: "circumstance", targets: ["ac"],
                    expires: { round: round + 1, combatantId: combatant.id, at: "start" },
                  });
                }
                if (slug === "take-cover") addEffect(combatant.id, { label: t("EFFECT_COVER"), value: 2, type: "circumstance", targets: ["ac"] });
              },
            }
          : { disabled: false, onUse: undefined };
    return (
      <ActionCard
        key={key}
        action={action}
        disabled={spec.disabled}
        selected={expanded === key}
        onSelect={() => setExpanded((prev) => (prev === key ? null : key))}
        onUse={spec.onUse}
        useWhileCollapsed
        glossary={glossary}
      />
    );
  };

  const group = (labelKey: StringKey, items: StandardActionItem[]): React.ReactElement => (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)", marginTop: "4px" }}>{t(labelKey)}</div>
      {items.map(card)}
    </div>
  );

  return (
    <div data-testid="standard-actions">
      <FoldHeading label={t("STANDARD_ACTIONS_HEADING")} open={open} onToggle={() => setOpen((o) => !o)} count={basic.length + skill.length} />
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" }}>
          {basic.length > 0 && group("STANDARD_ACTIONS_BASIC", basic)}
          {skill.length > 0 && group("STANDARD_ACTIONS_SKILL", skill)}
        </div>
      )}
    </div>
  );
}
