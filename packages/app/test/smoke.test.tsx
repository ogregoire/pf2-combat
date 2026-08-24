import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

describe("App", () => {
  it("renders", () => {
    render(<App />);
    expect(screen.getByText("PF2 Combat Tracker")).toBeDefined();
  });
});
