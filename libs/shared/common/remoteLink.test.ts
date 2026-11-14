import { describe, expect, test } from "bun:test";

import { RemoteLink } from "./remoteLink";

describe("RemoteLink", () => {
  const server = "https://apps.example.com/mcp";

  test("keeps an https link on the connected server's origin", () => {
    expect(RemoteLink.of("https://apps.example.com/trips/1?tab=notes", server)).toBe(
      "https://apps.example.com/trips/1?tab=notes",
    );
  });

  test("refuses a link on another scheme, host, port or with credentials", () => {
    for (const href of [
      "http://apps.example.com/trips/1",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "https://other.example.com/trips/1",
      "https://apps.example.com:8443/trips/1",
      "https://user:pass@apps.example.com/trips/1",
      "https://user@apps.example.com/trips/1",
      "/trips/1",
      "trips/1",
      "",
    ])
      expect(RemoteLink.of(href, server)).toBeNull();
    expect(RemoteLink.of(undefined, server)).toBeNull();
  });

  test("refuses every link when the server's own address is no https URL", () => {
    expect(RemoteLink.of("http://apps.example.com/trips/1", "http://apps.example.com/mcp")).toBeNull();
    expect(RemoteLink.of("https://apps.example.com/trips/1", "not a url")).toBeNull();
  });
});
