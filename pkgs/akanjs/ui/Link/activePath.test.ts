import { describe, expect, test } from "bun:test";
import { isActiveHref } from "./activePath";

describe("isActiveHref", () => {
  test("strips the locale and the basePath from both sides before comparing", () => {
    const at = (pathname: string, href: string, extra: { exact?: boolean; match?: string[] } = {}) =>
      isActiveHref({ pathname, href, lang: "en", prefix: "office", ...extra });

    expect(at("/en/office/org/1/project/9", "/org/1/project")).toBe(true);
    expect(at("/en/org/1/project", "/org/1/project")).toBe(true);
    expect(at("/en/office/org/1/project", "/en/office/org/1/project", { exact: true })).toBe(true);
    expect(at("/en/office/org/1/project/9", "/org/1/project", { exact: true })).toBe(false);
  });

  test("matches by segment, keeps the root exact, and lights up under an extra prefix", () => {
    const at = (pathname: string, href: string, match?: string[]) =>
      isActiveHref({ pathname, href, lang: "en", prefix: "", match });

    expect(at("/en/organization", "/org")).toBe(false);
    expect(at("/en/settings", "/")).toBe(false);
    expect(at("/en", "/")).toBe(true);
    expect(at("/en/org/1/ticket/3", "/org/1/project", ["/org/1/ticket"])).toBe(true);
  });
});
