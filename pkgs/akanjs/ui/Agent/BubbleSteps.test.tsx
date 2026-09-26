import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ChatMessage } from "use-agentic";

let Bubble: typeof import("./Bubble").default;

beforeAll(async () => {
  const { registerClientRuntime } = await import("akanjs/client");
  const l = Object.assign((key: string) => key, { trans: () => "" }) as never;
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }) } as never);
  ({ default: Bubble } = await import("./Bubble"));
});

describe("Bubble progress steps", () => {
  test("a running call lists the steps its progress carries, folded under a settled count", () => {
    const message = {
      role: "assistant",
      text: "",
      toolCalls: [{ id: "c1", name: "runCodeTask", args: {} }],
    } as unknown as ChatMessage;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <Bubble
          message={message}
          progress={{
            callId: "c1",
            message: "editing files",
            steps: [
              { id: "s1", label: "read AGENTS.md", status: "done" },
              { id: "s2", label: "edit ops.ts", status: "running", detail: "+12 -3" },
              { id: "s3", label: "run tests", status: "pending" },
            ],
          }}
        />,
      ),
    );
    expect(host.querySelector("summary")?.textContent).toBe("1/3");
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "✓read AGENTS.md",
      "●edit ops.ts+12 -3",
      "○run tests",
    ]);
    act(() => root.unmount());
    host.remove();
  });
});
