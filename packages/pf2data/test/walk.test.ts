import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkPack } from "../src/io/walk.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "walk-"));
  writeFileSync(join(root, "goblin-warrior.json"), "{}");
  writeFileSync(join(root, "_folders.json"), "{}");
  writeFileSync(join(root, "notes.txt"), "ignore me");
  mkdirSync(join(root, "artisan"));
  writeFileSync(join(root, "artisan", "blacksmith.json"), "{}");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("walkPack", () => {
  it("finds nested json files and skips underscore-prefixed ones", () => {
    const files = walkPack(root);
    expect(files.map((f) => f.slug)).toEqual(["blacksmith", "goblin-warrior"]);
  });

  it("returns absolute paths that exist", () => {
    const files = walkPack(root);
    expect(files[0]!.absolutePath).toContain("artisan");
  });
});
