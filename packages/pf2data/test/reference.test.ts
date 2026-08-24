import { describe, expect, it } from "vitest";
import { resolveLocalize } from "../src/normalize/localize.js";

describe("resolveLocalize", () => {
  it("substitutes a localization key with its text", () => {
    const lang = {
      "PF2E.NPC.Abilities.Glossary.Grab": "<p>The monster grabs you.</p>",
    };
    expect(
      resolveLocalize("<p>@Localize[PF2E.NPC.Abilities.Glossary.Grab]</p>", lang),
    ).toBe("<p><p>The monster grabs you.</p></p>");
  });

  it("leaves an unknown key untouched so it is visible in verification", () => {
    const html = "<p>@Localize[PF2E.Missing.Key]</p>";
    expect(resolveLocalize(html, {})).toBe(html);
  });

  it("resolves every key in a document", () => {
    const lang = { A: "one", B: "two" };
    expect(resolveLocalize("@Localize[A] and @Localize[B]", lang)).toBe(
      "one and two",
    );
  });

  it("leaves text without localize markers untouched", () => {
    expect(resolveLocalize("<p>plain</p>", {})).toBe("<p>plain</p>");
  });
});
