import { describe, expect, test } from "bun:test";
import { restoreRemoteError } from "./remoteError";

describe("restoreRemoteError", () => {
  test("keeps a generalized failure's code on the restored error and in its JSON", () => {
    const restored = restoreRemoteError({ error: "Service Unavailable", code: "queueFull", statusCode: 503 }, 500);

    expect(restored.code).toBe("queueFull");
    expect(restored.toJSON?.()).toEqual({ error: "Service Unavailable", code: "queueFull", statusCode: 503 });
  });

  test("writes no code for a failure that came without one", () => {
    const restored = restoreRemoteError({ error: "item.error.locked" }, 409);

    expect(restored.toJSON?.()).toEqual({ error: "item.error.locked", statusCode: 409 });
  });
});
