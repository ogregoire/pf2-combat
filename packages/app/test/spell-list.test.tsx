import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreatureI18n, Spellcasting } from "@pf2/schema";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { useEncounter } from "../src/state/store.js";

type Spell = Spellcasting["spells"][number];
const spell = (over: Partial<Spell>): Spell => ({
  name: "Spell", rank: 1, cost: "2", cantrip: false, frequency: null, uses: null, prepared: 0,
  slug: (over.name ?? "Spell").replace(/ \(.*\)$/, "").toLowerCase().replace(/ /g, "-"), ...over,
});

const spellcasting: Spellcasting[] = [
  {
    name: "Occult Spontaneous Spells", tradition: "occult", preparation: "spontaneous", dc: 25, attack: 17,
    slots: [{ rank: 3, max: 1 }], focusPoints: null,
    spells: [spell({ name: "Enthrall", rank: 3 }), spell({ name: "Haste", rank: 3, cost: "1 to 3" })],
  },
  {
    name: "Primal Innate Spells", tradition: "primal", preparation: "innate", dc: 24, attack: 16,
    slots: [], focusPoints: null,
    spells: [
      spell({ name: "Tongues (Constant)", rank: 5, frequency: "constant" }),
      spell({ name: "Entangle", rank: 2 }),
    ],
  },
];

const add = (i18n: CreatureI18n | null = null): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name: "Grigori", level: 6, ac: 22, saves: { fortitude: 10, reflex: 14, will: 12 },
      hp: { current: 90, max: 90 }, spellcasting, i18n },
    20,
  );
const rowOf = (name: string) => within(screen.getAllByTestId("spell-row").find((r) => r.textContent!.includes(name))!);

