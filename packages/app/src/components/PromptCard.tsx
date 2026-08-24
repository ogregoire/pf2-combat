import { CONDITIONS } from "../rules/conditions.js";
import type { Prompt } from "../rules/prompts.js";

/** One acknowledgeable prompt — TurnAssistant.dc.html's card anatomy: a
 * condition badge, the title, the computation/derivation the GM needs, any
 * outcome bands, and — always — an explicit "Got it" control. Acknowledging
 * is the only way a card leaves the screen; nothing here auto-dismisses,
 * including prompts the app already applied (autoApplied), because the
 * click is the GM's record that they saw the number change. */
export function PromptCard({ prompt, onAcknowledge }: { prompt: Prompt; onAcknowledge: () => void }): React.ReactElement {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "4px",
        background: "var(--cond-bg)",
        borderLeft: "3px solid var(--cond)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            padding: "1px 6px",
            borderRadius: "2px",
            background: "var(--cond)",
            color: "var(--bg)",
          }}
        >
          {CONDITIONS[prompt.slug].name.toUpperCase()}
        </span>
        <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{prompt.title}</span>
      </div>

      {prompt.computation && (
        <div style={{ marginTop: "7px", fontSize: "12.5px", color: "var(--text-dim)" }}>{prompt.computation}</div>
      )}

      {prompt.derivation && (
        <div style={{ marginTop: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-faint)" }}>
          {prompt.derivation}
        </div>
      )}

      {prompt.outcomes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px", marginTop: "8px" }}>
          {prompt.outcomes.map((o) => (
            <div
              key={o.label}
              style={{ padding: "5px 8px", borderRadius: "3px", background: "var(--panel-raised)", fontSize: "11.5px" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{o.label}</span>{" "}
              <span style={{ color: "var(--text-dim)" }}>{o.effect}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "7px" }}>
        {prompt.autoApplied && <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{prompt.autoApplied}</span>}
        <div style={{ flexGrow: 1 }} />
        <button
          type="button"
          onClick={onAcknowledge}
          style={{
            fontFamily: "inherit",
            fontSize: "11.5px",
            fontWeight: 600,
            padding: "5px 12px",
            borderRadius: "3px",
            border: "1px solid var(--cond)",
            background: "var(--panel-high)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
