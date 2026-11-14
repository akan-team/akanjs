import { afterEach, describe, expect, test } from "bun:test";

import { RemoteHandshake } from "./remoteHandshake";

interface Popup {
  opener: unknown;
  location: { href: string };
  close: () => void;
}

const opens: Popup[] = [];
const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  opens.length = 0;
  Object.defineProperty(globalThis, "window", { value: realWindow, configurable: true });
});

const browserWith = (blocked = false) => {
  const page = {
    open: () => {
      if (blocked) return null;
      const popup: Popup = { opener: page, location: { href: "about:blank" }, close: () => undefined };
      opens.push(popup);
      return popup;
    },
  };
  Object.defineProperty(globalThis, "window", { value: page, configurable: true });
};

describe("RemoteHandshake.reserve", () => {
  test("sends the sign-in window on with no way back to the page that opened it", () => {
    browserWith();
    const reserved = RemoteHandshake.reserve();
    reserved?.go("https://apps.example.com/oauth/authorize?state=s-1");
    expect(opens[0]?.location.href).toBe("https://apps.example.com/oauth/authorize?state=s-1");
    expect(opens[0]?.opener).toBeNull();
  });

  test("answers null when the browser blocks the window", () => {
    browserWith(true);
    expect(RemoteHandshake.reserve()).toBeNull();
  });
});
