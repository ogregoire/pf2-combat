import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

const configPath = fileURLToPath(
  new URL("../pf2data.config.json", import.meta.url),
);

describe("loadConfig", () => {
  it("loads the shipped allowlist", () => {
    const config = loadConfig(configPath);
    expect(config.upstream.repo).toBe("https://github.com/foundryvtt/pf2e");
    expect(config.packs.map((p) => p.name)).toContain("kingmaker-bestiary");
  });

  it("exposes creature packs separately from reference packs", () => {
    const config = loadConfig(configPath);
    const creaturePacks = config.packs.filter((p) => p.kind === "creatures");
    expect(creaturePacks).toHaveLength(5);
  });

  it("rejects a config with an unknown pack kind", () => {
    expect(() => loadConfig(
      fileURLToPath(new URL("./fixtures/bad-config.json", import.meta.url)),
    )).toThrow();
  });
});
