import { describe, expect, test } from "bun:test";
import { Err } from "akanjs/common";
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

  test("restores into the forwarded Err with no constructor named, so a server that rethrows it keeps key and data", () => {
    const restored = restoreRemoteError({ error: "item.error.locked", data: { id: "i1" } }, 409);

    expect(restored).toBeInstanceOf(Err);
    expect(Err.is(restored, "item.error.locked")).toBe(true);
    expect((restored as Err).forwarded).toBe(true);
    expect(restored.toJSON?.()).toEqual({ error: "item.error.locked", data: { id: "i1" }, statusCode: 409 });
  });

  test("restores through a `fromJSON` lifted off Err into a plain holder", () => {
    const restored = restoreRemoteError({ error: "item.error.locked" }, 409, { fromJSON: Err.fromJSON });
    const holder = { is: Err.is };

    expect(restored).toBeInstanceOf(Err);
    expect(restored.statusCode).toBe(409);
    expect(holder.is(restored, "item.error.locked")).toBe(true);
  });
});
