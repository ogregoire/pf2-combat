# Condition Picker and Linked Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dropdown-and-Add-button condition flow with a one-click tag picker over every combat-relevant condition, and make dying, wounded, doomed and 0 HP behave the way PF2 says they do.

**Architecture:** `rules/conditions.ts` grows from a curated 22 to 38 conditions and gains pure functions for the linked rules; `state/store.ts` calls them at named sites. The popover's condition section becomes two rows of tags — applied on top with steppers, the rest below.

**Tech Stack:** TypeScript, React 19, zustand + immer, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-25-initiative-delay-conditions-design.md`

## Global Constraints

- Every condition in `data/conditions.json` is pickable **except** the five attitudes (friendly, helpful, indifferent, unfriendly, hostile), which are excluded outright: 38 of 43.
- A rule that is written but never invoked is the defect this codebase keeps repeating. Every task here names its store call site and tests through it, not just through the pure function.
- `applyEndOfTurn` and the turn-boundary wiring belong to the initiative/order plan (Task 7 there). Run that plan first, or this plan's end-of-turn assumptions have no caller.
- Never `git checkout` in `/Users/olivier/dev/pf2-combat-tracker` — another agent works there. Use a worktree with its own `npm install`.

---

### Task 1: Widen the condition set

**Files:**
- Modify: `packages/app/src/rules/conditions.ts:14-20` (`ConditionSlug`), `:52-158` (`CONDITIONS`)
- Test: `packages/app/test/conditions.test.ts`

**Interfaces:**
- Produces: 16 new `ConditionSlug` members and their `ConditionDef`s; `PICKABLE_CONDITIONS: ConditionDef[]`.

- [ ] **Step 1: Write the failing test**

```ts
it("offers every dataset condition except the five attitudes", async () => {
  const dataset: Condition[] = JSON.parse(
    readFileSync(resolve(__dirname, "../../../data/conditions.json"), "utf8"),
  );
  const attitudes = ["friendly", "helpful", "indifferent", "unfriendly", "hostile"];
  const expected = dataset
    .map((c) => c.name.toLowerCase().replace(/ /g, "-"))
    .filter((slug) => !attitudes.includes(slug));

  const offered = PICKABLE_CONDITIONS.map((c) => c.slug).sort();
  expect(offered).toEqual([...expected].sort());
});

