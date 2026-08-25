import { useState } from "react";

/**
 * A destructive action with no undo (clear enemies, clear players, reset the
 * encounter) rendered inline — "Clear enemies" becomes "Clear 6 enemies?
 * [Confirm] [Cancel]" in place, never a modal — per the brief. No auto-
 * dismiss timer: the GM decides when to back out, not a clock. Shared by
 * TurnManager (clear enemies, reset encounter) and PartyManager (clear
 * players) rather than duplicated three times.
 */
export function ConfirmButton({
  label,
  confirmMessage,
  onConfirm,
  disabled = false,
}: {
  label: string;
  confirmMessage: string;
  onConfirm: () => void;
  disabled?: boolean;
}): React.ReactElement {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--danger)" }}>{confirmMessage}</span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          style={{
            fontFamily: "inherit",
            fontSize: "12px",
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: "3px",
            border: "1px solid var(--border-strong)",
            background: "var(--danger-bg, var(--panel-raised))",
            color: "var(--danger)",
            cursor: "pointer",
          }}
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          style={{
            fontFamily: "inherit",
            fontSize: "12px",
            padding: "5px 10px",
            borderRadius: "3px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--text-dim)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      style={{
        fontFamily: "inherit",
        fontSize: "12px",
        padding: "5px 10px",
        borderRadius: "3px",
        border: "1px solid var(--border)",
        background: "var(--panel-raised)",
        color: disabled ? "var(--text-faint)" : "var(--text-dim)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
