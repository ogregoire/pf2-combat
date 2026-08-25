import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useT, type StringKey } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";

function levelLabel(combatant: Combatant, t: (key: StringKey) => string): string {
  return `${combatant.kind === "pc" ? t("PC_PREFIX") : t("CREATURE_PREFIX")} ${combatant.level}`;
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
 * no overlay (added while `lang` was "en", or genuinely untranslated) still
 * renders in English, but with a quiet badge marking that fallback, so the
 * GM knows the tracker is showing English rather than wondering whether
 * that IS the French name. */
export function StatBlockHeader({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const { name, fallback } = resolveCreatureName(combatant.name, combatant.i18n, lang);
  return (
    <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 600 }}>
          {name}
        </h1>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--accent-text)" }}>
          {levelLabel(combatant, t)}
        </span>
        {fallback && (
          <span
            title={t("CREATURE_FALLBACK_TITLE")}
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              padding: "1px 6px",
              borderRadius: "2px",
              background: "var(--border)",
              color: "var(--text-dim)",
            }}
          >
            {t("CREATURE_FALLBACK_BADGE")}
          </span>
        )}
      </div>
    </div>
  );
}
