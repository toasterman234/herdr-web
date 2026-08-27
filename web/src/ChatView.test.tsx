/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "./ChatView";
import type { PaneInfo } from "./types";

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = "";
});

describe("ChatView", () => {
  it("sends a message and turns terminal changes into an assistant turn", async () => {
    const onSend = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(
        <ChatView
          pane={pane("idle")}
          bridgeId="local"
          screenText="Pi\nReady"
          onSend={onSend}
          onOpenTerminal={vi.fn()}
        />,
      );
    });

    const textarea = host.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "fix it");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSend).toHaveBeenCalledWith("fix it");
    await act(async () => {
      root.render(
        <ChatView
          pane={pane("working")}
          bridgeId="local"
          screenText="Pi\nReady\n> fix it\nReading file"
          onSend={onSend}
          onOpenTerminal={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain("Reading file");

    await act(async () => {
      root.render(
        <ChatView
          pane={pane("done")}
          bridgeId="local"
          screenText="Pi\nReady\n> fix it\nReading file\nFixed it"
          onSend={onSend}
          onOpenTerminal={vi.fn()}
        />,
      );
    });
    expect(host.textContent).toContain("Fixed it");
  });
});

function pane(agentStatus: PaneInfo["agent_status"]): PaneInfo {
  return {
    pane_id: "pane-1",
    terminal_id: "terminal-1",
    workspace_id: "workspace-1",
    tab_id: "tab-1",
    focused: true,
    agent: "pi",
    display_agent: "Pi",
    agent_status: agentStatus,
    cwd: "/tmp/project",
    revision: 1,
  };
}
