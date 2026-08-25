# Initiative, Order and Delay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make initiative something a combatant can genuinely not have yet, give the turn order an explicit sort key so rows can be placed between neighbours, and implement PF2's Delay action on top of it.

**Architecture:** `Entry.initiative` becomes nullable and stops being the sort key; a new `Entry.orderKey` takes that job so "return immediately after this creature" and a manual drag can both express placement. Delay parks the original initiative, locks reactions, and either rewrites initiative on return or restores it when the round wraps. Players reach the order through Quick add instead of the Party drawer.

**Tech Stack:** TypeScript, React 19, zustand + immer, vitest + @testing-library/react, vite.

**Spec:** `docs/superpowers/specs/2026-08-25-initiative-delay-conditions-design.md`

## Global Constraints

- `SCHEMA_VERSION` stays **1**. No migration. Readers default missing fields: `orderKey ?? initiative ?? 0`.
- Sort order is `orderKey` descending. Unrolled entries (`initiative === null`) sort **above** everything.
- Delay follows RAW (Player Core p. 416), quoted in the spec. Returning **permanently** rewrites initiative.
- Never `git checkout` in `/Users/olivier/dev/pf2-combat-tracker` — another agent works in that tree. Work in a worktree; push explicit `<sha>:main` refspecs.
- Run the worktree's own `npm install`. A symlinked `node_modules` resolves `@pf2/*` to the shared checkout and silently tests another branch.
- jsdom does no layout and no hit-testing. Anything positional is verified in a real browser before the task is called done.

---

### Task 1: `orderKey` becomes the sort key

**Files:**
- Modify: `packages/app/src/state/types.ts` (`Entry`)
- Modify: `packages/app/src/state/store.ts:104-108` (`sortEntries`), and every `enc.entries.push({...})` site
- Test: `packages/app/test/store.test.ts`

**Interfaces:**
- Produces: `Entry.orderKey: number`; `sortEntries(entries: Entry[]): void` now sorting on `orderKey`.

- [ ] **Step 1: Write the failing test**

```ts
it("sorts by orderKey, so an entry can be placed between two equal initiatives", () => {
  const s = useEncounter.getState();
  s.addCombatant(seed({ name: "Alpha" }), 20);
  s.addCombatant(seed({ name: "Beta" }), 20);
  const [alpha, beta] = useEncounter.getState().encounter.entries;
  expect(alpha!.orderKey).toBe(20);
  expect(beta!.orderKey).toBe(20);

  // Placed between them without touching either initiative.
  useEncounter.setState((st) => {
    st.encounter.entries[1]!.orderKey = 19.5;
    return st;
  });
  useEncounter.getState().addCombatant(seed({ name: "Gamma" }), 20);
  const names = useEncounter.getState().encounter.entries
    .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
  expect(names).toEqual(["Alpha", "Gamma", "Beta"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/store.test.ts -t "sorts by orderKey"`
Expected: FAIL — `alpha.orderKey` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `types.ts`, add to `Entry`:

```ts
  /** Sort key for the turn order, distinct from the displayed initiative.
   * Starts equal to `initiative` and is reset to it whenever an initiative
   * is set. Delay's return and a manual drag both assign a value *between*
   * two neighbours, which equal integer initiatives plus a stable sort
   * cannot express. */
  orderKey: number;
```

In `store.ts`, replace `sortEntries`:

```ts
/** Entries sort by `orderKey` descending, with unrolled entries (no
 * initiative yet) above everything so the GM sees what still needs rolling.
 * `orderKey` is defaulted from `initiative` for any entry persisted before
 * the field existed — SCHEMA_VERSION deliberately did not move. */
function keyOf(e: Entry): number {
  return e.orderKey ?? e.initiative ?? 0;
}

function sortEntries(entries: Entry[]): void {
  entries.sort((a, b) => {
    if ((a.initiative === null) !== (b.initiative === null)) return a.initiative === null ? -1 : 1;
    return keyOf(b) - keyOf(a);
  });
}
```

Add `orderKey: initiative` to every `enc.entries.push({...})` in `addCombatant`, `addMany` and `group`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app/test/store.test.ts`
Expected: PASS, and every existing store test still green.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/state packages/app/test/store.test.ts
git commit -m "Sort the turn order by an explicit orderKey"
```

---

### Task 2: Initiative can be absent

**Files:**
- Modify: `packages/app/src/state/types.ts` (`Entry.initiative`)
- Modify: `packages/app/src/state/store.ts` (`addCombatant`, `addMany`, `setInitiative`, `group` signatures)
- Modify: `packages/app/src/components/CombatantRow.tsx:270-283`, `packages/app/src/components/GroupHeader.tsx`
- Test: `packages/app/test/combatant-row-layout.test.tsx`

