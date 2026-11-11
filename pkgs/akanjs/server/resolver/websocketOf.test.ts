import { describe, expect, test } from "bun:test";
import type { InjectRegistry } from "akanjs/service";
import { websocketOf } from "./websocketOf";

describe("websocketOf", () => {
  test("names a registry that holds no WebSocket adaptor as notRegistered", () => {
    const registry = { adaptor: new Map(), adaptorRole: new Map() } as unknown as InjectRegistry;
    expect(() => websocketOf(registry)).toThrow("WebSocket adaptor is not registered");
    try {
      websocketOf(registry);
    } catch (error) {
      expect(error).toMatchObject({ code: "notRegistered", statusCode: 500 });
    }
  });
});
