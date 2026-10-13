import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { l, mount, setTestEnv } from "../testHelpers.fixture";

let EmbedApproval: typeof import("./EmbedApproval").EmbedApproval;
let McpAppApprovals: typeof import("../../webkit/McpAppApprovals").McpAppApprovals;
let overlayZ: typeof import("../overlayLayer").overlayZ;

beforeAll(async () => {
  setTestEnv("embedapprovaltest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ EmbedApproval } = await import("./EmbedApproval"));
  ({ McpAppApprovals } = await import("../../webkit/McpAppApprovals"));
  ({ overlayZ } = await import("../overlayLayer"));
});

describe("EmbedApproval", () => {
  test("draws the pending question above an open modal and its backdrop", async () => {
    const { unmount } = mount(<EmbedApproval />);
    const controller = new AbortController();
    let decided: Promise<true | string> = Promise.resolve(true);
    act(() => {
      decided = McpAppApprovals.shared.ask(
        { callId: "c1", name: "removeTask", args: { modelId: "t1" }, message: "Remove the task?" },
        controller.signal,
      );
    });

    const overlay = document.body.querySelector<HTMLElement>("[data-akan-embed-overlay]");
    expect(overlay?.textContent).toContain("Remove the task?");
    expect(Number(overlay?.style.zIndex)).toBeGreaterThan(overlayZ.modal);
    act(() => controller.abort());
    expect(await decided).toBe("The call ended before the user decided.");
    unmount();
  });
});
