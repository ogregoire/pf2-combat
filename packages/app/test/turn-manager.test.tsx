import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CombatantList } from "../src/components/CombatantList.js";
import { TurnManager } from "../src/components/TurnManager.js";
import { useEncounter } from "../src/state/store.js";

const add = (name: string, init: number): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 1, ac: 15,
      saves: { fortitude: 5, reflex: 5, will: 5 },
      hp: { current: 20, max: 20 } },
    init,
  );

describe("TurnManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the round and three action pips", () => {
    add("a", 20);
    render(<TurnManager />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getAllByTestId("action-pip")).toHaveLength(3);
  });

  it("refuses to advance the turn while a combatant has no initiative, and says how many", async () => {
    const user = userEvent.setup();
    add("Alpha", 20);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 },
        hp: { current: 20, max: 20 } },
      null,
    );
    render(<TurnManager />);

    const before = useEncounter.getState().encounter.activeEntryIndex;
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(before);
    expect(screen.getByText(/1 combatant has no initiative/i)).toBeDefined();
  });

  it("shows strikes made this turn beside the action pips", () => {
    const id = add("a", 20);
    render(<TurnManager />);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("0");
    // Siblings in the turn panel, not off in the actions list.
    expect(screen.getByTestId("strikes-this-turn").parentElement!.contains(screen.getAllByTestId("action-pip")[0]!)).toBe(true);

    act(() => useEncounter.getState().recordStrike(id));
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("1");
  });

  it("resets a miscounted strike through its own button, the only UI entry point resetStrikes has left", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    act(() => {
      useEncounter.getState().recordStrike(id);
      useEncounter.getState().recordStrike(id);
    });
    render(<TurnManager />);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("2");

    await user.click(screen.getByRole("button", { name: /reset strikes this turn/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.strikesMade).toBe(0);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("0");
  });

  it("reduces the pips when the active combatant is slowed", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(2);
  });

  it("renders a start-of-turn prompt with its computation", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 2);
    render(<TurnManager />);
    expect(screen.getByText("Recovery check")).toBeDefined();
    expect(screen.getByText("1d20 flat check vs DC 12")).toBeDefined();
    expect(screen.getByText("DC 10 + dying 2 = 12")).toBeDefined();
  });

  // Frightened's decrement is a rule that fires on its own when the turn
  // ends (nextTurn -> applyEndOfTurn, see store.ts and conditions.ts) — it
  // used to be that acknowledging this card was the *only* place the
  // decrement happened, but now that nextTurn does it too, acknowledging
  // must be inert for it (see the "decrements once, not twice" test below
  // for the regression this guards against). It should still behave as a
  // GM's "I've seen this" record, though: the card itself disappears for
  // the rest of the turn once acknowledged (acknowledgedPrompts).
  it("acknowledging the end-of-turn frightened prompt does not itself decrement it, but does dismiss the card", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<TurnManager />);

    expect(screen.getByText("Frightened decreases")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 2, formula: undefined },
    ]);
    expect(screen.queryByText("Frightened decreases")).toBeNull();
  });

  it("acknowledging the end-of-turn frightened prompt at value 1 doesn't remove it either — same, removal is nextTurn's job", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 1, formula: undefined },
    ]);
  });

  // The regression this guards against: handleAcknowledge used to mutate
  // frightened's value directly, independently of nextTurn. After wiring
  // applyEndOfTurn into nextTurn, leaving that mutation in place would have
  // decremented frightened twice for a single turn ending — once when the
  // GM clicked "got it" mid-turn, once more when they actually clicked
  // Next. Acknowledging first (as a GM naturally would, reading the queued
  // card before ending the turn) and then ending the turn must still only
  // decrement once.
  it("decrements frightened once, not twice, when its prompt is acknowledged and then the turn ends", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 1, formula: undefined },
    ]);
  });

  it("clears stunned once its start-of-turn action-loss prompt is acknowledged, without refunding the actions it took", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "stunned", 2);
    render(<TurnManager />);

    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(1); // 3 - stunned 2

    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
    // The regression this guards: removing the condition alone used to let
    // ActionPips recompute the pool as if stunned had never happened,
    // handing the two lost actions straight back.
    expect(useEncounter.getState().encounter.combatants[id]!.actionsSpent).toBe(2);
    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(1);
    // Condition is gone, so the pool's own `reasons` no longer mentions
    // stunned — it's actionsSpent alone keeping the pips down now.
    expect(screen.getByText("1 actions")).toBeDefined();
  });

  it("dismisses a prompt only on click", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getByText(/Lose 1 action/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByText(/Lose 1 action/)).toBeNull();
  });

  it("keeps Next enabled but shows the outstanding count", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 1);
    render(<TurnManager />);
    const next = screen.getByRole("button", { name: /next combatant/i });
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/1 unacknowledged/i)).toBeDefined();
  });

  it("advances the turn when Next is pressed", async () => {
    const user = userEvent.setup();
    add("a", 20);
    add("b", 10);
    render(<TurnManager />);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });

  // These two prove the wiring, not just the function: applyEndOfTurn
  // (conditions.ts) existed and was fully tested in isolation before this,
  // but nothing called it — nextTurn advanced the round without ever
  // touching a condition. What matters here is that pressing Next for real
  // (through the same store action the GM's button uses) is what makes
  // frightened tick down and persistent damage land on HP, not that the
  // pure function returns the right object.
  it("fires end-of-turn hooks through Next: frightened decrements and persistent damage lands on HP via the same path applyDamage uses", async () => {
    const user = userEvent.setup();
    const id = add("a", 20); // active entry — its turn is the one ending
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d6");
    render(<TurnManager />);

    const hpBefore = useEncounter.getState().encounter.combatants[id]!.hp!.current;
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    const combatant = useEncounter.getState().encounter.combatants[id]!;
    expect(combatant.conditions.find((c) => c.slug === "frightened")!.value).toBe(1);
    // Bounded, not just "> 0" — a real 1d6 roll through the actual store
    // wiring (Math.random, not injected) can only land in [1, 6], and
    // applyDamage's own floor-at-0 means it can't go negative either way.
    const lost = hpBefore - combatant.hp!.current;
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(6);
  });

  it("removes frightened via Next once it would tick to zero", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
  });

  it("scrolls the reaction list independently", () => {
    add("a", 20);
    render(<TurnManager />);
    const list = screen.getByTestId("reaction-scroll");
    expect(list.style.overflowY).toBe("auto");
  });

  it("constrains its own height so the reaction list is what scrolls, not the whole panel", () => {
    add("a", 20);
    const { container } = render(<TurnManager />);
    const root = container.firstElementChild as HTMLElement;
    // flexGrow + minHeight:0 is what lets the reaction-scroll child's own
    // overflow:auto actually clip instead of the panel just growing taller
    // than its allotted space — see EncounterScreen's matching turn-manager
    // wrapper, which must not itself scroll.
    expect(root.style.flexGrow).toBe("1");
    expect(root.style.minHeight).toBe("0");
  });

  it("excludes a combatant with no known reactions from the ready list", () => {
    add("a", 20); // no `reactions` given — defaults to []
    render(<TurnManager />);
    expect(screen.getByText("0 ready")).toBeDefined();
  });

  it("lets the GM mark a reaction spent, removing it from the ready list", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Akiros Ismort", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 8, will: 6 }, hp: { current: 53, max: 53 },
        reactions: [{ name: "No Escape", trigger: "An adjacent foe moves away." }] },
      15,
    );
    render(<TurnManager />);
    expect(screen.getByText("1 ready")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /spent/i }));

    expect(screen.getByText("0 ready")).toBeDefined();
    expect(useEncounter.getState().encounter.combatants[id]!.reactionSpent).toBe(true);
  });

  it("shows the reaction's name and trigger text", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Akiros Ismort", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 8, will: 6 }, hp: { current: 53, max: 53 },
        reactions: [{ name: "No Escape", trigger: "An adjacent foe moves away." }] },
      15,
    );
    render(<TurnManager />);
    expect(screen.getByText("No Escape")).toBeDefined();
    expect(screen.getByText(/An adjacent foe moves away\./)).toBeDefined();
  });

  it("clears enemies through a named confirmation, keeping the fight running", async () => {
    const user = userEvent.setup();
    add("a", 20); // creature
    const pc = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    add("b", 10); // creature
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /clear enemies/i }));
    expect(screen.getByText(/clear 2 enemies/i)).toBeDefined();
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(3); // not yet cleared

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const enc = useEncounter.getState().encounter;
    expect(Object.keys(enc.combatants)).toEqual([pc]);
    expect(enc.round).toBe(1);
  });

  it("cancels clearing enemies without changing anything", async () => {
    const user = userEvent.setup();
    add("a", 20);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /clear enemies/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(1);
  });

  it("resets the encounter to round 1 with no combatants but keeps the players", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    add("a", 20);
    add("b", 10);
    render(<TurnManager />);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    await user.click(screen.getByRole("button", { name: /reset encounter/i }));
    expect(screen.getByText(/reset the encounter/i)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const enc = useEncounter.getState().encounter;
    expect(enc.combatants).toEqual({});
    expect(enc.round).toBe(1);
    expect(useEncounter.getState().players).toHaveLength(1);
  });
});

