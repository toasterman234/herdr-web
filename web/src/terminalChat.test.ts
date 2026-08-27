import { describe, expect, it } from "vitest";
import { cleanTerminalScreen, terminalScreenDelta } from "./terminalChat";

describe("terminal chat transcript helpers", () => {
  it("removes decorative terminal chrome and user echo", () => {
    const screen = [
      "────────────────────",
      "> fix the auth bug",
      "Reading src/auth.ts",
      "",
      "I fixed the token check.",
    ].join("\n");

    expect(cleanTerminalScreen(screen, "fix the auth bug")).toBe(
      "Reading src/auth.ts\n\nI fixed the token check.",
    );
  });

  it("extracts changed terminal output after a user turn", () => {
    const before = "Pi\nReady\n> fix it";
    const after = "Pi\nReady\n> fix it\nReading file\nDone";
    expect(terminalScreenDelta(before, after, "fix it")).toBe("Reading file\nDone");
  });
});
