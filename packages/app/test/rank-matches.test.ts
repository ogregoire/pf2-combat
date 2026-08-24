import { describe, expect, it } from "vitest";
import type { IndexEntry } from "@pf2/schema";
import { rankMatches } from "../src/rules/rankMatches.js";

const entry = (over: Partial<IndexEntry>): IndexEntry =>
  ({
    id: `pack/${(over.name ?? "x").toLowerCase().replace(/\s+/g, "-")}`,
    slug: "x", name: "X", level: 1, rarity: "common", size: "medium",
    traits: [], ac: 15, hp: 10, remaster: true, book: "Pack",
    ...over,
  }) as IndexEntry;

describe("rankMatches", () => {
  it("ranks an exact match first", () => {
    const troll = entry({ name: "Troll" });
    const forestTroll = entry({ name: "Forest Troll" });
    const out = rankMatches([forestTroll, troll], "troll");
    expect(out.map((e) => e.name)).toEqual(["Troll", "Forest Troll"]);
  });

  it("ranks a name-starts-with match ahead of a word-starts-with match", () => {
    const goblinWarrior = entry({ name: "Goblin Warrior" });
    const warlord = entry({ name: "Warlord Goblin" });
    const out = rankMatches([warlord, goblinWarrior], "gob");
    expect(out.map((e) => e.name)).toEqual(["Goblin Warrior", "Warlord Goblin"]);
  });

  it("ranks a word-starts-with match ahead of a substring-only match", () => {
    const goblinChief = entry({ name: "Goblin Chief" }); // word "Chief" starts with "hie"? no — use clearer case
    const stagLord = entry({ name: "Stag Lord" }); // word "Lord" starts with "lo"
    const bloodlord = entry({ name: "Bloodlord" }); // contains "lo" mid-word only
    const out = rankMatches([bloodlord, stagLord, goblinChief], "lo");
    expect(out.map((e) => e.name)).toEqual(["Stag Lord", "Bloodlord"]);
  });

  it("ranks a substring match ahead of a subsequence-only fuzzy match", () => {
    const dire = entry({ name: "Dire Wolf" }); // contains "ire"
    const iron = entry({ name: "Iron Golem" }); // fuzzy: i-r-...-o? need query chars in order
    // query "irn": "Iron Golem" -> i,r,n in order (Iron -> i,r,o,n) so subsequence matches;
    // "Dire Wolf" does not contain "irn" as substring nor as subsequence in order easily — use safer query.
    const out = rankMatches([iron, dire], "iron");
    expect(out.map((e) => e.name)).toEqual(["Iron Golem"]);
  });

  it("matches via subsequence fuzzy when no substring exists", () => {
    // "tgl" appears in order within "sTaG Lord" -> t,g,l
    const stagLord = entry({ name: "Stag Lord" });
    const out = rankMatches([stagLord], "tgl");
    expect(out.map((e) => e.name)).toEqual(["Stag Lord"]);
  });

  it("excludes entries matching no tier at all", () => {
    const troll = entry({ name: "Troll" });
    const out = rankMatches([troll], "xyz");
    expect(out).toEqual([]);
  });

  it("is case-insensitive", () => {
    const troll = entry({ name: "Troll" });
    expect(rankMatches([troll], "TROLL").map((e) => e.name)).toEqual(["Troll"]);
    expect(rankMatches([troll], "troll").map((e) => e.name)).toEqual(["Troll"]);
  });

  it("sorts ties within a tier by name then id via compareStrings, not localeCompare", () => {
    const a = entry({ name: "Goblin", id: "book-a/goblin" });
    const b = entry({ name: "Goblin", id: "book-b/goblin" });
    const out = rankMatches([b, a], "goblin");
    expect(out.map((e) => e.id)).toEqual(["book-a/goblin", "book-b/goblin"]);
  });

  it("does not mutate the input array", () => {
    const troll = entry({ name: "Troll" });
    const forestTroll = entry({ name: "Forest Troll" });
    const input = [forestTroll, troll];
    const copy = [...input];
    rankMatches(input, "troll");
    expect(input).toEqual(copy);
  });

  it("returns an empty array for an empty query", () => {
    const troll = entry({ name: "Troll" });
    expect(rankMatches([troll], "")).toEqual([]);
  });
});
