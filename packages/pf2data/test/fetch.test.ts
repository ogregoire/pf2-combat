import { describe, expect, it } from "vitest";
import { fetchUpstream } from "../src/stages/fetch.js";
import type { Pf2DataConfig } from "../src/config.js";

const config: Pf2DataConfig = {
  upstream: { repo: "https://github.com/foundryvtt/pf2e", branch: "master" },
  packs: [
    { name: "conditions", kind: "conditions" },
    { name: "kingmaker-bestiary", kind: "creatures" },
  ],
};

function recorder() {
  const calls: string[][] = [];
  const run = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "rev-parse") return "abc123def456\n";
    return "";
  };
  return { calls, run };
}

describe("fetchUpstream", () => {
  it("sparse-checks-out only the allowlisted packs", () => {
    const { calls, run } = recorder();
    fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: true, run });
    const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
    expect(sparse).toContain("packs/conditions");
    expect(sparse).toContain("packs/kingmaker-bestiary");
    expect(sparse).not.toContain("packs/pathfinder-bestiary-3");
  });

  it("also checks out the localization file that holds glossary text", () => {
    const { calls, run } = recorder();
    fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: true, run });
    const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
    expect(sparse).toContain("static/lang");
  });

  it("checks out the pinned ref when not using latest", () => {
    const { calls, run } = recorder();
    const result = fetchUpstream({
      config, cacheDir: "/tmp/c", pinnedRef: "deadbeef", useLatest: false, run,
    });
    expect(calls.some((c) => c[0] === "checkout" && c[1] === "deadbeef")).toBe(true);
    expect(result.ref).toBe("deadbeef");
  });

  it("resolves the branch head when using latest", () => {
    const { run } = recorder();
    const result = fetchUpstream({
      config, cacheDir: "/tmp/c", pinnedRef: "old", useLatest: true, run,
    });
    expect(result.ref).toBe("abc123def456");
  });

  it("errors when neither a pin nor --latest is available", () => {
    const { run } = recorder();
    expect(() =>
      fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/no pinned ref/i);
  });
});
