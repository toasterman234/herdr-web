/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActivityView } from "./ActivityView";
import type { PaneInfo } from "./types";

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = "";
});

describe("ActivityView", () => {
  it("renders Herdr-native state and records pane presentation changes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ActivityView pane={pane({ agent_status: "working", title: "Inspecting files" })} bridgeLabel="Mac" lastStatusTransitionAt={1_787_858_000_000} />);
    });
    expect(container.textContent).toContain("Inspecting files");
    expect(container.textContent).toContain("Agent statusLive");
    expect(container.textContent).toContain("Tool calls & resultsAdapter next");

    await act(async () => {
      root.render(<ActivityView pane={pane({ agent_status: "blocked", title: "Approval required" })} bridgeLabel="Mac" lastStatusTransitionAt={1_787_858_001_000} />);
    });
    expect(container.textContent).toContain("Approval required");
    expect(container.textContent).toContain("Inspecting files");
    expect(container.querySelectorAll(".activity-event")).toHaveLength(2);
  });
});

function pane(overrides: Partial<PaneInfo> = {}): PaneInfo {
  return {
    pane_id: "pane-1",
    terminal_id: "terminal-1",
    workspace_id: "workspace-1",
    tab_id: "tab-1",
    focused: true,
    cwd: "/Users/ben/project",
    agent: "codex",
    display_agent: "Codex",
    title: "Working",
    agent_status: "working",
    state_labels: { working: "Running", blocked: "Needs approval" },
    revision: 1,
    ...overrides,
  };
}