it("gives unconscious a real effect rather than listing it inert", () => {
  expect(CONDITIONS.unconscious.affects(0)).not.toBeNull();
  expect(CONDITIONS.dying.implies).toContain("unconscious");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/conditions.test.ts -t "every dataset condition"`
Expected: FAIL — `PICKABLE_CONDITIONS` is not exported and only 22 slugs exist.

- [ ] **Step 3: Write minimal implementation**

Add to `ConditionSlug` and `CONDITIONS`: `unconscious`, `paralyzed`, `petrified`, `fleeing`, `confused`, `invisible`, `concealed`, `hidden`, `undetected`, `encumbered`, `fascinated`, `broken`, `controlled`, `cursebound`, `observed`, `unnoticed`.

Give each an `affects` that reflects its rules text — e.g. `unconscious` is unvalued, `implies: ["off-guard", "prone"]`, and takes the −4 to AC and saves its entry describes; `concealed` and `invisible` carry their DC-5/DC-11 flat-check nature as `affects: () => null` with the effect documented in a comment, since a flat check is not a modifier on a selector. Do not invent numbers: read each condition's `description` in `data/conditions.json` and encode only what it states.

Add `dying.implies = ["unconscious"]`.

```ts
/** Everything the GM can apply from the popover: the whole dataset minus
 * the attitude ladder, which describes an NPC's disposition and changes no
 * number in a fight. */
export const PICKABLE_CONDITIONS: ConditionDef[] = Object.values(CONDITIONS)
  .sort((a, b) => compareStrings(a.name, b.name));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app/test/conditions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Widen the condition set to every combat-relevant dataset condition"
```

---

### Task 2: Dying, wounded and doomed

**Files:**
- Modify: `packages/app/src/rules/conditions.ts`
- Modify: `packages/app/src/state/store.ts:300-318` (`addCondition`, `removeCondition`)
- Test: `packages/app/test/conditions.test.ts`, `packages/app/test/store.test.ts`

**Interfaces:**
- Produces: `dyingMax(conditions: AppliedCondition[]): number`, `dyingOnGain(conditions: AppliedCondition[], amount: number): AppliedCondition[]`, `woundedOnRecover(conditions: AppliedCondition[]): AppliedCondition[]`.

- [ ] **Step 1: Write the failing test**

```ts
it("adds the wounded value when dying is gained", () => {
  const after = dyingOnGain([{ slug: "wounded", value: 2 }], 1);
  expect(after.find((c) => c.slug === "dying")!.value).toBe(3);
});

it("caps dying at 4 minus doomed", () => {
  expect(dyingMax([])).toBe(4);
  expect(dyingMax([{ slug: "doomed", value: 1 }])).toBe(3);
});

it("raises wounded by one when dying is removed", () => {
  const after = woundedOnRecover([{ slug: "dying", value: 2 }, { slug: "wounded", value: 1 }]);
  expect(after.find((c) => c.slug === "dying")).toBeUndefined();
  expect(after.find((c) => c.slug === "wounded")!.value).toBe(2);
});
```

Then the wiring test, which is the one that matters:

```ts
it("applies the wounded bump through the store, not just in the rules module", () => {
  const id = useEncounter.getState().addCombatant(seed(), 20);
  useEncounter.getState().addCondition(id, "wounded", 2);
  useEncounter.getState().addCondition(id, "dying", 1);
  const c = useEncounter.getState().encounter.combatants[id]!;
  expect(c.conditions.find((x) => x.slug === "dying")!.value).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test -t "dying"`
Expected: FAIL — the functions are not exported and `addCondition` stores the raw value.

- [ ] **Step 3: Write minimal implementation**

Write the three pure functions, then call them from the store: `addCondition` routes `slug === "dying"` through `dyingOnGain` and clamps to `dyingMax`; reaching the cap sets `defeated = true`. `removeCondition` routes `slug === "dying"` through `woundedOnRecover`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Model the dying, wounded and doomed loop"
```

---

### Task 3: Zero HP

**Files:**
- Modify: `packages/app/src/rules/conditions.ts`
- Modify: `packages/app/src/state/store.ts` (`applyDamage`, `applyHealing`)
- Test: `packages/app/test/store.test.ts`

**Interfaces:**
- Consumes: `dyingOnGain`, `woundedOnRecover` (Task 2).
- Produces: `onDroppedToZero(c: Combatant): AppliedCondition[]`, `onHealedAboveZero(c: Combatant): AppliedCondition[]`.

- [ ] **Step 1: Write the failing test**

```ts
it("starts a PC dying at 0 HP but marks a creature defeated", () => {
  const pc = useEncounter.getState().addCombatant({ ...seed(), kind: "pc" }, 20);
  useEncounter.getState().applyDamage(pc, 999);
  const pcAfter = useEncounter.getState().encounter.combatants[pc]!;
  expect(pcAfter.conditions.find((c) => c.slug === "dying")!.value).toBe(1);
  expect(pcAfter.conditions.some((c) => c.slug === "unconscious")).toBe(true);
  expect(pcAfter.defeated).toBe(false);

  const monster = useEncounter.getState().addCombatant(seed(), 19);
  useEncounter.getState().applyDamage(monster, 999);
  const monsterAfter = useEncounter.getState().encounter.combatants[monster]!;
  expect(monsterAfter.defeated).toBe(true);
  expect(monsterAfter.conditions.some((c) => c.slug === "dying")).toBe(false);
});

it("clears dying when a PC is healed above 0", () => {
  const pc = useEncounter.getState().addCombatant({ ...seed(), kind: "pc" }, 20);
  useEncounter.getState().applyDamage(pc, 999);
  useEncounter.getState().applyHealing(pc, 5);
  const after = useEncounter.getState().encounter.combatants[pc]!;
  expect(after.conditions.some((c) => c.slug === "dying")).toBe(false);
  expect(after.conditions.find((c) => c.slug === "wounded")!.value).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/store.test.ts -t "0 HP"`
Expected: FAIL — damage sets HP to 0 and nothing else happens.

- [ ] **Step 3: Write minimal implementation**

At the end of `applyDamage`, when `hp.current` reaches 0: `kind === "pc"` runs `onDroppedToZero` (dying via `dyingOnGain`, plus unconscious); anything else sets `defeated = true`. At the end of `applyHealing`, when `hp.current` rises above 0 and dying is present, run `onHealedAboveZero` (which is `woundedOnRecover` plus dropping unconscious).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "Apply the 0 HP rules: dying for PCs, defeated for creatures"
```

---

### Task 4: The condition picker

**Files:**
- Modify: `packages/app/src/components/RowPopover.tsx:471-579` (the whole "Add condition" section)
- Test: `packages/app/test/combatant-list.test.tsx`

**Interfaces:**
- Consumes: `PICKABLE_CONDITIONS` (Task 1); `addCondition`, `removeCondition`.

- [ ] **Step 1: Write the failing test**

```tsx
it("applies a condition in one click and steps its value without dropping below zero", async () => {
  const user = userEvent.setup();
  const id = useEncounter.getState().addCombatant(seed(), 19);
  render(<CombatantList />);
  await user.hover(screen.getByText("Stag Lord Bandit"));

  // One click, no dropdown, no Add button.
  await user.click(screen.getByRole("button", { name: "Frightened" }));
  expect(useEncounter.getState().encounter.combatants[id]!.conditions
    .find((c) => c.slug === "frightened")!.value).toBe(1);

  await user.click(screen.getByRole("button", { name: "Increase Frightened" }));
  expect(useEncounter.getState().encounter.combatants[id]!.conditions
    .find((c) => c.slug === "frightened")!.value).toBe(2);

  await user.click(screen.getByRole("button", { name: "Decrease Frightened" }));
  await user.click(screen.getByRole("button", { name: "Decrease Frightened" }));
  await user.click(screen.getByRole("button", { name: "Decrease Frightened" }));
  expect(useEncounter.getState().encounter.combatants[id]!.conditions
    .find((c) => c.slug === "frightened")!.value).toBe(0);
});

it("keeps applied conditions in a row above the pickable ones", async () => {
  const user = userEvent.setup();
  const id = useEncounter.getState().addCombatant(seed(), 19);
  useEncounter.getState().addCondition(id, "prone", 0);
  render(<CombatantList />);
  await user.hover(screen.getByText("Stag Lord Bandit"));

  const applied = screen.getByRole("group", { name: "applied conditions" });
  expect(within(applied).getByRole("button", { name: /Remove Prone/ })).toBeDefined();
  expect(within(screen.getByRole("group", { name: "add condition" }))
    .queryByRole("button", { name: "Prone" })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/app/test/combatant-list.test.tsx -t "one click"`
Expected: FAIL — the panel still renders a `select` labelled "Condition".

- [ ] **Step 3: Write minimal implementation**

Replace the section beneath the "Add condition" title with two `role="group"` rows: `"applied conditions"` (each tag showing the name, and for a valued condition `− {value} +` with small spaces, plus the existing `×`) and `"add condition"` (every `PICKABLE_CONDITIONS` entry not already applied, as a plain tag button that applies at value 1). Decrease clamps at 0. Delete the `conditionSlug` / `conditionValue` / `conditionFormula` state and the Add button; keep the persistent-damage formula field, shown only while persistent damage is applied.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/app`
Expected: PASS. `encounter-screen.test.tsx:96` selects on the old `Condition` dropdown — update it to click the tag.

- [ ] **Step 5: Verify in a real browser**

38 tags is a lot of DOM in a 330px popover. Confirm the rows wrap, the panel scrolls rather than overflowing the viewport, and the steppers are hittable — jsdom asserts none of that.

- [ ] **Step 6: Commit and push**

```bash
git add packages/app
git commit -m "Rebuild the condition picker as one-click tags with steppers"
git push origin HEAD:main
```
