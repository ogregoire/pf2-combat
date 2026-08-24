import { describe, expect, it } from "vitest";
import { MAX_ADD_QUANTITY, parseAddCommand } from "../src/rules/parseAddCommand.js";

describe("parseAddCommand", () => {
  it("parses quantity, name and initiative together", () => {
    expect(parseAddCommand("6 goblin warrior 13")).toEqual({
      quantity: 6, nameQuery: "goblin warrior", initiative: 13, requestedQuantity: 6,
    });
  });

  it("defaults quantity to 1 when absent", () => {
    expect(parseAddCommand("stag lord 19")).toEqual({
      quantity: 1, nameQuery: "stag lord", initiative: 19, requestedQuantity: 1,
    });
  });

  it("leaves initiative unset when absent", () => {
    expect(parseAddCommand("3 troll")).toEqual({
      quantity: 3, nameQuery: "troll", initiative: null, requestedQuantity: 3,
    });
  });

  it("parses a bare name with default quantity and no initiative", () => {
    expect(parseAddCommand("goblin")).toEqual({
      quantity: 1, nameQuery: "goblin", initiative: null, requestedQuantity: 1,
    });
  });

  it("handles empty input", () => {
    expect(parseAddCommand("")).toEqual({
      quantity: 1, nameQuery: "", initiative: null, requestedQuantity: 1,
    });
  });

  it("handles whitespace-only input", () => {
    expect(parseAddCommand("   ")).toEqual({
      quantity: 1, nameQuery: "", initiative: null, requestedQuantity: 1,
    });
  });

  it("treats a lone number as a name query, since it satisfies neither the leading nor trailing rule alone", () => {
    expect(parseAddCommand("13")).toEqual({
      quantity: 1, nameQuery: "13", initiative: null, requestedQuantity: 1,
    });
  });

  it("collapses extra inner whitespace and trims the ends", () => {
    expect(parseAddCommand("  6    goblin   warrior   13  ")).toEqual({
      quantity: 6, nameQuery: "goblin warrior", initiative: 13, requestedQuantity: 6,
    });
  });

  it("clamps a zero quantity to 1", () => {
    expect(parseAddCommand("0 troll")).toEqual({
      quantity: 1, nameQuery: "troll", initiative: null, requestedQuantity: 0,
    });
  });

  it("clamps a negative quantity to 1", () => {
    expect(parseAddCommand("-2 troll")).toEqual({
      quantity: 1, nameQuery: "troll", initiative: null, requestedQuantity: -2,
    });
  });

  it("parses a multi-word name with no quantity or initiative", () => {
    expect(parseAddCommand("stag lord")).toEqual({
      quantity: 1, nameQuery: "stag lord", initiative: null, requestedQuantity: 1,
    });
  });

  it("parses a single-word name with a trailing initiative", () => {
    expect(parseAddCommand("troll 5")).toEqual({
      quantity: 1, nameQuery: "troll", initiative: 5, requestedQuantity: 1,
    });
  });

  describe("the quantity ceiling", () => {
    it("clamps a quantity above MAX_ADD_QUANTITY down to the cap", () => {
      expect(parseAddCommand("500 goblin warrior 13")).toEqual({
        quantity: MAX_ADD_QUANTITY, nameQuery: "goblin warrior", initiative: 13, requestedQuantity: 500,
      });
    });

    it("exposes the cap as a named constant set to 30", () => {
      expect(MAX_ADD_QUANTITY).toBe(30);
    });

    it("leaves requestedQuantity equal to quantity when nothing was capped", () => {
      const result = parseAddCommand("6 goblin warrior 13");
      expect(result.requestedQuantity).toBe(result.quantity);
    });

    it("does not clamp a quantity exactly at the cap", () => {
      expect(parseAddCommand("30 troll")).toEqual({
        quantity: 30, nameQuery: "troll", initiative: null, requestedQuantity: 30,
      });
    });
  });
});
