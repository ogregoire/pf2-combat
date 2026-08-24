import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractTrigger, extractRequirements } from "../src/normalize/html.js";

const akiros = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/akiros-ismort.json", import.meta.url)),
    "utf8",
  ),
);

describe("extractTrigger", () => {
  it("pulls the trigger out of a real reaction description", () => {
    const noEscape = akiros.items.find((i: any) => i.name === "No Escape");
    expect(noEscape.system.trigger).toBeUndefined();
    expect(extractTrigger(noEscape.system.description.value)).toBe(
      "An adjacent foe moves away.",
    );
  });

  it("returns null when there is no trigger paragraph", () => {
    expect(extractTrigger("<p>Just a description.</p>")).toBeNull();
  });

  it("strips nested markup from the trigger text", () => {
    const html =
      "<p><strong>Trigger</strong> A creature within <em>30 feet</em> moves.</p><hr />";
    expect(extractTrigger(html)).toBe("A creature within 30 feet moves.");
  });
});

describe("extractRequirements", () => {
  it("pulls a requirements paragraph", () => {
    const html = "<p><strong>Requirements</strong> You are wielding a shield.</p>";
    expect(extractRequirements(html)).toBe("You are wielding a shield.");
  });
});

describe("M4: <hr/> boundary and entity decoding", () => {
  it("ignores a same-labelled paragraph that appears after the <hr/>", () => {
    const html =
      "<p><strong>Trigger</strong> The real trigger.</p><hr />" +
      "<p>Main description mentions a <strong>Trigger</strong> word later on.</p>";
    expect(extractTrigger(html)).toBe("The real trigger.");
  });

  it("returns null when the only labelled paragraph is after the <hr/>", () => {
    const html =
      "<p>No trigger before the break.</p><hr />" +
      "<p><strong>Trigger</strong> This is not a real trigger paragraph.</p>";
    expect(extractTrigger(html)).toBeNull();
  });

  it("decodes common named entities beyond nbsp and amp", () => {
    const html =
      "<p><strong>Trigger</strong> The foe&rsquo;s turn ends&mdash;it can&apos;t act.</p>";
    expect(extractTrigger(html)).toBe("The foe’s turn ends—it can't act.");
  });
});
