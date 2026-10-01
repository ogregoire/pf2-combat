import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useT, type StringKey } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";

/** A human silhouette standing in for the "PC" word beside a player
 * character's level. The accessible name keeps the localised prefix. */
function PcIcon({ label }: { label: string }): React.ReactElement {
  return (
    <svg role="img" aria-label={label} width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0, alignSelf: "center" }}>
      <circle cx="12" cy="6.5" r="4" fill="currentColor" />
      <path d="M4 22c0-5 3.2-8.5 8-8.5s8 3.5 8 8.5z" fill="currentColor" />
    </svg>
  );
}

/** "Creature 6" for a monster; a silhouette and the bare level for a PC. */
function LevelLabel({ combatant, t }: { combatant: Combatant; t: (key: StringKey) => string }): React.ReactElement {
  if (combatant.kind === "pc") {
    return (
      <>
        <PcIcon label={t("PC_PREFIX")} />
        {combatant.level}
      </>
    );
  }
  return <>{`${t("CREATURE_PREFIX")} ${combatant.level}`}</>;
}

/** Main.dc.html's stat block header: name and level. The mockup also shows
 * source/rarity/size/traits chips, but those live on the full creature
 * record, not on `Combatant` — the store only carries what Task 11/this
 * task's denormalisation put there (name, level, ac, saves, hp, attacks,
 * actions). Adding those chips would mean inventing fields no ruling has
 * asked for, so this renders only what the combatant actually carries.
 *
 * The name is French when `lang` is "fr" and the combatant carries an
 * overlay — the ONLY name shown, never "French (English)". A creature with
 * no overlay (added while `lang` was "en", or genuinely untranslated)
 * simply renders in English, unannotated: the overlay can't tell "nobody
 * translated this" from "the French name is identical to the English"
 * (Manticore, Ankou, Belker genuinely ARE the French names), so no marker
 * is drawn — one would fire exactly where English is already correct. */
export function StatBlockHeader({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const name = resolveCreatureName(combatant.name, i18n, lang);
  return (
    <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 600 }}>
          {name}
        </h1>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "5px", fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--text-dim)" }}>
          <LevelLabel combatant={combatant} t={t} />
        </span>
      </div>
    </div>
  );
}
