import { describe, expect, test } from "bun:test";

import { PushNotificationServer } from "./pushNotificationServer";

const ok = { success: true };
const failed = (code: string) => ({ success: false, error: { code } });

describe("PushNotificationServer.classifyFcmBatch", () => {
  test("keeps every token when the whole batch fails with invalid-argument, because the payload is the suspect", () => {
    const batch = ["a", "b", "c"];
    const responses = batch.map(() => failed("messaging/invalid-argument"));
    const { goneTokens, failureCounts } = PushNotificationServer.classifyFcmBatch(batch, responses);
    expect(goneTokens).toEqual([]);
    expect(Object.fromEntries(failureCounts)).toEqual({ "messaging/invalid-argument": 3 });
  });

  test("drops an invalid-argument token once another token in the same batch succeeded", () => {
    const { goneTokens, failureCounts } = PushNotificationServer.classifyFcmBatch(
      ["a", "b"],
      [ok, failed("messaging/invalid-argument")],
    );
    expect(goneTokens).toEqual(["b"]);
    expect(failureCounts.size).toBe(0);
  });

  test("always drops unregistered and invalid registration tokens", () => {
    const { goneTokens } = PushNotificationServer.classifyFcmBatch(
      ["a", "b"],
      [failed("messaging/registration-token-not-registered"), failed("messaging/invalid-registration-token")],
    );
    expect(goneTokens).toEqual(["a", "b"]);
  });

  test("keeps tokens that failed for a transient or credential reason and counts them per code", () => {
    const { goneTokens, failureCounts } = PushNotificationServer.classifyFcmBatch(
      ["a", "b", "c", "d"],
      [
        ok,
        failed("messaging/internal-error"),
        failed("messaging/internal-error"),
        failed("messaging/mismatched-credential"),
      ],
    );
    expect(goneTokens).toEqual([]);
    expect(Object.fromEntries(failureCounts)).toEqual({
      "messaging/internal-error": 2,
      "messaging/mismatched-credential": 1,
    });
  });
});
