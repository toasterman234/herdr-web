/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import ChatMarkdown from "./ChatMarkdown";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChatMarkdown", () => {
  it("renders headings, lists, links, and fenced code", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <ChatMarkdown
          body={["### Fixed it", "", "- tests pass", "", "```ts", "const ok = true;", "```"].join("\n")}
        />,
      );
    });

    expect(host.querySelector("h3")?.textContent).toBe("Fixed it");
    expect(host.querySelector("li")?.textContent).toBe("tests pass");
    expect(host.querySelector("pre code")?.textContent).toContain("const ok = true;");
    await act(async () => root.unmount());
    host.remove();
  });
});
