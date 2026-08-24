import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocalize } from "../src/normalize/localize.js";
import { buildConditions } from "../src/stages/reference.js";

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

describe("buildConditions", () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("reads whatever pack name config supplies, not a hardcoded directory", () => {
    const packsDir = mkdtempSync(join(tmpdir(), "reference-packs-"));
    tmpDirs.push(packsDir);

    // Deliberately not named "conditions" — proves buildConditions is driven
    // by the `packs` argument, not a hardcoded directory name.
    const packDir = join(packsDir, "custom-condition-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "prone.json"),
      JSON.stringify({
        name: "Prone",
        type: "condition",
        system: {
          description: { value: "<p>You are lying on the ground.</p>" },
          value: { isValued: false },
        },
      }),
    );

    const conditions = buildConditions(packsDir, ["custom-condition-pack"]);

    expect(conditions).toEqual([
      {
        slug: "prone",
        name: "Prone",
        isValued: false,
        description: "<p>You are lying on the ground.</p>",
      },
    ]);
  });
});
