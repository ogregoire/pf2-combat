import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Attack } from "@pf2/schema";
import { DAMAGE_TYPES } from "../src/rules/damage.js";
import { DAMAGE_TYPE_STYLE, DamageTypeIcon } from "../src/components/damageTypes.js";
import { CombatantList } from "../src/components/CombatantList.js";
import { StrikeCard } from "../src/components/StrikeCard.js";
import { useEncounter } from "../src/state/store.js";

const seed = (over = {}) => ({
  kind: "creature" as const, name: "Skeletal Tiger Lord", level: 0, ac: 15,
  saves: { fortitude: 6, reflex: 7, will: 4 },
  hp: { current: 40, max: 40 }, ...over,
});

// jsdom re-serialises CSS numbers ("0.10" comes back as "0.1"), so compare
// colours with every number normalised rather than as raw strings.
const css = (value: string): string => value.replace(/[\d.]+/g, (n) => String(Number(n)));

const strike = (types: string[]): Attack => ({
  name: "Jaws",
  kind: "melee",
  bonus: 18,
  damage: types.map((type) => ({ formula: "1d6", type, category: null })),
  traits: [],
  effects: [],
});

describe("damage type visuals", () => {
  beforeEach(() => useEncounter.getState().reset());

  // Guardrail, not a spot check: a damage type added to DAMAGE_TYPES without
  // a colour or an icon would otherwise render as an unstyled, iconless
  // button that looks like a bug rather than a gap in this table.
  it("gives every damage type a colour and an icon", () => {
    const noStyle = [...DAMAGE_TYPES].filter((t) => DAMAGE_TYPE_STYLE[t] === undefined);
    expect(noStyle).toEqual([]);

    const noIcon = [...DAMAGE_TYPES].filter(
      (t) => render(<DamageTypeIcon type={t} />).container.querySelector("svg") === null,
    );
    expect(noIcon).toEqual([]);
  });

  // "none" is the selector's own opt-out, not a PF2 damage type, so it is
  // absent from DAMAGE_TYPES and the guardrail above can't cover it.
  it("styles the selector's None option too", () => {
    expect(DAMAGE_TYPE_STYLE.none).toBeDefined();
    expect(render(<DamageTypeIcon type="none" />).container.querySelector("svg")).not.toBeNull();
  });

  it("colours each damage-type button in the popover with its own type's hue", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      seed({
        iwr: {
          immunities: [],
          weaknesses: [],
          resistances: [{ type: "fire", value: 10 }, { type: "cold", value: 10 }],
        },
      }),
      19,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Skeletal Tiger Lord"));

    const fire = screen.getByRole("button", { name: /fire/i });
    expect(css(fire.style.color)).toBe(css(DAMAGE_TYPE_STYLE.fire.color));
    expect(css(fire.style.border)).toContain(css(DAMAGE_TYPE_STYLE.fire.border));
    expect(fire.querySelector("svg")).not.toBeNull();

    const cold = screen.getByRole("button", { name: /cold/i });
    expect(css(cold.style.color)).toBe(css(DAMAGE_TYPE_STYLE.cold.color));
    expect(cold.style.color).not.toBe(fire.style.color);
  });

  it("keeps the selected button in its own hue rather than a shared grey", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(
      seed({ iwr: { immunities: [], weaknesses: [], resistances: [{ type: "fire", value: 10 }] } }),
      19,
    );
    render(<CombatantList />);
    await user.hover(screen.getByText("Skeletal Tiger Lord"));

    const fire = screen.getByRole("button", { name: /fire/i });
    await user.click(fire);
    expect(fire.getAttribute("aria-pressed")).toBe("true");
    expect(css(fire.style.background)).toBe(css(DAMAGE_TYPE_STYLE.fire.activeBg));
  });

  it("colours and icons each damage type on a strike", () => {
    render(
      <StrikeCard
        attack={strike(["piercing", "fire"])}
        selected={false}
        activeRung={0}
        onSelect={() => {}}
        glossary={new Map()}
      />,
    );

    const piercing = screen.getByText("piercing");
    expect(css(piercing.style.color)).toBe(css(DAMAGE_TYPE_STYLE.piercing.color));
    expect(piercing.querySelector("svg")).not.toBeNull();

    const fire = screen.getByText("fire");
    expect(css(fire.style.color)).toBe(css(DAMAGE_TYPE_STYLE.fire.color));
    expect(fire.querySelector("svg")).not.toBeNull();
  });

  // Damage types come from the dataset as free strings; an unrecognised one
  // must still render its formula rather than throw or vanish.
  it("falls back to neutral styling for an unknown damage type", () => {
    render(
      <StrikeCard
        attack={strike(["ectoplasm"])}
        selected={false}
        activeRung={0}
        onSelect={() => {}}
        glossary={new Map()}
      />,
    );
    expect(screen.getByText("ectoplasm")).toBeDefined();
    expect(screen.getByText("1d6")).toBeDefined();
  });
});
