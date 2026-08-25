import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Creature, IndexEntry } from "@pf2/schema";
import { resolveCollisions } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { parseAddCommand } from "../rules/parseAddCommand.js";
import { rankMatches } from "../rules/rankMatches.js";
import { useEncounter } from "../state/store.js";
import type { Player } from "../state/types.js";
import { seedFromEntry } from "./AddCombatants.js";

/** A dropdown row is either a present player not yet in the order, or a
 * catalog creature. Player rows are built here rather than reusing
 * `IndexEntry` because a player isn't a catalog record at all — it carries
 * roster fields (`ac`/`saves`/`initiativeModifier`) that a creature gets
 * from `loadCreatureFn` instead. */
type QuickAddOption = { kind: "player"; player: Player } | { kind: "creature"; entry: IndexEntry };

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
function addedMessage(quantity: number, requestedQuantity: number, name: string, initiative: number | null): string {
  const suffix = initiative !== null ? ` at ${initiative}` : "";
  const capped = requestedQuantity > quantity ? ` (capped from ${requestedQuantity})` : "";
  return `added ${quantity} × ${name}${suffix}${capped}`;
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
}: {
  entries: IndexEntry[];
  loadCreatureFn?: (id: string) => Promise<Creature>;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const addCombatant = useEncounter((s) => s.addCombatant);
  const addMany = useEncounter((s) => s.addMany);
  const players = useEncounter((s) => s.players);
  const combatants = useEncounter((s) => s.encounter.combatants);

  const resolved = useMemo(() => resolveCollisions(entries), [entries]);
  const parsed = useMemo(() => parseAddCommand(query), [query]);
  const matches = useMemo(() => rankMatches(resolved, parsed.nameQuery), [resolved, parsed.nameQuery]);
  const shown = matches.slice(0, DROPDOWN_CAP);
  const hiddenCount = matches.length - shown.length;

  // A player already sitting in the order (an existing combatant carries
  // their id as `playerId`) is not offered again — the GM would otherwise
  // be able to double-add the same PC from this field.
  const playerIdsInOrder = useMemo(
    () => new Set(Object.values(combatants).map((c) => c.playerId).filter((id): id is string => id !== undefined)),
    [combatants],
  );
  const availablePlayers = useMemo(
    () => players.filter((p) => p.present && !playerIdsInOrder.has(p.id)),
    [players, playerIdsInOrder],
  );
  // Unlike creature matches, players aren't gated by MIN_QUERY_LENGTH — the
  // set of present players is small, so there's no noise to protect
  // against, and the GM should see the whole present roster the moment the
  // field is focused, before typing anything.
  const playerOptions = useMemo(() => {
    const q = parsed.nameQuery.trim().toLowerCase();
    if (q === "") return availablePlayers;
    return availablePlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [availablePlayers, parsed.nameQuery]);

  // Players are ranked ahead of every creature match, per the brief.
  const options: QuickAddOption[] = useMemo(
    () => [
      ...playerOptions.map((player): QuickAddOption => ({ kind: "player", player })),
      ...shown.map((entry): QuickAddOption => ({ kind: "creature", entry })),
    ],
    [playerOptions, shown],
  );

  const showDropdown =
    !dismissed &&
    ((parsed.nameQuery.length >= MIN_QUERY_LENGTH && shown.length > 0) || (focused && playerOptions.length > 0));
  const clampedIndex = Math.min(highlightedIndex, Math.max(options.length - 1, 0));

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const optionId = (index: number): string => `${listboxId}-option-${index}`;

  const commit = (entry: IndexEntry, quantity: number, requestedQuantity: number, initiative: number | null): void => {
    void loadCreatureFn(entry.id)
      .catch(() => null)
      .then((creature) => {
        const seed = seedFromEntry(entry, creature);
        if (quantity === 1) addCombatant(seed, initiative);
        else addMany(seed, quantity, initiative);

        setMessage(addedMessage(quantity, requestedQuantity, entry.name, initiative));
        setQuery("");
        setDismissed(false);
        setHighlightedIndex(0);
        inputRef.current?.focus();
      });
  };

  // A player always arrives unrolled (`null`), unlike a creature — the GM
  // doesn't dictate a PC's initiative, the player rolls it themselves once
  // seated at the table, so there is no typed-initiative path to honor here
  // the way `commit` honors `parsed.initiative`.
  const commitPlayer = (p: Player): void => {
    addCombatant(
      {
        kind: "pc",
        name: p.name,
        hp: p.hp !== undefined ? { current: p.hp, max: p.hp } : null,
        ac: p.ac,
        saves: p.saves,
        level: p.level,
        playerId: p.id,
        initiativeModifier: p.initiativeModifier,
      },
      null,
    );

    setMessage(`added ${p.name}`);
    setQuery("");
    setDismissed(false);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const commitOption = (option: QuickAddOption): void => {
    if (option.kind === "player") commitPlayer(option.player);
    else commit(option.entry, parsed.quantity, parsed.requestedQuantity, parsed.initiative);
  };

  const completeHighlighted = (): void => {
    const option = options[clampedIndex];
    if (option === undefined) return;
    if (option.kind === "player") {
      setQuery(option.player.name);
      return;
    }
    // Uses the raw requestedQuantity, not the clamped quantity — completing
    // a name is not committing an add, so a typed "500" shouldn't be
    // silently rewritten to "30" before the GM has even confirmed it.
    const prefix = parsed.requestedQuantity > 1 ? `${parsed.requestedQuantity} ` : "";
    const suffix = parsed.initiative !== null ? ` ${parsed.initiative}` : "";
    setQuery(`${prefix}${option.entry.name}${suffix}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      if (!showDropdown) return;
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
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
      const option = options[clampedIndex];
      if (option === undefined) return;
      e.preventDefault();
      commitOption(option);
    }
  };

  return (
    <div style={containerStyle}>
      <label
        htmlFor="quick-add-input"
        style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}
      >
        Quick add
      </label>
      <input
        id="quick-add-input"
        ref={inputRef}
        aria-label="Quick add creatures"
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="6 goblin warrior 13"
        style={inputStyle}
      />

      {message !== null && (
        <div role="status" style={{ fontSize: "12px", color: "var(--ok)" }}>
          {message}
        </div>
      )}

      {showDropdown && (
        <div style={dropdownStyle}>
          <ul id={listboxId} role="listbox" aria-label="Matching players and creatures" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {options.map((option, index) => (
              <li
                key={option.kind === "player" ? `player-${option.player.id}` : option.entry.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === clampedIndex}
                style={optionStyle(index === clampedIndex)}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitOption(option);
                }}
              >
                {option.kind === "player" ? (
                  <>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{option.player.name}</span>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        padding: "1px 5px",
                        borderRadius: "2px",
                        background: "var(--info-bg)",
                        color: "var(--info)",
                      }}
                    >
                      PLAYER
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{option.entry.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-text)" }}>
                      {option.entry.level}
                    </span>
                    <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{option.entry.book}</span>
                    {option.entry.remaster && (
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
                        REMASTER
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <div style={{ padding: "6px 10px", fontSize: "11px", color: "var(--text-faint)" }}>
              +{hiddenCount} more — keep typing to narrow it down
            </div>
          )}
        </div>
      )}
    </div>
  );
}
