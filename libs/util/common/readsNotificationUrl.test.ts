import { describe, expect, test } from "bun:test";

import { readsNotificationUrl } from "./readsNotificationUrl";

const origin = "https://office.example";

describe("readsNotificationUrl", () => {
  test("a screen reads a notification when its path ends in the notification's, whatever the locale and basePath", () => {
    expect(readsNotificationUrl("/ko/office/org/o1/chat/c1", "/org/o1/chat/c1", origin)).toBe(true);
    expect(readsNotificationUrl("/ko/office/org/o1/chat/c1?threadId=t1", "/org/o1/chat/c1", origin)).toBe(true);
  });

  test("another screen does not, nor one missing a query value the notification names", () => {
    expect(readsNotificationUrl("/ko/office/home", "/org/o1/chat/c1", origin)).toBe(false);
    expect(readsNotificationUrl("/ko/office/org/o1/chat/zc1", "/org/o1/chat/c1", origin)).toBe(false);
    expect(readsNotificationUrl("/ko/office/org/o1/chat/c1", "/org/o1/chat/c1?threadId=t1", origin)).toBe(false);
    expect(
      readsNotificationUrl("/ko/office/org/o1/project/p1/ticket", "/org/o1/project/p1/ticket?ticketId=k1", origin),
    ).toBe(false);
  });
});
