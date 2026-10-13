import { describe, expect, test } from "bun:test";
import type { CacheValue } from "akanjs/service";
import { McpUiSession, type McpUiSessionStore } from "./McpUiSession";

const storeOf = ({ failing = false }: { failing?: boolean } = {}) => {
  const values = new Map<string, CacheValue>();
  const state = { failing };
  const store: McpUiSessionStore = {
    get: async <T extends CacheValue = CacheValue>(topic: string, key: string) => {
      if (state.failing) throw new Error("cache down");
      return values.get(`${topic}:${key}`) as T | undefined;
    },
    setIfAbsent: async (topic: string, key: string, value: CacheValue) => {
      if (state.failing) throw new Error("cache down");
      if (values.has(`${topic}:${key}`)) return false;
      values.set(`${topic}:${key}`, value);
      return true;
    },
  };
  return { store, state };
};

describe("McpUiSession", () => {
  test("honours an id it signed, and none it did not", async () => {
    const sessions = new McpUiSession(storeOf().store);
    const id = await sessions.mint();
    expect(id).toStartWith("ui.");
    expect(await sessions.issued(id)).toBe(true);
    const [nonce, signature] = (id ?? "").slice("ui.".length).split(".");
    for (const forged of [
      "ui.forged",
      `ui.${nonce}`,
      `ui.${nonce}.${signature}.x`,
      `ui.${nonce}x.${signature}`,
      `ui.${nonce}.${signature?.slice(1)}A`,
      `${nonce}.${signature}`,
      null,
      undefined,
    ])
      expect(await sessions.issued(forged)).toBe(false);
  });

  test("shares its key through the cache, so another instance honours what one issued", async () => {
    const { store } = storeOf();
    const id = await new McpUiSession(store).mint();
    expect(await new McpUiSession(store).issued(id)).toBe(true);
    expect(await new McpUiSession(storeOf().store).issued(id)).toBe(false);
    const local = await new McpUiSession(null).mint();
    expect(await new McpUiSession(null).issued(local)).toBe(true);
  });

  test("issues and honours nothing while the cache cannot answer, and recovers once it does", async () => {
    const { store, state } = storeOf();
    const id = await new McpUiSession(store).mint();
    state.failing = true;
    const sessions = new McpUiSession(store);
    expect(await sessions.mint()).toBeNull();
    expect(await sessions.issued(id)).toBe(false);
    state.failing = false;
    expect(await sessions.issued(id)).toBe(true);
  });
});
