import { describe, expect, test } from "bun:test";
import { McpAppApprovals } from "./McpAppApprovals";

const request = (callId: string) => ({
  callId,
  name: "removeMemo",
  args: { id: callId },
  message: `Remove ${callId}?`,
});

describe("McpAppApprovals", () => {
  test("asks one question at a time, in the order the calls arrived", async () => {
    const approvals = new McpAppApprovals();
    const signal = new AbortController().signal;
    const first = approvals.ask(request("a"), signal);
    const second = approvals.ask(request("b"), signal);
    expect(approvals.current()?.callId).toBe("a");
    approvals.current()?.approve();
    expect(await first).toBe(true);
    expect(approvals.current()?.callId).toBe("b");
    approvals.current()?.reject("Not that one.");
    expect(await second).toBe("Not that one.");
    expect(approvals.current()).toBeNull();
  });

  test("drops a question whose call was cancelled before anyone answered", async () => {
    const approvals = new McpAppApprovals();
    const controller = new AbortController();
    const asked = approvals.ask(request("a"), controller.signal);
    controller.abort();
    expect(await asked).toBe("The call ended before the user decided.");
    expect(approvals.current()).toBeNull();
  });
});
