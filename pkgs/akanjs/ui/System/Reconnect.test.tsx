import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mount, setTestEnv } from "../testHelpers.fixture";

const listeners = new Map<string, Set<unknown>>();
const ws = {
  connected: true,
  on: (key: string, callback: unknown) => {
    listeners.set(key, (listeners.get(key) ?? new Set()).add(callback));
  },
  off: (key: string, callback: unknown) => {
    listeners.get(key)?.delete(callback);
  },
};

let Reconnect: typeof import("./Reconnect").Reconnect;

beforeAll(async () => {
  setTestEnv("reconnecttest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ l: (key: string) => key }), fetch: { ws } } as never);
  ({ Reconnect } = await import("./Reconnect"));
});

afterEach(() => {
  process.env.AKAN_PUBLIC_ENV = "testing";
  listeners.clear();
});

describe("Reconnect", () => {
  test("removes every socket listener it added when it unmounts", () => {
    process.env.AKAN_PUBLIC_ENV = "local";
    const { unmount } = mount(<Reconnect />);
    expect(listeners.get("connect")?.size).toBe(1);
    expect(listeners.get("disconnect")?.size).toBe(1);
    unmount();
    expect(listeners.get("connect")?.size).toBe(0);
    expect(listeners.get("disconnect")?.size).toBe(0);
  });

  test("outside the local env it hears no socket event, so a deploy's reconnect never reloads the page", () => {
    for (const env of ["main", "debug", "testing"]) {
      process.env.AKAN_PUBLIC_ENV = env;
      const { unmount } = mount(<Reconnect />);
      expect(listeners.size).toBe(0);
      unmount();
    }
  });
});
