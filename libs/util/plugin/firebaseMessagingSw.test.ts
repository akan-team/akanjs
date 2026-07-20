import { describe, expect, test } from "bun:test";
import { createFirebaseMessagingServiceWorker, normalizeFirebaseClientConfig } from "./firebaseMessagingSw";

describe("normalizeFirebaseClientConfig", () => {
  test("whitelists client fields and drops secrets / vapidKey", () => {
    const normalized = normalizeFirebaseClientConfig({
      apiKey: "public-api-key",
      authDomain: "example.firebaseapp.com",
      projectId: "public-project",
      storageBucket: "public-project.appspot.com",
      messagingSenderId: "1234567890",
      appId: "public-app-id",
      vapidKey: "public-vapid-key",
      private_key: "SERVER_PRIVATE_KEY_MUST_NOT_LEAK",
    });
    expect(normalized).toEqual({
      apiKey: "public-api-key",
      authDomain: "example.firebaseapp.com",
      projectId: "public-project",
      storageBucket: "public-project.appspot.com",
      messagingSenderId: "1234567890",
      appId: "public-app-id",
    });
    expect(normalized).not.toHaveProperty("vapidKey");
    expect(normalized).not.toHaveProperty("private_key");
  });

  test("returns null when required fields are missing or input is not an object", () => {
    expect(normalizeFirebaseClientConfig(undefined)).toBe(null);
    expect(normalizeFirebaseClientConfig(null)).toBe(null);
    expect(normalizeFirebaseClientConfig("nope")).toBe(null);
    expect(normalizeFirebaseClientConfig({ apiKey: "only-key" })).toBe(null);
  });
});

describe("createFirebaseMessagingServiceWorker", () => {
  test("inlines client config and imports firebase compat SDK, without leaking secrets", () => {
    const config = normalizeFirebaseClientConfig({
      apiKey: "public-api-key",
      projectId: "public-project",
      messagingSenderId: "1234567890",
      appId: "public-app-id",
      private_key: "SERVER_PRIVATE_KEY_MUST_NOT_LEAK",
    });
    const body = createFirebaseMessagingServiceWorker(config);
    expect(body).toContain("public-api-key");
    expect(body).toContain("public-project");
    expect(body).toContain("firebase-messaging-compat.js");
    expect(body).toContain("onBackgroundMessage");
    expect(body).toContain("notificationclick");
    expect(body).not.toContain("SERVER_PRIVATE_KEY_MUST_NOT_LEAK");
    expect(body).not.toContain("private_key");
  });

  test("produces a no-op worker (config null) that still registers notificationclick", () => {
    const body = createFirebaseMessagingServiceWorker(null);
    // config is null → the importScripts/onBackgroundMessage block is gated by `if (firebaseConfig)` at runtime,
    // but notificationclick is always registered.
    expect(body).toContain("const firebaseConfig = null");
    expect(body).toContain("notificationclick");
    expect(body).toContain("if (firebaseConfig)");
  });
});
