import { describe, expect, it } from "vitest";
import { cleanTerminalScreen, splitTerminalChatContent, terminalScreenDelta } from "./terminalChat";

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
  it("removes terminal footers without deleting ordinary prose", () => {
    const screen = [
      "The token budget is documented in the project notes.",
      "~/central-ops (agent/protocol-ux-proof-close)",
      "↑11M ↓29k 85.7%/128k (auto) (zima-litellm) zima-codex-5.6-luna",
      "Shift+Enter for newline · sent through Herdr PTY",
    ].join("\n");
    expect(cleanTerminalScreen(screen)).toBe(
      "The token budget is documented in the project notes.",
    );
  });

  it("removes ordinary shell prompts from chat", () => {
    expect(cleanTerminalScreen("bencharney@Bens-Mini-77 central-ops %")).toBe("");
    expect(cleanTerminalScreen("~/central-ops (main) ❯")).toBe("");
  });

  it("joins single-space terminal continuation rows without flattening markdown", () => {
    const screen = [
      "The agent returned a long sentence that wrapped at the edge,",
      " and this is the continuation.",
      "- first item",
      " - second item",
    ].join("\n");
    expect(cleanTerminalScreen(screen)).toBe([
      "The agent returned a long sentence that wrapped at the edge, and this is the continuation.",
      "- first item",
      "- second item",
    ].join("\n"));
  });

  it("separates transient terminal activity from assistant prose", () => {
    const content = splitTerminalChatContent([
      "⠋ Reading src/auth.ts",
      "Searching references",
      "Running npm test",
      "I fixed the authentication bug and all tests pass.",
    ].join("\n"));
    expect(content.activity).toEqual([
      "Reading src/auth.ts",
      "Searching references",
      "Running npm test",
    ]);
    expect(content.text).toBe("I fixed the authentication bug and all tests pass.");
  });

});