**Interfaces:**
- Consumes: `Entry.orderKey` (Task 1).
- Produces: `Entry.initiative: number | null`; `addCombatant(seed, initiative: number | null, trueInitiative?)`.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders an em dash, not a zero, for a combatant with no initiative yet", () => {
  useEncounter.getState().addCombatant(seed(), null);
  render(<CombatantList />);
  expect(screen.getByText("—")).toBeDefined();
  expect(screen.queryByText("0")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/combatant-row-layout.test.tsx -t "em dash"`
Expected: FAIL — a `0` renders and no `—` exists.

- [ ] **Step 3: Write minimal implementation**

`types.ts`: `initiative: number | null;`

`store.ts`: widen the three signatures to `number | null`. In the push sites, `orderKey: initiative ?? 0`.

`CombatantRow.tsx`, `StandaloneRow`: the initiative cell renders `{initiative === null ? "—" : initiative}`. Widen the prop to `initiative?: number | null`. Do the same in `GroupHeader.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS. Fix any call site the widened type breaks.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Show an em dash for an unrolled initiative instead of writing 0"
```

---

### Task 3: Advancing is blocked while anyone is unrolled

**Files:**
- Modify: `packages/app/src/state/store.ts:349` (`nextTurn`)
- Modify: `packages/app/src/components/TurnManager.tsx`
- Test: `packages/app/test/turn-manager.test.tsx`

**Interfaces:**
- Consumes: `Entry.initiative: number | null` (Task 2).
- Produces: `unrolledCount(enc: Encounter): number`, exported from `store.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
it("refuses to advance the turn while a combatant has no initiative, and says how many", async () => {
  const user = userEvent.setup();
  useEncounter.getState().addCombatant(seed({ name: "Alpha" }), 20);
  useEncounter.getState().addCombatant(seed({ name: "Beta" }), null);
  render(<TurnManager />);

  const before = useEncounter.getState().encounter.activeEntryIndex;
  await user.click(screen.getByRole("button", { name: /next combatant/i }));

  expect(useEncounter.getState().encounter.activeEntryIndex).toBe(before);
  expect(screen.getByText(/1 combatant has no initiative/i)).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/turn-manager.test.tsx -t "refuses to advance"`
Expected: FAIL — the index advances and no message renders.

- [ ] **Step 3: Write minimal implementation**

In `store.ts`:

```ts
/** How many entries still have no rolled initiative. A fight where someone
 * never rolled is a mistake to surface, not to route around, so `nextTurn`
 * refuses rather than skipping them. */
export function unrolledCount(enc: Encounter): number {
  return enc.entries.filter((e) => e.initiative === null).length;
}
```

First line of `nextTurn`'s `set` callback, after the empty check:

```ts
        if (unrolledCount(enc) > 0) return;
```

In `TurnManager.tsx`, read the count and render beside Next when non-zero:

```tsx
  const unrolled = useEncounter((s) => unrolledCount(s.encounter));
  ...
  {unrolled > 0 && (
    <span style={{ fontSize: "11.5px", color: "var(--danger)" }}>
      {unrolled} combatant{unrolled === 1 ? " has" : "s have"} no initiative
    </span>
  )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app/test/turn-manager.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Block advancing the turn while a combatant is unrolled"
```

---

### Task 4: Plumb the initiative modifier

**Files:**
- Modify: `packages/app/src/state/types.ts` (`Combatant`, `Player`)
- Modify: `packages/app/src/components/AddCombatants.tsx:18-24` (`toIwr` neighbourhood, `seedFromEntry`)
- Modify: `packages/app/src/state/store.ts` (`makeCombatant`, `CombatantSeed`)
- Test: `packages/app/test/add-combatants.test.tsx`

**Interfaces:**
- Produces: `Combatant.initiativeModifier: number | null`, `Combatant.playerId?: string`, `Player.initiativeModifier: number | null`.

- [ ] **Step 1: Write the failing test**

```tsx
it("carries the creature's perception onto the combatant as its initiative modifier", async () => {
  const creature = await loadRealCreature("pathfinder-monster-core/forest-troll");
  const seed = seedFromEntry(entryFor(creature), creature);
  expect(seed.initiativeModifier).toBe(creature.perception);
});
```

Use the existing dataset-loading helper at the top of `add-combatants.test.tsx` rather than a hand-written fixture — the point is that the real record's shape works.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/add-combatants.test.tsx -t "perception"`
Expected: FAIL — `initiativeModifier` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

`types.ts`, on `Combatant`:

```ts
  /** What gets added to the die when rolling initiative. Creatures use
   * Perception; a PC's lives on the roster (`Player.initiativeModifier`)
   * so it survives between fights. Null when unknown. */
  initiativeModifier: number | null;
  /** Set on `kind: "pc"` combatants: which roster player this is. Lets a
   * modifier entered mid-fight be written back, and lets Quick add know who
   * is already in the order. */
  playerId?: string;
```

`Player`: `initiativeModifier: number | null;`

`seedFromEntry`: add `initiativeModifier: creature?.perception ?? null`. `makeCombatant`: default `initiativeModifier: seed.initiativeModifier ?? null` and pass `playerId` through.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Carry an initiative modifier onto combatants and players"
```

---

### Task 5: Roll initiative from the popover

**Files:**
- Modify: `packages/app/src/components/RowPopover.tsx:256-278` (the Initiative input)
- Test: `packages/app/test/combatant-list.test.tsx`

**Interfaces:**
- Consumes: `Combatant.initiativeModifier`, `Player.initiativeModifier` (Task 4); `setInitiative` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
it("adds the combatant's modifier to the die result and commits the total", async () => {
  const user = userEvent.setup();
  const id = useEncounter.getState().addCombatant({ ...seed(), initiativeModifier: 7 }, null);
  render(<CombatantList />);
  await user.hover(screen.getByText("Stag Lord Bandit"));

  await user.type(screen.getByLabelText("Initiative die result"), "12");
  expect(screen.getByText("12 + 7 = 19")).toBeDefined();

  await user.click(screen.getByRole("button", { name: /set initiative/i }));
  const entry = useEncounter.getState().encounter.entries.find((e) => e.combatantIds.includes(id));
  expect(entry!.initiative).toBe(19);
  expect(entry!.orderKey).toBe(19);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/combatant-list.test.tsx -t "adds the combatant's modifier"`
Expected: FAIL — no field named "Initiative die result".

- [ ] **Step 3: Write minimal implementation**

Replace the popover's Initiative input with a die-result field, a live `roll + mod = total` readout and a Set button. Keep the existing behaviour when `initiativeModifier === null`: the readout shows the die result alone and the Set button commits it unchanged.

For a `kind: "pc"` combatant whose player has no modifier yet, render a one-time inline field ("Initiative modifier for {name}") and, on commit, `setPlayers` with that player patched — so the next fight already knows it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Verify in a real browser**

Start the app, add a Forest Troll, hover its row, type a die result, confirm the readout and that the row's initiative updates. jsdom cannot show you the popover is reachable — this app has shipped two bugs of exactly that kind.

- [ ] **Step 6: Commit**

```bash
git add packages/app
git commit -m "Roll initiative from the popover: die result plus modifier"
```

---

### Task 6: Present players appear in Quick add

**Files:**
- Modify: `packages/app/src/components/QuickAdd.tsx:99-170`
- Modify: `packages/app/src/components/PartyManager.tsx:243-280` (remove the Initiative field and Add button)
- Test: `packages/app/test/quick-add.test.tsx`, `packages/app/test/party-manager.test.tsx`

**Interfaces:**
- Consumes: `Combatant.playerId` (Task 4), nullable initiative (Task 2).
- Produces: `type QuickAddOption = { kind: "player"; player: Player } | { kind: "creature"; entry: IndexEntry }`.

- [ ] **Step 1: Write the failing test**

```tsx
it("lists present players before any typing, and drops them once they are in the order", async () => {
  const user = userEvent.setup();
  useEncounter.getState().setPlayers([
    { id: "p1", name: "Valeros", level: 1, ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 },
      present: true, initiativeModifier: 6 },
  ]);
  render(<QuickAdd entries={[]} />);

  await user.click(screen.getByLabelText("Quick add creatures"));
  await user.click(await screen.findByRole("option", { name: /Valeros/ }));

  const combatants = Object.values(useEncounter.getState().encounter.combatants);
  expect(combatants[0]!.playerId).toBe("p1");
  expect(useEncounter.getState().encounter.entries[0]!.initiative).toBeNull();

  await user.click(screen.getByLabelText("Quick add creatures"));
  expect(screen.queryByRole("option", { name: /Valeros/ })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/quick-add.test.tsx -t "lists present players"`
Expected: FAIL — focusing the empty field opens no dropdown.

- [ ] **Step 3: Write minimal implementation**

Build the option list as the union type above. Present players with no matching `playerId` among current combatants come first, unconditionally when `parsed.nameQuery` is empty and the field has focus; when there is a query, filter them by name and keep them ahead of every creature match. `showDropdown` gains `|| (focused && playerOptions.length > 0)`.

Committing a player option calls `addCombatant({ kind: "pc", name, hp, ac, saves, level, playerId: p.id, initiativeModifier: p.initiativeModifier }, null)`.

In `PartyManager.tsx`, delete the `p.present && (...)` block holding the Initiative label and the "Add to encounter" button, and the now-unused `initiatives` state and `addToEncounter`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS. `party-manager.test.tsx` will have assertions on the removed button — update them to assert it is gone.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Add present players from Quick add; drop the Party drawer's add path"
```

---

### Task 7: Turn boundaries fire condition hooks

**Files:**
- Create: nothing
- Modify: `packages/app/src/rules/conditions.ts` (add `applyEndOfTurn`)
- Modify: `packages/app/src/state/store.ts` (`nextTurn`)
- Test: `packages/app/test/conditions.test.ts`, `packages/app/test/turn-manager.test.tsx`

**Interfaces:**
- Produces: `applyEndOfTurn(conditions: AppliedCondition[]): { conditions: AppliedCondition[]; persistentDamage: number }`.

`ConditionDef.startOfTurn` and `.endOfTurn` are declared today and consumed **nowhere**. This task is the first thing that reads them; Task 8 (Delay) is the second caller.

- [ ] **Step 1: Write the failing test**

```ts
it("decrements frightened at end of turn and reports persistent damage once", () => {
  const result = applyEndOfTurn([
    { slug: "frightened", value: 2 },
    { slug: "persistent-damage", value: 0, formula: "1d6" },
  ]);
  expect(result.conditions.find((c) => c.slug === "frightened")!.value).toBe(1);
  expect(result.persistentDamage).toBeGreaterThan(0);
});

it("removes frightened entirely when it ticks past 0", () => {
  const result = applyEndOfTurn([{ slug: "frightened", value: 1 }]);
  expect(result.conditions.find((c) => c.slug === "frightened")).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/conditions.test.ts -t "end of turn"`
Expected: FAIL — `applyEndOfTurn` is not exported.

- [ ] **Step 3: Write minimal implementation**

Implement `applyEndOfTurn` reading `CONDITIONS[c.slug].endOfTurn`: `"decrement"` lowers the value and drops the condition at 0; `"persistent-damage"` rolls `c.formula` and accumulates. Then call it in `nextTurn` for the combatants whose turn is **ending** (the entry at the old `activeEntryIndex`), applying the damage through the same path `applyDamage` uses.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Fire end-of-turn condition hooks on turn advance"
```

---

### Task 8: Delay and Return

**Files:**
- Modify: `packages/app/src/state/types.ts` (`Entry`)
- Modify: `packages/app/src/state/store.ts` (`delay`, `returnFromDelay`, `nextTurn`)
- Modify: `packages/app/src/components/TurnManager.tsx`
- Modify: `packages/app/src/components/ReactionWatch.tsx:21`
- Test: `packages/app/test/turn-manager.test.tsx`

**Interfaces:**
- Consumes: `orderKey` (Task 1), `applyEndOfTurn` (Task 7).
- Produces: `Entry.delayed: boolean`, `Entry.initiativeBeforeDelay: number | null`, store actions `delay(entryId)` and `returnFromDelay(entryId)`.

- [ ] **Step 1: Write the failing test**

```tsx
it("places a returning combatant immediately after whoever just acted, and rewrites its initiative", () => {
  const s = useEncounter.getState();
  s.addCombatant(seed({ name: "Alpha" }), 20);
  s.addCombatant(seed({ name: "Beta" }), 15);
  s.addCombatant(seed({ name: "Gamma" }), 10);

  const alpha = useEncounter.getState().encounter.entries[0]!;
  useEncounter.getState().delay(alpha.id);
  expect(useEncounter.getState().encounter.entries.find((e) => e.id === alpha.id)!.delayed).toBe(true);

  useEncounter.getState().nextTurn(); // Gamma's turn ends
  useEncounter.getState().returnFromDelay(alpha.id);

  const order = useEncounter.getState().encounter.entries
    .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
  expect(order).toEqual(["Beta", "Gamma", "Alpha"]);
  // RAW: returning permanently changes initiative; the original is kept only for display.
  const back = useEncounter.getState().encounter.entries.find((e) => e.id === alpha.id)!;
  expect(back.initiative).toBe(10);
  expect(back.initiativeBeforeDelay).toBe(20);
  expect(back.delayed).toBe(false);
});

it("loses the turn and restores the original slot when a delayed round wraps", () => {
  const s = useEncounter.getState();
  s.addCombatant(seed({ name: "Alpha" }), 20);
  s.addCombatant(seed({ name: "Beta" }), 15);
  const alpha = useEncounter.getState().encounter.entries[0]!;

  useEncounter.getState().delay(alpha.id);
  useEncounter.getState().nextTurn();
  useEncounter.getState().nextTurn(); // round wraps

  const back = useEncounter.getState().encounter.entries.find((e) => e.id === alpha.id)!;
  expect(back.delayed).toBe(false);
  expect(back.initiative).toBe(20);
  expect(useEncounter.getState().encounter.entries[0]!.id).toBe(alpha.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/turn-manager.test.tsx -t "delay"`
Expected: FAIL — `delay` is not a function on the store.

- [ ] **Step 3: Write minimal implementation**

`Entry` gains `delayed: boolean` and `initiativeBeforeDelay: number | null` (default `false` / `null` at every push site).

`delay(entryId)`: run `applyEndOfTurn` for that entry's combatants and apply the damage immediately — this is what stops Delay dodging persistent damage — then set `delayed = true`, `initiativeBeforeDelay = initiative`, and advance the turn.

`returnFromDelay(entryId)`: let `active` be the entry whose turn just ended. Set `initiative = active.initiative`, `orderKey = midpoint between active.orderKey and the next entry below it` (or `active.orderKey - 1` when it is last), `delayed = false`. Keep `initiativeBeforeDelay`. Re-sort, preserving the active entry's identity the way `addCombatant` does.

In `nextTurn`'s round-wrap branch, before the existing `trueInitiative` restore: for every entry with `delayed`, restore `initiative` and `orderKey` from `initiativeBeforeDelay`, clear `delayed`, and leave `actionsSpent` untouched — the actions are lost by never having been available.

`ReactionWatch.tsx:21`: extend the filter so a combatant in a delayed entry is excluded.

`TurnManager.tsx`: a **Delay** button beside Next for the active entry; a **Return** button for each delayed entry, enabled once a turn has ended.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Verify in a real browser**

Three combatants, Delay the first, advance, Return. Confirm the row lands after the creature that just acted, shows its original initiative struck through, and that its reactions read as locked while delayed.

- [ ] **Step 6: Commit**

```bash
git add packages/app
git commit -m "Implement Delay and Return per RAW"
```

---

### Task 9: Manual drag reordering

**Files:**
- Modify: `packages/app/src/components/CombatantRow.tsx`, `packages/app/src/components/CombatantList.tsx`
- Modify: `packages/app/src/state/store.ts` (`moveEntry`)
- Test: `packages/app/test/combatant-list.test.tsx`

**Interfaces:**
- Consumes: `orderKey` (Task 1).
- Produces: `moveEntry(entryId: string, beforeEntryId: string | null): void`.

- [ ] **Step 1: Write the failing test**

```ts
it("moves an entry between two neighbours without touching any initiative", () => {
  const s = useEncounter.getState();
  s.addCombatant(seed({ name: "Alpha" }), 20);
  s.addCombatant(seed({ name: "Beta" }), 15);
  s.addCombatant(seed({ name: "Gamma" }), 10);
  const [, , gamma] = useEncounter.getState().encounter.entries;

  useEncounter.getState().moveEntry(gamma!.id, useEncounter.getState().encounter.entries[1]!.id);

  const order = useEncounter.getState().encounter.entries
    .map((e) => useEncounter.getState().encounter.combatants[e.combatantIds[0]!]!.name);
  expect(order).toEqual(["Alpha", "Gamma", "Beta"]);
  expect(useEncounter.getState().encounter.entries.map((e) => e.initiative)).toEqual([20, 10, 15]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/combatant-list.test.tsx -t "moves an entry"`
Expected: FAIL — `moveEntry` is not a function.

- [ ] **Step 3: Write minimal implementation**

`moveEntry(entryId, beforeEntryId)` sets the moved entry's `orderKey` to the midpoint between the entry it lands after and the one it lands before; at the ends, that neighbour's key ±1. It never touches `initiative` or `delayed`. Re-sort.

Add a drag handle to the row (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) calling `moveEntry`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Verify in a real browser**

jsdom does not implement drag-and-drop meaningfully. Drag a row in a real browser and confirm it lands where dropped and that the initiative numbers do not change.

- [ ] **Step 6: Commit and push**

```bash
git add packages/app
git commit -m "Let the GM drag a combatant to any position in the order"
git push origin HEAD:main
```
