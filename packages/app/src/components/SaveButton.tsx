import { useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";

/** Opens the saving-throw dialog blank, for a save the app doesn't know
 * the DC of — a player's spell, a hazard: the GM types it. */
export function SaveButton({ casterId }: { casterId: string }): React.ReactElement {
  const t = useT();
  const openSaveDialog = useEncounter((s) => s.openSaveDialog);
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
      <button
        type="button"
        onClick={() => openSaveDialog({ casterId, save: "reflex", dc: null, basic: true })}
        style={{ fontFamily: "inherit", fontSize: "12px", padding: "5px 10px", borderRadius: "3px", border: "1px solid var(--border-strong)", background: "var(--panel-raised)", color: "var(--text)", cursor: "pointer" }}
      >
        {t("SAVE_BUTTON")}
      </button>
    </div>
  );
}
