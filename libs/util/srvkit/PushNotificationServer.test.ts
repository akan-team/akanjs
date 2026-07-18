import { describe, expect, test } from "bun:test";
import { createPushNotificationMessage } from "./PushNotificationServer";

describe("PushNotificationServer", () => {
  test("normalizes url into data.url and preserves custom data", () => {
    const message = createPushNotificationMessage({
      token: "token-1",
      title: "Hello",
      body: "Body",
      url: "/push-target",
      data: {
        type: "demo",
      },
    });

    expect(message).toMatchObject({
      token: "token-1",
      notification: {
        title: "Hello",
        body: "Body",
      },
      data: {
        type: "demo",
        url: "/push-target",
      },
    });
  });

  test("requires token or topic target", () => {
    expect(() =>
      createPushNotificationMessage({
        title: "Hello",
        body: "Body",
      }),
    ).toThrow("Push notification target token or topic is required.");
  });
});
