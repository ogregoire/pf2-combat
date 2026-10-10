import { resolveActions, resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { useEncounter } from "../state/store.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { compareStrings } from "../rules/compare.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import type { FetchFn } from "../data/catalog.js";
import type { Combatant } from "../state/types.js";

/** One combatant's card in the reaction watch: name and reaction name(s)
 * resolved to French exactly like everywhere else — via `creatureId`, at
 * render, never trusted from `combatant.i18n` alone (see
 * `useCombatantI18n`). Reaction names AND trigger text are a positional
 * subset of `combatant.actions` (Task 6's alignment guarantee), so they're
 * resolved the same way ActionList resolves the full action list and then
 * filtered down to the reaction-cost entries, never matched by name. Task 1
 * (French follow-ups) extracts a French trigger from 537 creatures'
 * `<strong>Déclencheur</strong>` paragraphs (`extractTriggerFr`), carried
 * here via `resolveActions`; a reaction the overlay doesn't cover falls
 * back to `combatant.reactions[index].trigger`, the English text baked in
 * at add time (`toReactions` in data/seed.ts) -- same "French, else
 * English, never blank" rule `pick` uses everywhere else. */
function ReadyCombatantCard({
  combatant,
  onSpend,
  t,
  glossary,
}: {
  combatant: Combatant;
  onSpend: () => void;
  t: (key: StringKey) => string;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const displayName = resolveCreatureName(combatant.name, i18n, lang);
  const reactions = resolveActions(combatant.actions, i18n, lang, glossary).filter(
    (a) => a.cost === "reaction",
  );
  const reactionNames = reactions.map((a) => a.name);
  const reactionTriggers = reactions.map((a) => a.trigger);

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
      {combatant.reactions.map((r, index) => {
        const trigger = reactionTriggers[index] ?? r.trigger;
        return (
          <div key={r.name}>
            <div style={{ fontSize: "12px", color: "var(--info)", marginTop: "2px" }}>
              {reactionNames[index] ?? r.name}
            </div>
            {trigger && (
              <div style={{ fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-faint)", marginTop: "4px" }}>
                <span style={{ fontWeight: 600 }}>{t("TRIGGER_LABEL")}</span> {trigger}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A player who still has a reaction this round: the name alone — the GM
 * doesn't track which reactions the players have, only whether each has
 * used theirs. The whole row is the control: clicking it spends the
 * reaction, which takes the player off the list until their next turn. */
function ReadyPlayerRow({ combatant, onSpend }: { combatant: Combatant; onSpend: () => void }): React.ReactElement {
  const t = useT();
  const label = format(t("PLAYER_REACTION_SPEND_ARIA"), { name: combatant.name });
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onSpend}
      style={{
        fontFamily: "inherit",
        textAlign: "left",
        fontSize: "12.5px",
        fontWeight: 600,
        color: "var(--text)",
        padding: "7px 10px",
        borderRadius: "4px",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--pc)",
        background: "var(--panel-raised)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {combatant.name}
    </button>
  );
}

/** Main.dc.html's "REACTIONS READY" list — every non-defeated combatant who
 * hasn't spent their reaction yet, so the GM can see who might interrupt.
 * Players come first, as bare names (ReadyPlayerRow): their reactions
 * aren't on record, but whether they have used one is what the GM tracks.
 * Monsters follow, each with its reaction's name and trigger.
 * The mockup pairs each entry with the reaction's name and trigger text;
 * `Combatant.reactions` (denormalised from the creature record, same as
 * `iwr`) carries that. A reaction with no trigger text shows its name alone
 * rather than inventing a trigger; a combatant with no known reactions at
 * all has nothing to watch for, so it's excluded rather than listed with
 * nothing under its name (players aside, above) — `setReactionSpent` previously had no call site,
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
export function ReactionWatch({ fetchFn }: { fetchFn?: FetchFn } = {}): React.ReactElement {
  const t = useT();
  const combatants = useEncounter((s) => s.encounter.combatants);
  const entries = useEncounter((s) => s.encounter.entries);
  const setReactionSpent = useEncounter((s) => s.setReactionSpent);
  // Loaded once here, not per card, and passed down — same glossary map
  // ActionList resolves reaction (and every other action) name against, so
  // a reaction spelled out untranslated in its own creature record (e.g.
  // Attack of Opportunity) reads the same French name here as it does in
  // the action list itself, instead of being the one surface still English.
  const glossary = useTraitGlossary(fetchFn);
  // Delay is a property of the *entry*, so a group that Delays takes every
  // one of its members' reactions with it.
  const delayedIds = new Set(entries.filter((e) => e.delayed).flatMap((e) => e.combatantIds));
  const available = Object.values(combatants)
    .filter((c) => !c.defeated && !c.reactionSpent && !delayedIds.has(c.id))
    .sort((a, b) => compareStrings(a.name, b.name));
  const readyPlayers = available.filter((c) => c.kind === "pc");
  const readyMonsters = available.filter((c) => c.kind === "creature" && c.reactions.length > 0);
  const readyCount = readyPlayers.length + readyMonsters.length;

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
          {format(t("READY_COUNT"), { n: readyCount })}
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
        {readyPlayers.map((c) => (
          <ReadyPlayerRow key={c.id} combatant={c} onSpend={() => setReactionSpent(c.id, true)} />
        ))}
        {readyMonsters.map((c) => (
          <ReadyCombatantCard
            key={c.id}
            combatant={c}
            onSpend={() => setReactionSpent(c.id, true)}
            t={t}
            glossary={glossary}
          />
        ))}
      </div>
    </div>
  );
}
