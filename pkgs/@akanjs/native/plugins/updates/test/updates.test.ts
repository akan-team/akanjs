import { afterEach, describe, expect, test } from "bun:test";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { markReady, updates } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

describe("updates routing", () => {
  test("the web has no updates; markReady() is a no-op there", async () => {
    host = installMockHost({ platform: "web" });
    expect(updates.isSupported("check")).toBe(false);
    expect(isAkanNativeError(await updates.check().catch((e) => e), "UNSUPPORTED")).toBe(true);
    await markReady(); // resolves
  });

  test("native hosts get the calls; markReady() confirms the bundle", async () => {
    let confirmed = 0;
    host = installMockHost({
      platform: "ios",
      plugins: {
        updates: {
          methods: {
            getState: () => ({
              bundle: "b1",
              sequence: 2,
              pending: null,
              trial: true,
              rolledBack: null,
              channel: "production",
              nativeApi: "n",
            }),
            notifyReady: () => void confirmed++,
          },
          events: ["progress"],
        },
      },
    });
    expect((await updates.getState()).trial).toBe(true);
    await markReady();
    expect(confirmed).toBe(1);
  });

  test("markReady() tolerates hosts without the method", async () => {
    host = installMockHost({ platform: "android", plugins: { updates: { methods: {} } } });
    await markReady();
  });
});
