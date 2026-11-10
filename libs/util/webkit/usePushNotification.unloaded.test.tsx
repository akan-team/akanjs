import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { Logger } from "akanjs/common";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const warnings: string[] = [];
const warn = spyOn(Logger, "warn").mockImplementation((message: string) => {
  warnings.push(message);
});

beforeAll(() => {
  mock.module("react", () => ({ useEffect: () => undefined }));
  mock.module("akanjs/client", () => ({
    isNativeApp: () => true,
    router: { enterDeepLink: () => true },
    storage: { getItem: async () => "device-1", setItem: async () => undefined },
  }));
  mock.module("akanjs/client/native/push", () => {
    throw new Error("Failed to fetch dynamically imported module");
  });
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
});

afterAll(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  warn.mockRestore();
});

test("turns push off in a shell whose native push plugin does not load, and says so", async () => {
  const { usePushNotification } = await import("./usePushNotification");
  const push = usePushNotification();

  expect(await push.isSupported()).toBe(false);
  expect(await push.getPermission()).toBe("denied");
  expect(await push.register()).toBeUndefined();
  expect(await push.getToken()).toBeUndefined();
  push.onTokenChange(() => undefined)();
  expect(warnings[0]).toStartWith("The native push plugin did not load, so push is off on this page:");
  expect(warnings[0]).toContain("Failed to fetch dynamically imported module");
});
