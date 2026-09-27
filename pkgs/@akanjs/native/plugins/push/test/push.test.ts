import { afterEach, describe, expect, test } from "bun:test";
import { googleServicesXml } from "../../../packages/cli/src/lib/googleservices.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type PushAction, type PushToken, push } from "../src/index.ts";

// akanjs readiness O6-2.

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("push", () => {
  test("the web and desktops have no push: every method is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    for (const call of [() => push.register(), () => push.checkPermission(), () => push.unregister()]) {
      expect(isAkanNativeError(await call().catch((e) => e), "UNSUPPORTED")).toBe(true);
    }
  });

  test("native: register resolves the provider's token, events reach listeners", async () => {
    const token: PushToken = { token: "a1b2", provider: "apns", platform: "ios" };
    host = installMockHost({
      platform: "ios",
      plugins: {
        push: {
          methods: { register: () => token, checkPermission: () => ({ display: "granted" }) },
          events: ["token", "received", "action"],
        },
      },
    });
    expect(await push.register()).toEqual(token);
    expect(await push.checkPermission()).toEqual({ display: "granted" });
    const actions: PushAction[] = [];
    const stop = push.listen("action", (a) => actions.push(a));
    await tick();
    const tap: PushAction = { actionId: "tap", message: { id: "m1", title: "Hi", data: { route: "/inbox" } } };
    host.emit("push", "action", tap);
    expect(actions).toEqual([tap]);
    stop();
  });

  test("the manifest: APNs entitlement and background mode on iOS, the FCM module and its service on Android", () => {
    expect(manifest.ios.entitlements).toEqual({ "aps-environment": "development" });
    expect(manifest.ios.infoPlist.UIBackgroundModes).toEqual(["remote-notification"]);
    //? core 1.10.0 is pinned beside FCM: play-services-basement calls PendingIntentCompat, which core 1.9.0 lacks.
    expect(manifest.android.maven).toEqual([
      "com.google.firebase:firebase-messaging:25.1.3",
      "androidx.core:core:1.10.0",
    ]);
    expect(manifest.android.applicationXml).toContain("com.google.firebase.MESSAGING_EVENT");
  });
});

describe("google-services.json", () => {
  const json = JSON.stringify({
    project_info: {
      project_number: "1234567890",
      project_id: "akan-native-probe",
      storage_bucket: "akan-native-probe.appspot.com",
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: "1:1234567890:android:abc",
          android_client_info: { package_name: "com.akanjs.sample" },
        },
        api_key: [{ current_key: "AIza-key" }],
        oauth_client: [{ client_id: "web-client.apps.googleusercontent.com", client_type: 3 }],
      },
    ],
  });

  test("the strings Firebase reads, for the app's package (a debug suffix falls back to the base id)", () => {
    const xml = googleServicesXml(json, "com.akanjs.sample.debug", "com.akanjs.sample");
    expect(xml).toContain('<string name="google_app_id" translatable="false">1:1234567890:android:abc</string>');
    expect(xml).toContain('<string name="gcm_defaultSenderId" translatable="false">1234567890</string>');
    expect(xml).toContain('<string name="google_api_key" translatable="false">AIza-key</string>');
    expect(xml).toContain('<string name="project_id" translatable="false">akan-native-probe</string>');
    expect(xml).toContain(
      '<string name="default_web_client_id" translatable="false">web-client.apps.googleusercontent.com</string>',
    );
    expect(xml).not.toContain("firebase_database_url");
  });

  test("an app the file does not have is an error naming what it has", () => {
    expect(() => googleServicesXml(json, "com.other.app")).toThrow(
      /has no Android app com.other.app \(it has com.akanjs.sample\)/,
    );
    expect(() => googleServicesXml("{", "x")).toThrow(/not JSON/);
  });
});
