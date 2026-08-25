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
 * no overlay (added while `lang` was "en", or genuinely untranslated)
 * simply renders in English, unannotated: the overlay can't tell "nobody
 * translated this" from "the French name is identical to the English"
 * (Manticore, Ankou, Belker genuinely ARE the French names), so no marker
 * is drawn — one would fire exactly where English is already correct. */
export function StatBlockHeader({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const name = resolveCreatureName(combatant.name, combatant.i18n, lang);
  return (
    <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 600 }}>
          {name}
        </h1>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--accent-text)" }}>
          {levelLabel(combatant, t)}
        </span>
      </div>
    </div>
  );
}
