import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Creature, CreatureI18n, IndexEntry } from "@pf2/schema";
import { resolveCollisions } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { loadCreatureI18n } from "../data/i18nOverlay.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { parseAddCommand } from "../rules/parseAddCommand.js";
import { rankMatches } from "../rules/rankMatches.js";
import { useEncounter } from "../state/store.js";
import { seedFromEntry } from "./AddCombatants.js";

// The busiest 3-character prefix matches 44 creatures; rendering all of them
// in a dropdown is noise, not help — cap the list and say how many are
// hidden, same convention as AddCombatants's RESULT_CAP.
const DROPDOWN_CAP = 8;
const MIN_QUERY_LENGTH = 3;
const MESSAGE_TIMEOUT_MS = 3500;

const containerStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "10px 8px",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "14px",
  padding: "8px 10px",
  borderRadius: "4px",
  border: "1px solid var(--border-strong)",
  background: "var(--panel)",
  color: "var(--text)",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "8px",
  right: "8px",
  zIndex: 20,
  marginTop: "2px",
  borderRadius: "4px",
  border: "1px solid var(--border-strong)",
  background: "var(--panel-raised)",
  boxShadow: "0 6px 18px oklch(0.08 0.01 60 / 0.5)",
  overflow: "hidden",
};

function optionStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    cursor: "pointer",
    background: active ? "var(--accent-bg)" : "transparent",
  };
}

/** Builds the "added N × Name[ at I][ (capped from R)]" confirmation line the
 * brief asks for, so a mistyped name — or a quantity the cap silently
 * reduced — is visible immediately rather than assumed. `requestedQuantity`
 * is what the GM actually typed; it only differs from `quantity` when
 * `parseAddCommand` clamped it down to `MAX_ADD_QUANTITY`. */
function addedMessage(
  t: (key: StringKey) => string,
  quantity: number,
  requestedQuantity: number,
  name: string,
  initiative: number | null,
): string {
  const suffix = initiative !== null ? format(t("ADDED_AT_INITIATIVE"), { initiative }) : "";
  const capped = requestedQuantity > quantity ? format(t("ADDED_CAPPED"), { requested: requestedQuantity }) : "";
  return format(t("ADDED_MESSAGE"), { quantity, name, suffix, capped });
}

/**
 * A single-line command parser for adding combatants: "6 goblin warrior 13"
 * adds six Goblin Warriors at initiative 13, in one line instead of the
 * drawer's open → search → select → adjust quantity → type initiative →
 * confirm → close sequence. Always visible above `<CombatantList>`; the
 * drawer (`<AddCombatants>`) remains for browsing.
 *
 * Adding reuses `seedFromEntry` — the one place that denormalises `iwr`,
 * `reactions`, `attacks` and `actions` off the full `Creature` record — so a
 * combatant added here carries exactly what the drawer's flow carries.
 */
export function QuickAdd({
  entries,
  loadCreatureFn = loadCreature,
  loadCreatureI18nFn = loadCreatureI18n,
}: {
  entries: IndexEntry[];
  loadCreatureFn?: (id: string) => Promise<Creature>;
  loadCreatureI18nFn?: (id: string) => Promise<CreatureI18n | null>;
}): React.ReactElement {
  const t = useT();
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const addCombatant = useEncounter((s) => s.addCombatant);
  const addMany = useEncounter((s) => s.addMany);
  const lang = useEncounter((s) => s.lang);

  const resolved = useMemo(() => resolveCollisions(entries), [entries]);
  const parsed = useMemo(() => parseAddCommand(query), [query]);
  const matches = useMemo(() => rankMatches(resolved, parsed.nameQuery), [resolved, parsed.nameQuery]);
  const shown = matches.slice(0, DROPDOWN_CAP);
  const hiddenCount = matches.length - shown.length;
  const showDropdown = !dismissed && parsed.nameQuery.length >= MIN_QUERY_LENGTH && shown.length > 0;
  const clampedIndex = Math.min(highlightedIndex, Math.max(shown.length - 1, 0));

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const optionId = (index: number): string => `${listboxId}-option-${index}`;

  const commit = (entry: IndexEntry, quantity: number, requestedQuantity: number, initiative: number | null): void => {
    const slotInitiative = initiative ?? 0;
    // The overlay is fetched alongside the creature record, only when
    // French is on — see AddCombatants.select for the same rule.
    const i18nPromise = lang === "fr" ? loadCreatureI18nFn(entry.id).catch(() => null) : Promise.resolve(null);
    void Promise.all([loadCreatureFn(entry.id).catch(() => null), i18nPromise]).then(([creature, i18n]) => {
      const seed = seedFromEntry(entry, creature, i18n);
      if (quantity === 1) addCombatant(seed, slotInitiative);
      else addMany(seed, quantity, slotInitiative);

      setMessage(addedMessage(t, quantity, requestedQuantity, entry.name, initiative));
      setQuery("");
      setDismissed(false);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    });
  };

  const completeHighlighted = (): void => {
    const entry = shown[clampedIndex];
    if (entry === undefined) return;
    // Uses the raw requestedQuantity, not the clamped quantity — completing
    // a name is not committing an add, so a typed "500" shouldn't be
    // silently rewritten to "30" before the GM has even confirmed it.
    const prefix = parsed.requestedQuantity > 1 ? `${parsed.requestedQuantity} ` : "";
    const suffix = parsed.initiative !== null ? ` ${parsed.initiative}` : "";
    setQuery(`${prefix}${entry.name}${suffix}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      if (!showDropdown) return;
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      if (!showDropdown) return;
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      if (!showDropdown) return;
      e.preventDefault();
      setDismissed(true);
    } else if (e.key === "Tab") {
      if (!showDropdown) return;
      e.preventDefault();
      completeHighlighted();
    } else if (e.key === "Enter") {
      if (!showDropdown) return;
      const entry = shown[clampedIndex];
      if (entry === undefined) return;
      e.preventDefault();
      commit(entry, parsed.quantity, parsed.requestedQuantity, parsed.initiative);
    }
  };

  return (
    <div style={containerStyle}>
      <label
        htmlFor="quick-add-input"
        style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}
      >
        {t("QUICK_ADD_LABEL")}
      </label>
      <input
        id="quick-add-input"
        ref={inputRef}
        aria-label={t("QUICK_ADD_ARIA")}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={showDropdown ? optionId(clampedIndex) : undefined}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("QUICK_ADD_PLACEHOLDER")}
        style={inputStyle}
      />

      {message !== null && (
        <div role="status" style={{ fontSize: "12px", color: "var(--ok)" }}>
          {message}
        </div>
      )}

      {showDropdown && (
        <div style={dropdownStyle}>
          <ul id={listboxId} role="listbox" aria-label={t("MATCHING_CREATURES_ARIA")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shown.map((entry, index) => (
              <li
                key={entry.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === clampedIndex}
                style={optionStyle(index === clampedIndex)}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(entry, parsed.quantity, parsed.requestedQuantity, parsed.initiative);
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600 }}>{entry.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-text)" }}>
                  {entry.level}
                </span>
                <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{entry.book}</span>
                {entry.remaster && (
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      padding: "1px 5px",
                      borderRadius: "2px",
                      background: "var(--ok-bg)",
                      color: "var(--ok)",
                    }}
                  >
                    {t("REMASTER_BADGE")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <div style={{ padding: "6px 10px", fontSize: "11px", color: "var(--text-faint)" }}>
              {format(t("MORE_HIDDEN"), { n: hiddenCount })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