/**
 * Delay (Player Core p. 416), rules as written:
 *
 *   "You can return to the initiative order as a free action triggered by
 *   the end of any other creature's turn. This permanently changes your
 *   initiative to the new position. If you Delay an entire round without
 *   returning to the initiative order, the actions from the Delayed turn
 *   are lost, your initiative doesn't change, and your next turn occurs at
 *   your original position. You can't use reactions until you return to the
 *   initiative order. When you Delay, any persistent damage or other
 *   negative effects that normally occur at the start or end of your turn
 *   occur immediately when you use the Delay action."
 *
 * Three consequences these tests pin down, because each is a place the
 * implementation could plausibly do the opposite: the returning entry's
 * initiative is *rewritten* (the old one survives only as a display record,
 * it is not restored later); the "entire round" that expires a Delay is
 * measured from the delayer's own slot back round to that same slot, not
 * from the round counter ticking over; and the end-of-turn effects fire on
 * Delay itself, exactly once, which is what stops Delay being a free way to
 * skip a turn of persistent damage.
 */
describe("Delay", () => {
  beforeEach(() => useEncounter.getState().reset());

  const entryIdOf = (name: string): string => {
    const enc = useEncounter.getState().encounter;
    return enc.entries.find((e) => e.combatantIds.some((id) => enc.combatants[id]!.name === name))!.id;
  };
  const entryOf = (entryId: string) =>
    useEncounter.getState().encounter.entries.find((e) => e.id === entryId)!;
  const order = (): string[] => {
    const enc = useEncounter.getState().encounter;
    return enc.entries.map((e) => enc.combatants[e.combatantIds[0]!]!.name);
  };
  const activeName = (): string => {
    const enc = useEncounter.getState().encounter;
    return enc.combatants[enc.entries[enc.activeEntryIndex]!.combatantIds[0]!]!.name;
  };

  it("places a returning combatant immediately after whoever just acted, and rewrites its initiative", () => {
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha);
    expect(entryOf(alpha).delayed).toBe(true);
    expect(activeName()).toBe("Beta"); // Delaying hands the turn on immediately

    useEncounter.getState().nextTurn(); // Beta's turn ends; Gamma is the one acting now
    useEncounter.getState().returnFromDelay(alpha);

    expect(order()).toEqual(["Beta", "Gamma", "Alpha"]);
    // RAW: returning permanently changes initiative; the original is kept only for display.
    const back = entryOf(alpha);
    expect(back.initiative).toBe(10);
    expect(back.initiativeBeforeDelay).toBe(20);
    expect(back.delayed).toBe(false);
    // The re-sort must not steal the turn from whoever the GM is resolving.
    expect(activeName()).toBe("Gamma");
  });

  it("slots a returning combatant behind the acting one even when their initiatives tie", () => {
    add("Alpha", 20);
    add("Beta", 12);
    add("Gamma", 12); // same initiative as Beta — addMany makes this the common case, not an edge one
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // Beta is up
    useEncounter.getState().returnFromDelay(alpha);

    expect(order()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(entryOf(alpha).initiative).toBe(12);
    expect(activeName()).toBe("Beta");
  });

  it("loses the turn and restores the original slot when a delayed round wraps", () => {
    add("Alpha", 20);
    add("Beta", 15);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha);
    useEncounter.getState().nextTurn(); // round wraps back onto Alpha's own slot

    // The Delay expired the moment the order came back round to Alpha: it
    // takes a normal turn at its original position, and the actions it
    // delayed are gone because they were never made available.
    expect(useEncounter.getState().encounter.round).toBe(2);
    expect(entryOf(alpha).delayed).toBe(false);
    expect(activeName()).toBe("Alpha");

    useEncounter.getState().nextTurn();

    const back = entryOf(alpha);
    expect(back.delayed).toBe(false);
    expect(back.initiative).toBe(20);
    expect(back.initiativeBeforeDelay).toBeNull();
    expect(useEncounter.getState().encounter.entries[0]!.id).toBe(alpha);
  });

  it("keeps a mid-order Delay alive past the round counter, expiring it only at that combatant's own slot", () => {
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().nextTurn(); // Alpha acts; Beta is up
    const beta = entryIdOf("Beta");

    useEncounter.getState().delay(beta); // Gamma is up
    useEncounter.getState().nextTurn(); // round wraps; Alpha leads round 2

    // A round has *not* elapsed for Beta yet — only two turns have. Expiring
    // on the round counter here would cut the Delay short by most of a round
    // and silently hand Beta its reactions back.
    expect(useEncounter.getState().encounter.round).toBe(2);
    expect(activeName()).toBe("Alpha");
    expect(entryOf(beta).delayed).toBe(true);

    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends: Beta's own slot, one full round on

    expect(entryOf(beta).delayed).toBe(false);
    expect(activeName()).toBe("Beta");
  });

  it("fires end-of-turn effects the moment you Delay, exactly once, so Delaying can't dodge persistent damage", () => {
    const id = add("Alpha", 20);
    add("Beta", 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d6");
    const hpBefore = useEncounter.getState().encounter.combatants[id]!.hp!.current;

    useEncounter.getState().delay(entryIdOf("Alpha"));

    const combatant = useEncounter.getState().encounter.combatants[id]!;
    // 1, not 0: Delay advances the turn, and the advance must not re-run the
    // hooks Delay has already run (the same double-fire that shipped once
    // already between prompt acknowledgement and Next).
    expect(combatant.conditions.find((c) => c.slug === "frightened")!.value).toBe(1);
    // Bounded rather than exact — a real 1d6 through the store's own wiring
    // (Math.random, no injected rng, same as the Next-button test above).
    const lost = hpBefore - combatant.hp!.current;
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(6);
  });

  // The other half of "exactly once". Delay runs the end-of-turn hooks up
  // front, then hands the turn on; the turn the delayer takes when it
  // *returns* is that same delayed turn, arriving late. Letting its end run
  // the hooks again gives one combatant two end-of-turn resolutions in a
  // single round — frightened falling twice as fast as everyone else's, and
  // persistent damage rolled twice for one round of burning.
  it("does not fire end-of-turn effects again when the turn a delayer returned to ends", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const frightened = (): number =>
      useEncounter.getState().encounter.combatants[id]!.conditions.find((c) => c.slug === "frightened")!.value;

    const alpha = entryIdOf("Alpha");
    useEncounter.getState().delay(alpha); // hooks fire here, RAW: 3 -> 2. Beta is up.
    expect(frightened()).toBe(2);

    useEncounter.getState().returnFromDelay(alpha); // slots in behind Beta, still Beta's turn
    useEncounter.getState().nextTurn(); // Beta's turn ends; Alpha takes its delayed turn
    useEncounter.getState().nextTurn(); // that delayed turn ends

    expect(frightened()).toBe(2);

    // Suppressed for that one turn only — the flag is spent the moment the
    // turn it describes is over, so the next round resolves normally again.
    useEncounter.getState().nextTurn(); // Beta's round-2 turn
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends

    expect(frightened()).toBe(1);
  });

  // ...but a Delay that lapses instead of returning is a different story:
  // the delayed turn is forfeit entirely (RAW: "the actions from the Delayed
  // turn are lost") and the turn the combatant takes back at its own slot is
  // a fresh one, a whole round on. Its end must resolve normally, or the
  // suppression above leaks forward and this combatant quietly skips a round
  // of persistent damage — the very dodge Delay is written to prevent.
  it("still fires end-of-turn effects at the end of the fresh turn a lapsed Delay lands in", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const frightened = (): number =>
      useEncounter.getState().encounter.combatants[id]!.conditions.find((c) => c.slug === "frightened")!.value;

    const alpha = entryIdOf("Alpha");
    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().nextTurn(); // Beta ends; the order is back at Alpha's slot, so the Delay lapses
    expect(entryOf(alpha).delayed).toBe(false);
    expect(activeName()).toBe("Alpha");

    useEncounter.getState().nextTurn(); // Alpha's ordinary round-2 turn ends

    expect(frightened()).toBe(1);
  });

  /*
   * A manual return — the GM typing a position (setInitiative) or dragging
   * one (moveEntry) for a delayed entry — is the third way a delayed turn
   * can end, alongside returning and lapsing, and it can go either way.
   * Which way depends on one thing: whether the position the GM chose is
   * still ahead of the turn pointer this round.
   *
   *   Below the active entry — the order will still reach it this round, and
   *   the turn it takes there IS the delayed turn. Its effects already ran
   *   at Delay, so its end must not run them again.
   *
   *   Above the active entry — the pointer has gone past. This round's turn
   *   is forfeit exactly as a lapsed Delay's is, and the next turn this
   *   entry takes is a fresh one next round, whose end must resolve
   *   normally.
   *
   * Getting this wrong is silent either way: a suppression that leaks costs
   * a whole round of frightened and persistent damage, and one that fires
   * early costs a doubled round. Both directions are pinned here, for both
   * call sites.
   */
  const frightenedOn = (id: string): number =>
    useEncounter.getState().encounter.combatants[id]!.conditions.find((c) => c.slug === "frightened")!.value;

  it("resolves the next round's end-of-turn effects when a typed initiative lands above the active entry", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().setInitiative(alpha, 25); // above Beta: this round has passed Alpha by

    expect(activeName()).toBe("Beta");
    expect(order()).toEqual(["Alpha", "Beta"]);

    useEncounter.getState().nextTurn(); // Beta's turn ends, round wraps; Alpha leads round 2
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends — a fresh turn, resolved afresh

    expect(frightenedOn(id)).toBe(1);
  });

  it("does not resolve them twice when a typed initiative lands below the active entry", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().setInitiative(alpha, 12); // below Beta: Alpha still has this round's turn coming

    expect(order()).toEqual(["Beta", "Alpha", "Gamma"]);

    useEncounter.getState().nextTurn(); // Beta ends; Alpha takes the delayed turn
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // that delayed turn ends — already resolved at Delay

    expect(frightenedOn(id)).toBe(2);

    useEncounter.getState().nextTurn(); // Gamma ends, round wraps
    useEncounter.getState().nextTurn(); // Beta's round-2 turn ends
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends — normal again

    expect(frightenedOn(id)).toBe(1);
  });

  it("resolves the next round's end-of-turn effects when a drag lands above the active entry", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().moveEntry(alpha, entryIdOf("Beta")); // dropped above Beta

    expect(order()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(activeName()).toBe("Beta");

    useEncounter.getState().nextTurn(); // Beta ends
    useEncounter.getState().nextTurn(); // Gamma ends, round wraps; Alpha leads round 2
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends

    expect(frightenedOn(id)).toBe(1);
  });

  it("does not resolve them twice when a drag lands below the active entry", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().moveEntry(alpha, null); // dropped at the very end, still ahead of the pointer

    expect(order()).toEqual(["Beta", "Gamma", "Alpha"]);

    useEncounter.getState().nextTurn(); // Beta ends
    useEncounter.getState().nextTurn(); // Gamma ends; Alpha takes the delayed turn
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // that delayed turn ends

    expect(frightenedOn(id)).toBe(2);
  });

  // The boundary between the two cases above. An entry placed *at* the
  // active index is neither ahead of the pointer nor behind it — it is the
  // one acting right now, part way through the very turn Delay resolved
  // early. "Passed by" has to mean strictly above, or nudging the row of the
  // combatant currently taking its returned turn resolves that turn's
  // effects a second time, which is the original defect all over again.
  it("keeps the suppression when a drag leaves the entry exactly where it is, mid-returned-turn", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2. Beta is up.
    useEncounter.getState().returnFromDelay(alpha); // slots between Beta and Gamma
    useEncounter.getState().nextTurn(); // Beta ends; Alpha is now taking its delayed turn
    expect(activeName()).toBe("Alpha");

    // The GM nudges the acting row — same slot, between Beta and Gamma.
    useEncounter.getState().moveEntry(alpha, entryIdOf("Gamma"));
    expect(order()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(activeName()).toBe("Alpha");

    useEncounter.getState().nextTurn(); // the delayed turn ends, already resolved

    expect(frightenedOn(id)).toBe(2);
  });

  /*
   * Two placements of the same delayed entry in one round. A boolean cannot
   * answer these: clearing it on the first placement throws away the fact
   * the second one needs, and nothing can put it back. A round stamp answers
   * both from the same comparison, because it records *when* Delay resolved
   * the turn rather than merely that something did.
   */
  it("does not resolve a delayed turn twice when the GM corrects a placement from above to below", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2, resolved for round 1. Beta is up.
    useEncounter.getState().setInitiative(alpha, 25); // above Beta: this round has passed Alpha by
    useEncounter.getState().setInitiative(alpha, 12); // ...corrected to below: Alpha acts again this round after all

    expect(order()).toEqual(["Beta", "Alpha"]);

    useEncounter.getState().nextTurn(); // Beta ends; Alpha takes the delayed turn
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // that turn ends — still round 1, still already resolved

    expect(frightenedOn(id)).toBe(2);
  });

  it("does not resolve a delayed turn twice when the correction goes the other way, below to above", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2, resolved for round 1
    useEncounter.getState().setInitiative(alpha, 12); // below Beta
    useEncounter.getState().setInitiative(alpha, 25); // ...corrected to above: Alpha forfeits this round

    expect(order()).toEqual(["Alpha", "Beta"]);

    useEncounter.getState().nextTurn(); // Beta ends, round wraps; Alpha leads round 2
    expect(useEncounter.getState().encounter.round).toBe(2);
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends — a different round, resolved afresh

    expect(frightenedOn(id)).toBe(1);
  });

  it("does not resolve a dragged delayed turn twice when the drop is corrected from above to below", () => {
    const id = add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 3);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // 3 -> 2, resolved for round 1. Beta is up.
    useEncounter.getState().moveEntry(alpha, entryIdOf("Beta")); // dropped above Beta
    useEncounter.getState().moveEntry(alpha, null); // ...then to the very end, below the pointer again

    expect(order()).toEqual(["Beta", "Gamma", "Alpha"]);

    useEncounter.getState().nextTurn(); // Beta ends
    useEncounter.getState().nextTurn(); // Gamma ends; Alpha takes the delayed turn
    expect(activeName()).toBe("Alpha");
    useEncounter.getState().nextTurn(); // that turn ends

    expect(frightenedOn(id)).toBe(2);
  });

  // One resolution per round, held across three of them, with the delayed
  // turn lapsing in the middle. This is the property the whole mechanism
  // exists to preserve, stated end to end rather than one transition at a
  // time — a delayer must not fall behind the rest of the table, nor get
  // ahead of it.
  it("resolves a mid-order delayer's end-of-turn effects exactly once per round across a delay that lapses", () => {
    add("Alpha", 20);
    const id = add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 5);

    useEncounter.getState().nextTurn(); // Alpha's round-1 turn ends; Beta is up
    useEncounter.getState().delay(entryIdOf("Beta")); // round 1 resolved here: 5 -> 4
    expect(frightenedOn(id)).toBe(4);

    useEncounter.getState().nextTurn(); // Gamma ends, round wraps to 2
    expect(useEncounter.getState().encounter.round).toBe(2);
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends; Beta's own slot — the Delay lapses
    expect(entryOf(entryIdOf("Beta")).delayed).toBe(false);
    expect(frightenedOn(id)).toBe(4); // nothing resolved yet in round 2

    useEncounter.getState().nextTurn(); // Beta's fresh round-2 turn ends: 4 -> 3
    expect(frightenedOn(id)).toBe(3);

    useEncounter.getState().nextTurn(); // Gamma ends, round wraps to 3
    useEncounter.getState().nextTurn(); // Alpha's round-3 turn ends
    useEncounter.getState().nextTurn(); // Beta's round-3 turn ends: 3 -> 2

    expect(useEncounter.getState().encounter.round).toBe(3);
    expect(frightenedOn(id)).toBe(2);
  });

  /*
   * The one case where a Delay lapses *without* the round wrapping, and so
   * the only case where a lapsed turn is suppressed rather than resolved.
   *
   * A delayed entry never moves on its own, and every GM placement of it
   * clears `delayed` — which is why it is tempting to conclude the pointer
   * can only reach its slot by wrapping. It isn't so: moving the *active*
   * entry above the delayed one carries the pointer above it too, and the
   * next advance then walks straight down onto the delayed slot inside the
   * same round.
   *
   * The lapsed turn resolves nothing, because this entry's effects were
   * already resolved this round when it Delayed, and one resolution per
   * round is the whole invariant. Pinned rather than changed: the state that
   * gets here — a placement that hands out a second turn inside one round —
   * is pre-existing behaviour of setInitiative, not something this mechanism
   * introduced, and suppressing is the invariant holding rather than
   * failing. Recorded so the next reader sees it is known, not accidental.
   */
  it("suppresses a lapse that happens inside the round, when moving the active entry carries the pointer past a delayed one", () => {
    add("Alpha", 20);
    const id = add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 5);
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d6");
    const hpAfterDelay = (): number => useEncounter.getState().encounter.combatants[id]!.hp!.current;

    useEncounter.getState().nextTurn(); // Alpha's round-1 turn ends; Beta is up
    useEncounter.getState().delay(entryIdOf("Beta")); // round 1 resolved here: 5 -> 4. Gamma is up.
    expect(frightenedOn(id)).toBe(4);
    const hp = hpAfterDelay();

    // Gamma is acting. Typing an initiative above Beta's takes the pointer
    // with it — Gamma is still the active entry, now at the top.
    useEncounter.getState().setInitiative(entryIdOf("Gamma"), 25);
    expect(order()).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(activeName()).toBe("Gamma");
    expect(useEncounter.getState().encounter.round).toBe(1);

    useEncounter.getState().nextTurn(); // Gamma ends -> Alpha (a second turn for Alpha this round)
    useEncounter.getState().nextTurn(); // Alpha ends -> Beta's slot: the Delay lapses, still round 1

    expect(useEncounter.getState().encounter.round).toBe(1);
    expect(entryOf(entryIdOf("Beta")).delayed).toBe(false);
    expect(activeName()).toBe("Beta");

    useEncounter.getState().nextTurn(); // Beta's lapsed-into turn ends, inside the same round

    // Suppressed: round 1 was already resolved for Beta, at Delay.
    expect(frightenedOn(id)).toBe(4);
    expect(hpAfterDelay()).toBe(hp); // and no second roll of persistent damage
  });

  // A delayer that returns after the round has wrapped takes its turn in a
  // later round than the one Delay resolved, so that turn's end resolves on
  // its own account. The boolean this replaced suppressed it — a cross-wrap
  // return was a free round of persistent damage, which is exactly what
  // RAW's "occur immediately when you use the Delay action" exists to deny.
  it("resolves the end of a delayed turn returned to after the round wrapped", () => {
    add("Alpha", 20);
    const id = add("Beta", 15);
    add("Gamma", 10);
    useEncounter.getState().addCondition(id, "frightened", 5);

    useEncounter.getState().nextTurn(); // Alpha's round-1 turn ends; Beta is up
    useEncounter.getState().delay(entryIdOf("Beta")); // round 1 resolved: 5 -> 4
    expect(frightenedOn(id)).toBe(4);

    useEncounter.getState().nextTurn(); // Gamma ends, round wraps; Alpha leads round 2
    expect(useEncounter.getState().encounter.round).toBe(2);
    expect(entryOf(entryIdOf("Beta")).delayed).toBe(true); // returned, not lapsed

    useEncounter.getState().returnFromDelay(entryIdOf("Beta")); // behind Alpha, in round 2
    useEncounter.getState().nextTurn(); // Alpha's round-2 turn ends; Beta takes its delayed turn
    expect(activeName()).toBe("Beta");
    useEncounter.getState().nextTurn(); // that turn ends — a round on from the one Delay resolved

    expect(frightenedOn(id)).toBe(3);
  });

  it("refuses to Delay while a combatant has no initiative, since Delaying advances the turn", () => {
    add("Alpha", 20);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      null,
    );
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha);

    expect(entryOf(alpha).delayed).toBe(false);
  });

  it("locks a delayed combatant's reactions until it returns", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Akiros Ismort", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 8, will: 6 }, hp: { current: 53, max: 53 },
        reactions: [{ name: "No Escape", trigger: "An adjacent foe moves away." }] },
      20,
    );
    add("Beta", 10);
    render(<TurnManager />);
    expect(screen.getByText("1 ready")).toBeDefined();

    act(() => useEncounter.getState().delay(entryIdOf("Akiros Ismort")));

    // RAW: "You can't use reactions until you return to the initiative order."
    expect(screen.getByText("0 ready")).toBeDefined();

    act(() => useEncounter.getState().returnFromDelay(entryIdOf("Akiros Ismort")));

    expect(screen.getByText("1 ready")).toBeDefined();
  });

  it("delays and returns through the turn panel's own buttons", async () => {
    const user = userEvent.setup();
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /^delay$/i }));
    expect(entryOf(entryIdOf("Alpha")).delayed).toBe(true);
    expect(activeName()).toBe("Beta");

    await user.click(screen.getByRole("button", { name: /next combatant/i })); // Gamma is up
    await user.click(screen.getByRole("button", { name: /return alpha/i }));

    expect(order()).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(entryOf(entryIdOf("Alpha")).delayed).toBe(false);
  });

  // Delaying *is* a turn advance, so the store refuses it while anyone is
  // unrolled, exactly as nextTurn does. A live button over a refusal is the
  // silent no-op this app keeps shipping: the button has to say no for the
  // same reason and in the same way Return already does.
  it("disables the Delay button while a combatant has no initiative, since the store would refuse", () => {
    add("Alpha", 20);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      null,
    );
    render(<TurnManager />);

    expect(screen.getByRole("button", { name: /^delay$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("enables the Delay button once everyone has rolled", () => {
    add("Alpha", 20);
    add("Beta", 15);
    render(<TurnManager />);

    expect(screen.getByRole("button", { name: /^delay$/i }).hasAttribute("disabled")).toBe(false);
  });

  // The two tests below cover Delay's interaction with Entry.trueInitiative —
  // the *other* mechanism in this store that rewrites an initiative at a
  // round wrap ("act this round instead", see AddCombatants). Delay and that
  // feature both move numbers around at wrap time, and they were written a
  // task apart, so this is exactly the seam where each one silently undoes
  // the other.
  it("keeps a returned initiative through the next round wrap, even with an 'act this round' restore still pending", () => {
    add("Alpha", 20);
    add("Beta", 15);
    // Added mid-round the way AddCombatants does it: a lowered slot so the
    // turn order still reaches them today, with the GM's real typed value
    // parked for the wrap to restore.
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Late", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      18, 25,
    );
    const late = entryIdOf("Late");
    expect(entryOf(late).trueInitiative).toBe(25);

    useEncounter.getState().nextTurn(); // Alpha acts; Late is up at its temporary slot
    useEncounter.getState().delay(late); // Beta is up
    useEncounter.getState().returnFromDelay(late);
    expect(entryOf(late).initiative).toBe(15);
    expect(entryOf(late).orderKey).toBe(14);

    useEncounter.getState().nextTurn(); // Late takes its returned turn
    useEncounter.getState().nextTurn(); // round wraps

    // RAW: returning "permanently changes your initiative". A pending
    // trueInitiative left armed would restore 25 over the top of it here,
    // putting Late back at the head of the order with a struck-through 18
    // beside a live 25 that describes nothing that ever happened.
    expect(useEncounter.getState().encounter.round).toBe(2);
    const back = entryOf(late);
    expect(back.initiative).toBe(15);
    expect(back.orderKey).toBe(14);
    expect(back.trueInitiative).toBeNull();
    expect(back.initiativeBeforeDelay).toBe(18);
    expect(order()).toEqual(["Alpha", "Beta", "Late"]);
  });

  it("does not let a pending 'act this round' restore cut a Delay short at the wrap", () => {
    add("Alpha", 20);
    add("Beta", 15);
    // Same mid-round add, but slotted below everyone, so this entry is last
    // in the order — the case where a wrap-time re-sort would float it to
    // index 0 and expire its Delay with no turns in between at all.
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Late", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      10, 25,
    );
    const late = entryIdOf("Late");

    useEncounter.getState().nextTurn(); // Beta
    useEncounter.getState().nextTurn(); // Late, last in the order
    expect(activeName()).toBe("Late");

    useEncounter.getState().delay(late); // wraps the round immediately

    // Delaying as the last entry must still buy a full round. Restoring
    // trueInitiative here would re-sort Late to the top and clear `delayed`
    // on the very same advance — Delay as a no-op, which is the failure the
    // slot-based expiry rule exists to prevent.
    expect(useEncounter.getState().encounter.round).toBe(2);
    expect(entryOf(late).delayed).toBe(true);
    expect(activeName()).toBe("Alpha");
    expect(entryOf(late).initiative).toBe(10); // restore deferred, not lost

    useEncounter.getState().nextTurn(); // Beta
    useEncounter.getState().nextTurn(); // Late's own slot, one full round on

    expect(entryOf(late).delayed).toBe(false);
    expect(activeName()).toBe("Late");

    // And the deferred restore still happens, one wrap later than it would
    // have: the entry was out of the order for that round, so its real typed
    // initiative takes over at the next wrap instead.
    useEncounter.getState().nextTurn(); // wraps into round 3
    expect(useEncounter.getState().encounter.round).toBe(3);
    expect(entryOf(late).initiative).toBe(25);
    expect(entryOf(late).trueInitiative).toBeNull();
  });

  // The record of what a return replaced exists for one purpose: the row
  // shows it struck through beside the new number. A typed initiative
  // overwrites that new number by hand, so the record now describes
  // something that is no longer on the row at all — leave it and the GM sees
  // a struck-through initiative with nothing to do with what they just
  // typed. moveEntry has its own test for exactly this leak; setInitiative
  // had none, and deleting the line left every test green.
  it("clears the struck-through pre-delay initiative once the GM types a new one over the returned value", () => {
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    const alpha = entryIdOf("Alpha");

    useEncounter.getState().delay(alpha); // Beta is up
    useEncounter.getState().returnFromDelay(alpha); // returns at Beta's 15; 20 kept as the record
    expect(entryOf(alpha).initiativeBeforeDelay).toBe(20);

    useEncounter.getState().setInitiative(alpha, 4);

    expect(entryOf(alpha).initiativeBeforeDelay).toBeNull();

    // And nothing struck through is left on the row to explain.
    render(<CombatantList />);
    expect(screen.queryByText("20")).toBeNull();
  });

  it("treats a GM typing a new initiative for a delayed combatant as a manual return", () => {
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    const alpha = entryIdOf("Alpha");
    useEncounter.getState().delay(alpha); // Beta is up
    expect(entryOf(alpha).delayed).toBe(true);

    useEncounter.getState().setInitiative(alpha, 12);

    // Naming a position IS rejoining the order at it — the same thing
    // returning does, just chosen by hand rather than triggered by a turn
    // ending. Leaving `delayed` set here would also move a delayed entry,
    // and the expiry rule reads position as elapsed time: Alpha would sit
    // one slot below the active entry and have its Delay expire on the very
    // next advance, a single turn instead of a full round.
    const edited = entryOf(alpha);
    expect(edited.delayed).toBe(false);
    expect(edited.initiative).toBe(12);
    expect(edited.orderKey).toBe(12);
    expect(order()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(activeName()).toBe("Beta"); // the edit must not steal the turn

    useEncounter.getState().nextTurn();

    // An ordinary turn at the slot the GM named, not an expiring Delay.
    expect(activeName()).toBe("Alpha");
    expect(entryOf(alpha).delayed).toBe(false);
  });

  it("strikes a delayed group's shared initiative through on its header", () => {
    const g1 = add("Goblin 1", 12);
    const g2 = add("Goblin 2", 12);
    add("Beta", 8);
    useEncounter.getState().group([g1, g2], "Goblins", 12);
    // Grouping the active entry's only combatant hands the turn to the new
    // group entry, so the group is the one that can Delay.
    const goblins = useEncounter.getState().encounter.entries.find((e) => e.groupName === "Goblins")!;
    useEncounter.getState().delay(goblins.id);

    render(<CombatantList />);

    // A group is a single turn-order entry, so it Delays as a unit — and its
    // header is the only place its initiative is shown, since group members
    // render without one of their own.
    expect(screen.getByText("12").style.textDecoration).toBe("line-through");
  });

  it("shows the pre-delay initiative struck through on the row", () => {
    add("Alpha", 20);
    add("Beta", 15);
    useEncounter.getState().delay(entryIdOf("Alpha"));

    render(<CombatantList />);

    // While delayed the combatant holds no position at all, so the row's own
    // initiative is what reads as struck out.
    expect(screen.getByText("20").style.textDecoration).toBe("line-through");
  });

  it("keeps the pre-delay initiative visible, struck through, after returning", () => {
    add("Alpha", 20);
    add("Beta", 15);
    add("Gamma", 10);
    const alpha = entryIdOf("Alpha");
    useEncounter.getState().delay(alpha);
    useEncounter.getState().nextTurn();
    useEncounter.getState().returnFromDelay(alpha);

    render(<CombatantList />);

    // Now there are two numbers on Alpha's row: the live 10 it returned at
    // and the struck-through 20 it left behind. This is the assertion that
    // stops initiativeBeforeDelay being stored and never shown — the defect
    // this codebase has shipped six times.
    const parked = screen.getByText("20");
    expect(parked.style.textDecoration).toBe("line-through");
    expect(parked.style.fontSize).toBe("11px");
    expect(screen.getAllByText("10")).toHaveLength(2); // Gamma's, and Alpha's new one
  });
});
