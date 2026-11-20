import { describe, expect, test } from "bun:test";
import { PressLoading } from "./pressLoading";

const pattern = "/:lang/chat/:channelId";
const stays = (from: string, to: string, shadowedBy: string[] = [], route = pattern) =>
  PressLoading.staysOnPage(route, shadowedBy, `http://localhost${from}`, `http://localhost${to}`);

describe("PressLoading.staysOnPage", () => {
  test("holds for another value of the page's params, whatever the query or the fragment", () => {
    expect(stays("/en/chat/a", "/en/chat/b")).toBe(true);
    expect(stays("/en/chat/a?thread=1", "/en/chat/b#latest")).toBe(true);
    expect(stays("/en/w/1/chat/a", "/en/w/2/chat/b", [], "/:lang/w/:workspaceId/chat/:channelId")).toBe(true);
  });

  test("fails for the same path, another page, another depth, and another locale", () => {
    expect(stays("/en/chat/a", "/en/chat/a?thread=1")).toBe(false);
    expect(stays("/en/chat/a", "/en/mail/a")).toBe(false);
    expect(stays("/en/chat/a", "/en/chat/a/members")).toBe(false);
    expect(stays("/en/chat/a", "/ko/chat/a")).toBe(false);
    expect(stays("/en/chat/a", "/ko/chat/b")).toBe(false);
  });

  test("reads a URL that hides the locale or leads with a prefix from its last segment back", () => {
    expect(stays("/chat/a", "/chat/b")).toBe(true);
    expect(stays("/chat/a", "/mail/b")).toBe(false);
    expect(stays("/app/en/chat/a", "/app/en/chat/b")).toBe(true);
    expect(stays("/app/en/chat/a", "/shop/en/chat/b")).toBe(false);
  });

  test("fails for a path a page matched ahead of this one takes", () => {
    const shadowedBy = ["/:lang/chat/new", "/:lang/:section/archive"];
    expect(stays("/en/chat/a", "/en/chat/new", shadowedBy)).toBe(false);
    expect(stays("/en/chat/a", "/en/chat/archive", shadowedBy)).toBe(false);
    expect(stays("/chat/a", "/chat/new", shadowedBy)).toBe(false);
    expect(stays("/en/chat/a", "/en/chat/newer", shadowedBy)).toBe(true);
  });
});
