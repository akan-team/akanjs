import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const messageCalls: unknown[] = [];
const logCalls: unknown[] = [];

beforeAll(() => {
  mock.module("./useClient", () => ({
    msg: {
      loading: (...args: unknown[]) => messageCalls.push(["loading", ...args]),
      success: (...args: unknown[]) => messageCalls.push(["success", ...args]),
      error: (...args: unknown[]) => messageCalls.push(["error", ...args]),
    },
  }));
  mock.module("akanjs/common", () => ({
    Logger: {
      log: () => undefined,
      verbose: () => undefined,
      error: (...args: unknown[]) => logCalls.push(args),
    },
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    getBasePathFromPathname: () => null,
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
  }));
});

afterEach(() => {
  messageCalls.length = 0;
  logCalls.length = 0;
});

const applyToast = (descriptor: PropertyDescriptor, key = "save") => {
  return import("./decorators").then(({ Toast }) => {
    Toast({ root: "user", duration: 5 })({}, key, descriptor);
    return descriptor.value as (...args: unknown[]) => Promise<unknown>;
  });
};

describe("Toast decorator", () => {
  test("wraps async success with loading and success messages", async () => {
    const descriptor: PropertyDescriptor = {
      value: async (value: string) => `saved:${value}`,
    };
    const wrapped = await applyToast(descriptor);

    await expect(wrapped("ok")).resolves.toBe("saved:ok");

    expect(messageCalls).toEqual([
      ["loading", "user.save-loading", { key: "save", duration: 5 }],
      ["success", "user.save-success", { key: "save", duration: 5 }],
    ]);
  });

  test("reports errors without rethrowing", async () => {
    const descriptor: PropertyDescriptor = {
      value: async () => {
        throw new Error("boom");
      },
    };
    const wrapped = await applyToast(descriptor, "remove");

    await expect(wrapped()).resolves.toBeUndefined();

    expect(messageCalls).toEqual([
      ["loading", "user.remove-loading", { key: "remove", duration: 5 }],
      ["error", "boom", { key: "remove", duration: 5 }],
    ]);
    expect(logCalls[0]).toEqual(["remove action error return: Error: boom"]);
  });
});
