import { describe, expect, it } from "vitest";
import { renderMarkers } from "../src/rules/renderMarkers.js";

describe("renderMarkers", () => {
  describe("@Check", () => {
    it("renders a flat check with a DC", () => {
      expect(renderMarkers("@Check[flat|dc:15]")).toBe("DC 15 flat check");
    });

    it("renders a save with a DC", () => {
      expect(renderMarkers("@Check[will|dc:25]")).toBe("DC 25 Will save");
    });

    it("prefixes basic saves", () => {
      expect(renderMarkers("@Check[fortitude|dc:24|basic|options:area-effect]")).toBe("basic DC 24 Fortitude save");
      expect(renderMarkers("@Check[will|dc:25|basic:true]")).toBe("basic DC 25 Will save");
    });

    it("title-cases a skill or lore name", () => {
      expect(renderMarkers("@Check[athletics|dc:23]")).toBe("DC 23 Athletics check");
      expect(renderMarkers("@Check[farming-lore]")).toBe("Farming Lore check");
      expect(renderMarkers("@Check[Architecture Lore|dc:22]")).toBe("DC 22 Architecture Lore check");
    });

    it("omits the DC when the marker doesn't carry one", () => {
      expect(renderMarkers("@Check[thievery]")).toBe("Thievery check");
    });

    it("ignores unknown parameters (options, traits, name, against, showDC)", () => {
      expect(renderMarkers("@Check[athletics|dc:23|name:Remove Spike]")).toBe("DC 23 Athletics check");
      expect(renderMarkers("@Check[crafting|dc:17|showDC:all]")).toBe("DC 17 Crafting check");
      expect(renderMarkers("@Check[athletics|against:fortitude]")).toBe("Athletics check");
      expect(renderMarkers("@Check[fortitude|dc:21|basic|traits:evocation,poison,primal|overrideTraits:true]")).toBe(
        "basic DC 21 Fortitude save",
      );
    });

    it("lets an explicit label win", () => {
      expect(renderMarkers("@Check[fortitude|dc:26]{Fortitude}")).toBe("Fortitude");
      expect(renderMarkers("@Check[legal-lore|against:will]{Will DC}")).toBe("Will DC");
    });

    it("leaves an unparseable DC visible", () => {
      const raw = "@Check[flat|dc:abc]";
      expect(renderMarkers(raw)).toBe(raw);
    });
  });

  describe("@Damage", () => {
    it("renders a simple formula and type", () => {
      expect(renderMarkers("@Damage[22d6[sonic]]")).toBe("22d6 sonic");
    });

    it("strips redundant enclosing parens from the formula", () => {
      expect(renderMarkers("@Damage[(1d10+10)[bludgeoning]]")).toBe("1d10+10 bludgeoning");
    });

    it("includes qualifiers like persistent ahead of the type", () => {
      expect(renderMarkers("@Damage[1d6[persistent,poison]]")).toBe("1d6 persistent poison");
    });

    it("joins multiple components with 'plus'", () => {
      expect(renderMarkers("@Damage[2d10[poison],2d10[bludgeoning]]")).toBe("2d10 poison plus 2d10 bludgeoning");
      expect(renderMarkers("@Damage[3d6[sonic], 3d6[bludgeoning]]")).toBe("3d6 sonic plus 3d6 bludgeoning");
    });

    it("ignores a trailing |options:... parameter", () => {
      expect(renderMarkers("@Damage[19d6[acid]|options:area-damage]")).toBe("19d6 acid");
    });

    it("lets an explicit label win, including compound ones", () => {
      expect(
        renderMarkers("@Damage[14d8[slashing],4d8[persistent,slashing]|options:area-damage]{14d8 slashing damage and 4d8 persistent slashing damage}"),
      ).toBe("14d8 slashing damage and 4d8 persistent slashing damage");
    });

    it("leaves a roll-data reference visible rather than rendering it as a damage type", () => {
      const raw = "@Damage[10d6[@actor.flags.pf2e.powerSource]|options:area-damage]";
      expect(renderMarkers(raw)).toBe(raw);
    });

    it("renders a bare formula with no damage type", () => {
      expect(renderMarkers("@Damage[2d6]")).toBe("2d6");
      expect(renderMarkers("@Damage[40]")).toBe("40");
    });

    it("leaves a doubly-nested formula visible", () => {
      const raw = "@Damage[1[acid],3d6[persistent,acid],(3[splash])[acid]]";
      expect(renderMarkers(raw)).toBe(raw);
    });
  });

  describe("@Template", () => {
    it("renders shape and distance", () => {
      expect(renderMarkers("@Template[emanation|distance:30]")).toBe("30-foot emanation");
      expect(renderMarkers("@Template[burst|distance:10]")).toBe("10-foot burst");
      expect(renderMarkers("@Template[cone|distance:15|damaging:yes]")).toBe("15-foot cone");
    });

    it("handles the type: prefix on the shape", () => {
      expect(renderMarkers("@Template[type:burst|distance:20]")).toBe("20-foot burst");
    });

    it("lets an explicit label win", () => {
      expect(renderMarkers("@Template[burst|distance:10]{10-foot radius}")).toBe("10-foot radius");
    });
  });

  describe("mixed text and multiple markers", () => {
    it("renders Furious Flailing from pathfinder-monster-core/forest-troll", () => {
      const description =
        "<p><strong>Trigger</strong> The forest troll takes electricity or fire damage</p>\n<hr />\n<p><strong>Effect</strong> The troll makes a claw Strike against a random creature within its reach. If the troll has persistent fire damage, they attempt a @Check[flat|dc:15] to remove it.</p>";
      expect(renderMarkers(description)).toBe(
        "<p><strong>Trigger</strong> The forest troll takes electricity or fire damage</p>\n<hr />\n<p><strong>Effect</strong> The troll makes a claw Strike against a random creature within its reach. If the troll has persistent fire damage, they attempt a DC 15 flat check to remove it.</p>",
      );
    });

    it("leaves plain text with no markers untouched", () => {
      const html = "<p>The forest troll gets a –4 circumstance penalty.</p>";
      expect(renderMarkers(html)).toBe(html);
    });

    it("renders a check followed by a template followed by a damage marker in one string", () => {
      const html = "Each creature in @Template[cone|distance:30] must attempt a @Check[reflex|dc:26|basic] or take @Damage[8d6[fire]] damage.";
      expect(renderMarkers(html)).toBe(
        "Each creature in 30-foot cone must attempt a basic DC 26 Reflex save or take 8d6 fire damage.",
      );
    });

    it("leaves a marker with no matching closing bracket visible without throwing", () => {
      const html = "prefix @Check[flat|dc:15 no close";
      expect(renderMarkers(html)).toBe(html);
    });
  });
});
