import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyManager } from "../src/components/PartyManager.js";
import { useEncounter } from "../src/state/store.js";
import type { Player } from "../src/state/types.js";

describe("PartyManager clear characters", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("has nothing to clear with an empty roster", () => {
    render(<PartyManager />);
    expect(screen.getByRole("button", { name: /clear characters/i }).hasAttribute("disabled")).toBe(true);
  });

  it("asks for confirmation naming the player count before clearing", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
      { id: "player2", name: "Akiros", level: 4, ac: 19, saves: { fortitude: 12, reflex: 8, will: 6 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    expect(screen.getByText(/clear 2 player characters/i)).toBeDefined();
    expect(useEncounter.getState().players).toHaveLength(2); // not yet cleared

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(useEncounter.getState().players).toEqual([]);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useEncounter.getState().players).toHaveLength(1);
    expect(screen.queryByText(/clear 1 player character\?/i)).toBeNull();
  });

  it("also removes any of those players already sitting in the initiative order", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    const pcId = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(useEncounter.getState().encounter.combatants[pcId]).toBeUndefined();
  });
});

describe("PartyManager row", () => {
  beforeEach(() => useEncounter.getState().reset());

  const player = (): Player => ({
    id: "player1", name: "Valeria", level: 4, ac: 21, hp: 38,
    saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null,
  });

  it("shows every value as text, with no input open, until a field is clicked", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Valeria")).toBeDefined();
    expect(screen.getByRole("img", { name: "AC 21" })).toBeDefined();
    expect(screen.getByText("+10")).toBeDefined();
    expect(screen.getByText("+12")).toBeDefined();
    expect(screen.getByText("+9")).toBeDefined();
  });

  it("opens one input on click, edits it, and closes it on Escape", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "AC" }));
    const field = screen.getByRole("textbox", { name: "AC" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.clear(field);
    await user.type(field, "23");
    expect(useEncounter.getState().players[0]!.ac).toBe(23);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("img", { name: "AC 23" })).toBeDefined();
  });

  it("moves to the next field on Enter and back on Shift+Tab", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "Level" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "HP" })).toBeDefined();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("textbox", { name: "Level" })).toBeDefined();
  });

  it("closes the last field on Enter instead of wrapping around", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "Will" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Players roll their own initiative; the roster only holds the permanent
  // numbers the roll assistant needs. The modifier still exists on the
  // Player record (the row popover's reminder reads it) — it just has no
  // field here any more.
  it("has no initiative modifier field, nor a per-player Initiative or Add-to-encounter control", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    expect(screen.queryByLabelText(/initiative/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /add to encounter/i })).toBeNull();
  });

  // jsdom does no layout, so this pins the declarations rather than the
  // outcome: the roster is one grid and each row a subgrid of it, so AC,
  // Level, HP and the saves share columns down the list; the three saves
  // are one non-wrapping block; the toggle and bin are the row's first and
  // last cells, spanning its full height and vertically centred.
  it("lays every row out on the roster's shared columns, saves as one block, bin last", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    const roster = screen.getByTestId("roster");
    expect(roster.style.display).toBe("grid");
    const row = screen.getByTestId("player-row");
    expect(row.parentElement).toBe(roster);
    expect(row.style.gridTemplateColumns).toBe("subgrid");
    expect(row.style.alignItems).toBe("center");

    const saves = screen.getByTestId("saves-block");
    expect(saves.style.flexWrap).toBe("nowrap");
    expect(saves.parentElement).toBe(row);

    const bin = screen.getByRole("button", { name: "Remove Valeria" });
    expect(row.lastElementChild).toBe(bin);
    expect(bin.style.gridRow).toBe("1 / -1");
    expect(bin.style.color).toBe("var(--danger)");
  });

  it("shows Present as a green check on the row's left, turning into a red cross when absent", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    const toggle = screen.getByRole("checkbox", { name: "Present" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.style.color).toBe("var(--ok)");
    // First cell of the row, spanning its full height, like the bin is last.
    const row = toggle.parentElement as HTMLElement;
    expect(row.firstElementChild).toBe(toggle);
    expect(toggle.style.gridRow).toBe("1 / -1");
    expect(row.lastElementChild).toBe(screen.getByRole("button", { name: "Remove Valeria" }));

    await user.click(toggle);
    expect(useEncounter.getState().players[0]!.present).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.style.color).toBe("var(--danger)");
  });

  // Mono values sit right-aligned in fixed character cells so "+9" and
  // "+10" occupy the same width and the fields after them stay put.
  it("gives every numeric value a fixed, right-aligned width", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    for (const text of ["+10", "+12", "+9", "4", "38"]) {
      const el = screen.getByText(text) as HTMLElement;
      expect(el.style.textAlign).toBe("right");
      expect(el.style.width).toMatch(/^[23]ch$/);
    }
  });

  it("opens the new character's Name field as soon as it is added", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add character/i }));
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(document.activeElement).toBe(name);
    await user.keyboard("Kesten");
    expect(useEncounter.getState().players[0]!.name).toBe("Kesten");
  });

  it("keeps the row the same height whether the AC shows as a shield or an input", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    const shieldButton = screen.getByRole("button", { name: "AC" });
    expect(shieldButton.style.height).toBe("32px");
    await user.click(shieldButton);
    expect(screen.getByRole("textbox", { name: "AC" }).style.height).toBe("32px");
  });

  it("scrolls the roster, not the drawer, with Add and Clear in a footer beneath it", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    const roster = screen.getByTestId("roster");
    expect(roster.style.overflowY).toBe("auto");
    const add = screen.getByRole("button", { name: /add character/i });
    const clear = screen.getByRole("button", { name: /clear characters/i });
    expect(add.parentElement).toBe(clear.parentElement);
    expect(roster.nextElementSibling).toBe(add.parentElement);
    expect(clear.style.color).toBe("var(--danger)");
  });

  it("removes the character from the bin", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: "Remove Valeria" }));
    expect(useEncounter.getState().players).toEqual([]);
  });
});