describe("SpellList", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("lists every entry's spells in one section, highest rank first, with each entry's DC and attack", async () => {
    add();
    render(<ActiveCombatant />);
    const list = within(screen.getByTestId("spell-list"));
    expect(list.getByText(/DC 25, attack \+17/).textContent).toContain("DC 25");
    expect(list.getByText(/DC 24, attack \+16/)).toBeDefined();
    expect(screen.getAllByTestId("spell-row").map((r) => r.textContent!.match(/^[A-Za-z ()]+?(?=rank)/)?.[0])).toEqual([
      "Tongues (Constant)", "Haste", "Enthrall", "Entangle",
    ]);
  });

  it("spends the slot and the actions on a cast, the rank's last slot closing every spell of that rank", async () => {
    const user = userEvent.setup();
    const id = add();
    render(<ActiveCombatant />);

    await user.click(rowOf("Enthrall").getByRole("button", { name: "Cast Enthrall with 2 actions" }));
    const c = useEncounter.getState().encounter.combatants[id]!;
    expect(c.actionsSpent).toBe(2);
    expect(rowOf("Enthrall").getByText("0/1 rank-3 slots")).toBeDefined();
    // Haste shares the rank-3 slot: none left for it either.
    expect((rowOf("Haste").getByRole("button", { name: "Cast Haste with 1 actions" }) as HTMLButtonElement).disabled).toBe(true);

    // Taking the cast back reopens the slot.
    await user.click(rowOf("Enthrall").getByRole("button", { name: "Take back a cast of Enthrall" }));
    expect(rowOf("Enthrall").getByText("1/1 rank-3 slots")).toBeDefined();
  });

  it("offers one button per action count for a ranged cost, and none beyond the actions left", async () => {
    const user = userEvent.setup();
    const id = add();
    useEncounter.getState().spendActions(id, 2);
    render(<ActiveCombatant />);
    const haste = rowOf("Haste");
    expect((haste.getByRole("button", { name: "Cast Haste with 1 actions" }) as HTMLButtonElement).disabled).toBe(false);
    expect((haste.getByRole("button", { name: "Cast Haste with 2 actions" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(haste.getByRole("button", { name: "Cast Haste with 1 actions" }));
    expect(useEncounter.getState().encounter.combatants[id]!.actionsSpent).toBe(3);
  });

  it("casts an innate spell once a day when no count is stated, and never casts a constant one", async () => {
    const user = userEvent.setup();
    add();
    render(<ActiveCombatant />);
    expect(rowOf("Tongues").queryByRole("button", { name: /^Cast/ })).toBeNull();
    expect(rowOf("Tongues").getByText("constant")).toBeDefined();

    await user.click(rowOf("Entangle").getByRole("button", { name: "Cast Entangle with 2 actions" }));
    expect(rowOf("Entangle").getByText("0/1 per day")).toBeDefined();
    expect((rowOf("Entangle").getByRole("button", { name: "Cast Entangle with 2 actions" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("names the spells in French from the overlay, by position", async () => {
    useEncounter.getState().setLang("fr");
    add({
      name: "Grigori", publicNotes: null, actions: [], attacks: [],
      spells: [
        { en: "Enthrall", name: "Discours captivant" },
        { en: "Haste", name: "Rapidité" },
        { en: "Tongues (Constant)", name: "Don des langues (constant)" },
        { en: "Entangle", name: "Enchevêtrement" },
      ],
    });
    render(<ActiveCombatant />);
    expect(screen.getByText("Discours captivant")).toBeDefined();
    expect(screen.getByText("Don des langues (constant)")).toBeDefined();
    expect(screen.getByText("Sorts")).toBeDefined();
  });

  // The reported defect: a creature added before spells were carried (the
  // Dancing Lady, saved in the GM's encounter) showed no Spells section,
  // while one added afterwards did.
  it("reads the spells back from the creature record for a combatant saved before spells existed", async () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Dancing Lady", creatureId: "kingmaker-bestiary/the-dancing-lady", level: 8, ac: 28,
        saves: { fortitude: 13, reflex: 19, will: 16 }, hp: { current: 135, max: 135 } },
      20,
    );
    useEncounter.getState().setAdjustment(id, "elite");
    // What a saved combatant from before looks like: no field at all.
    useEncounter.setState((s) => {
      delete s.encounter.combatants[id]!.spellcasting;
    });
    const fetchFn = async (url: string): Promise<Response> =>
      url.includes("creatures/kingmaker-bestiary/the-dancing-lady.json")
        ? new Response(JSON.stringify({ spellcasting: [spellcasting[1]] }))
        : new Response("[]");
    render(<ActiveCombatant fetchFn={fetchFn} />);

    expect(await screen.findByText("Entangle")).toBeDefined();
    // Elite, so the backfilled DC carries the +2 like every other stat.
    expect(useEncounter.getState().encounter.combatants[id]!.spellcasting![0]!.dc).toBe(26);
  });

  it("shows each spell folded, and its full rules text — French where translated — once unfolded", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    add();
    const fetchFn = async (url: string): Promise<Response> => {
      if (url.endsWith("data/spells/enthrall.json"))
        return new Response(JSON.stringify({
          slug: "enthrall", name: "Enthrall", rank: 3, cantrip: false, traits: ["auditory", "concentrate"], traditions: ["occult"],
          cost: "2", range: "120 feet", area: null, targets: "all creatures in range", defense: { save: "will", basic: false },
          duration: "sustained", sustained: true, description: "<p>Your words fascinate your targets. @Check[will|dc:20]</p>",
        }));
      if (url.endsWith("data/i18n/fr/spells/enthrall.json"))
        return new Response(JSON.stringify({ name: "Discours captivant", description: "<p>Vos paroles fascinent vos cibles. @Check[will|dc:20]</p>", range: null, targets: "toutes les créatures à portée", duration: null }));
      return new Response("[]");
    };
    render(<ActiveCombatant fetchFn={fetchFn} />);
    expect(screen.queryByTestId("spell-details")).toBeNull();

    const enthrallRow = screen.getAllByTestId("spell-row").find((r) => r.textContent!.includes("Enthrall"))!;
    await user.click(within(enthrallRow).getByRole("button", { expanded: false }));
    const text = (await screen.findByTestId("spell-details")).textContent!;
    expect(text).toContain("Vos paroles fascinent vos cibles. jet de Volonté DD 20");
    expect(text).toContain("Portée 36 m"); // no French range: converted from 120 feet
    expect(text).toContain("Cibles toutes les créatures à portée");
    expect(text).toContain("Défense Volonté");

    // Casting from the folded row doesn't unfold it.
    await user.click(within(screen.getAllByTestId("spell-row").find((r) => r.textContent!.includes("Entangle"))!).getByRole("button", { name: /^Lancer/ }));
    expect(screen.getAllByTestId("spell-details")).toHaveLength(1);
  });
});
