import { describe, expect, it } from "vitest";
import { parseAddCommand } from "../src/rules/parseAddCommand.js";

describe("parseAddCommand", () => {
  it("parses quantity, name and initiative together", () => {
    expect(parseAddCommand("6 goblin warrior 13")).toEqual({
      quantity: 6, nameQuery: "goblin warrior", initiative: 13,
    });
  });

  it("defaults quantity to 1 when absent", () => {
    expect(parseAddCommand("stag lord 19")).toEqual({
      quantity: 1, nameQuery: "stag lord", initiative: 19,
    });
  });

  it("leaves initiative unset when absent", () => {
    expect(parseAddCommand("3 troll")).toEqual({
      quantity: 3, nameQuery: "troll", initiative: null,
    });
  });

  it("parses a bare name with default quantity and no initiative", () => {
    expect(parseAddCommand("goblin")).toEqual({
      quantity: 1, nameQuery: "goblin", initiative: null,
    });
  });

  it("handles empty input", () => {
    expect(parseAddCommand("")).toEqual({ quantity: 1, nameQuery: "", initiative: null });
  });

  it("handles whitespace-only input", () => {
    expect(parseAddCommand("   ")).toEqual({ quantity: 1, nameQuery: "", initiative: null });
  });

  it("treats a lone number as a name query, since it satisfies neither the leading nor trailing rule alone", () => {
    expect(parseAddCommand("13")).toEqual({ quantity: 1, nameQuery: "13", initiative: null });
  });

  it("collapses extra inner whitespace and trims the ends", () => {
    expect(parseAddCommand("  6    goblin   warrior   13  ")).toEqual({
      quantity: 6, nameQuery: "goblin warrior", initiative: 13,
    });
  });

  it("clamps a zero quantity to 1", () => {
    expect(parseAddCommand("0 troll")).toEqual({ quantity: 1, nameQuery: "troll", initiative: null });
  });

  it("clamps a negative quantity to 1", () => {
    expect(parseAddCommand("-2 troll")).toEqual({ quantity: 1, nameQuery: "troll", initiative: null });
  });

  it("parses a multi-word name with no quantity or initiative", () => {
    expect(parseAddCommand("stag lord")).toEqual({ quantity: 1, nameQuery: "stag lord", initiative: null });
  });

  it("parses a single-word name with a trailing initiative", () => {
    expect(parseAddCommand("troll 5")).toEqual({ quantity: 1, nameQuery: "troll", initiative: 5 });
  });
});
