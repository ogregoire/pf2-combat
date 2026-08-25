import { describe, expect, it } from "vitest";
import { fetchUpstream, fetchFrench, type RunGit } from "../src/stages/fetch.js";
import type { Pf2DataConfig } from "../src/config.js";

const config: Pf2DataConfig = {
  upstream: { repo: "https://github.com/foundryvtt/pf2e", branch: "master" },
  french: { repo: "https://gitlab.com/pathfinder-fr/foundryvtt-pathfinder2-fr", branch: "master" },
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

  it("errors when neither a pin nor --latest is available, naming the upstreamRef pin", () => {
    const { run } = recorder();
    // With two independent pins, an error that does not say WHICH one is
    // missing points a debugger at the wrong upstream.
    expect(() =>
      fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/no pinned ref/i);
    expect(() =>
      fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/upstreamRef/);
    expect(() =>
      fetchUpstream({ config, cacheDir: "/tmp/c", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/foundryvtt\/pf2e/);
  });
});

describe("fetchFrench", () => {
  it("sparse-checks out only the vf variant and the lang dir", () => {
    const calls: string[][] = [];
    const run: RunGit = (args) => { calls.push(args); return "abc123\n"; };
    fetchFrench({ config, cacheDir: ".cache-fr", pinnedRef: "abc123", useLatest: false, run });
    const sparse = calls.find((c) => c[0] === "sparse-checkout")!;
    expect(sparse).toContain("babele/vf/fr");
    expect(sparse).toContain("lang");
    // The other three naming variants are 138 MB we never read.
    expect(sparse.join(" ")).not.toContain("vf-vo");
    expect(sparse.join(" ")).not.toContain("vo-vf");
    expect(sparse).not.toContain("babele/vo");
    expect(sparse).not.toContain("babele/vo/fr");
  });

  it("errors when neither a pin nor --latest is available, naming the frRef pin", () => {
    const { run } = recorder();
    expect(() =>
      fetchFrench({ config, cacheDir: "/tmp/c-fr", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/no pinned ref/i);
    expect(() =>
      fetchFrench({ config, cacheDir: "/tmp/c-fr", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/frRef/);
    expect(() =>
      fetchFrench({ config, cacheDir: "/tmp/c-fr", pinnedRef: null, useLatest: false, run }),
    ).toThrow(/foundryvtt-pathfinder2-fr/);
  });
});
