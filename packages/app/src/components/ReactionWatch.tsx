import { resolveActions, resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useEncounter } from "../state/store.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { compareStrings } from "../rules/compare.js";
import type { Combatant } from "../state/types.js";

/** One combatant's card in the reaction watch: name and reaction name(s)
 * resolved to French exactly like everywhere else — via `creatureId`, at
 * render, never trusted from `combatant.i18n` alone (see
 * `useCombatantI18n`). Reaction names are a positional subset of
 * `combatant.actions` (Task 6's alignment guarantee), so they're resolved
 * the same way ActionList resolves the full action list and then filtered
 * down to the reaction-cost entries, never matched by name. Trigger text
 * has no French counterpart in `CreatureI18n` at all — that's a data gap,
 * not a wiring one — so it stays in English regardless of `lang`. */
function ReadyCombatantCard({
  combatant,
  onSpend,
  t,
}: {
  combatant: Combatant;
  onSpend: () => void;
  t: (key: StringKey) => string;
}): React.ReactElement {
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const displayName = resolveCreatureName(combatant.name, i18n, lang);
  const reactionNames = resolveActions(combatant.actions, i18n, lang)
    .filter((a) => a.cost === "reaction")
    .map((a) => a.name);

  return (
    <div
      style={{
        padding: "9px 10px",
        borderRadius: "4px",
        background: "var(--panel-raised)",
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{displayName}</span>
        <div style={{ flexGrow: 1 }} />
        <button
          type="button"
          onClick={onSpend}
          style={{
            fontFamily: "inherit",
            fontSize: "10.5px",
            padding: "2px 7px",
            borderRadius: "3px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--text-dim)",
            cursor: "pointer",
          }}
        >
          {t("SPENT_BUTTON")}
        </button>
      </div>
      {combatant.reactions.map((r, index) => (
        <div key={r.name}>
          <div style={{ fontSize: "12px", color: "var(--info)", marginTop: "2px" }}>
            {reactionNames[index] ?? r.name}
          </div>
          {r.trigger && (
            <div style={{ fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-faint)", marginTop: "4px" }}>
              <span style={{ fontWeight: 600 }}>{t("TRIGGER_LABEL")}</span> {r.trigger}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Main.dc.html's "REACTIONS READY" list — every non-defeated combatant who
 * hasn't spent their reaction yet, so the GM can see who might interrupt.
 * The mockup pairs each entry with the reaction's name and trigger text;
 * `Combatant.reactions` (denormalised from the creature record, same as
 * `iwr`) carries that. A reaction with no trigger text shows its name alone
 * rather than inventing a trigger; a combatant with no known reactions at
 * all has nothing to watch for, so it's excluded rather than listed with
 * nothing under its name — `setReactionSpent` previously had no call site,
 * so this list also never shrank when a reaction was actually used.
 *
 * A combatant whose entry is Delayed is excluded outright: RAW (Player Core
 * p. 416) "You can't use reactions until you return to the initiative
 * order", so listing them under REACTIONS READY would be telling the GM the
 * opposite of the rule at exactly the moment they're deciding whether an
 * interrupt is available.
 *
 * The list scrolls independently of the round/pips/Next controls above it:
 * this container is the flex child that grows and gets `overflow-y: auto`,
 * while everything else in the panel has `flexShrink: 0` and stays put. */
export function ReactionWatch(): React.ReactElement {
  const t = useT();
  const combatants = useEncounter((s) => s.encounter.combatants);
  const entries = useEncounter((s) => s.encounter.entries);
  const setReactionSpent = useEncounter((s) => s.setReactionSpent);
  // Delay is a property of the *entry*, so a group that Delays takes every
  // one of its members' reactions with it.
  const delayedIds = new Set(entries.filter((e) => e.delayed).flatMap((e) => e.combatantIds));
  const ready = Object.values(combatants)
    .filter((c) => !c.defeated && !c.reactionSpent && !delayedIds.has(c.id) && c.reactions.length > 0)
    .sort((a, b) => compareStrings(a.name, b.name));

  return (
    <div
      style={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid var(--border)",
        paddingTop: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "9px", flexShrink: 0 }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--info)" }}>{t("REACTIONS_READY_HEADING")}</span>
        <div style={{ flexGrow: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
          {format(t("READY_COUNT"), { n: ready.length })}
        </span>
      </div>

      <div
        data-testid="reaction-scroll"
        style={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "7px",
          paddingRight: "4px",
        }}
      >
        {ready.map((c) => (
          <ReadyCombatantCard key={c.id} combatant={c} onSpend={() => setReactionSpent(c.id, true)} t={t} />
        ))}
      </div>
    </div>
  );
}
