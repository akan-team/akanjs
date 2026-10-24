import { describe, expect, test } from "bun:test";
import { Href } from "./href";

const externalTable: Array<[string, boolean]> = [
  ["https://example.com/x", true],
  ["HTTPS://example.com/x", true],
  ["Http://example.com/x", true],
  ["//example.com/x", true],
  ["//", false],
  ["///", false],
  ["//?q", false],
  ["//#h", false],
  ["//[::1", false],
  ["//bad%host/x", false],
  ["//:80/x", false],
  ["mailto:a@b.co", true],
  ["MAILTO:a@b.co", true],
  ["tel:+82101234", true],
  ["sms:+82101234", true],
  ["blob:https://site.example/0000", true],
  ["kakaotalk://open", true],
  [" https://example.com/x", true],
  ["\\\\example.com\\x", true],
  ["/\\example.com/x", true],
  ["https://site.example/en/faq", true],
  ["javascript:alert(1)", false],
  ["JavaScript:alert(1)", false],
  [" javascript:alert(1)", false],
  ["java\tscript:alert(1)", false],
  ["vbscript:msgbox(1)", false],
  ["data:text/html,hi", false],
  ["DATA:text/html,hi", false],
  ["#top", false],
  ["?tab=a", false],
  ["/faq", false],
  ["faq", false],
  ["httpbin/x", false],
  ["/en//double", false],
  ["", false],
  ["https:example.com/x", true],
  ["http:example.com", true],
  ["HTTPS:example.com", true],
  ["https:/example.com", true],
  ["\thttps:foo.com", true],
  ["//akan.invalid/x", true],
  ["https://akan.invalid/x", true],
  ["blob:https://akan.invalid/id", true],
  ["\n//host.test", true],
  ["\\/host.test", true],
  ["docs:intro", true],
  ["\u0000javascript:x", false],
  ["https:", false],
  ["./x", false],
  ["../x", false],
];

describe("Href.isExternal", () => {
  for (const [href, expected] of externalTable) {
    test(`${JSON.stringify(href)} -> ${expected}`, () => {
      expect(Href.isExternal(href)).toBe(expected);
    });
  }
});

const webSchemeTable: Array<[string, boolean]> = [
  ["https://x", true],
  ["HTTPS://x", true],
  ["Http://x", true],
  ["http:x", true],
  ["//x", false],
  ["httpbin/x", false],
  ["/faq", false],
  ["mailto:a@b.co", false],
  [" https://x", false],
];

describe("Href.hasWebScheme", () => {
  for (const [href, expected] of webSchemeTable) {
    test(`${JSON.stringify(href)} -> ${expected}`, () => {
      expect(Href.hasWebScheme(href)).toBe(expected);
    });
  }
});

const leavesOriginTable: Array<[string, string | undefined, boolean]> = [
  ["https://evil.example/", "https://site.test/en/a", true],
  ["https://site.test/en/b", "https://site.test/en/a", false],
  ["HTTPS://SITE.test/en/b", "https://site.test/en/a", false],
  ["http://site.test/en/b", "https://site.test/en/a", true],
  ["https://site.test:8443/en/b", "https://site.test/en/a", true],
  ["https://site.test@evil.example/", "https://site.test/en/a", true],
  ["https://evil.example\\@site.test/", "https://site.test/en/a", true],
  ["http:evil.example/x", "https://site.test/en/a", true],
  ["https:evil.example/x", "https://site.test/en/a", false],
  ["//evil.example/x", "https://site.test/en/a", false],
  ["/en/b", "https://site.test/en/a", false],
  ["javascript:alert(1)", "https://site.test/en/a", false],
  ["https://localhost/en/b", "app://localhost/en", true],
  ["https://site.test/en/b", undefined, true],
];

describe("Href.leavesOrigin", () => {
  for (const [href, base, expected] of leavesOriginTable) {
    test(`${JSON.stringify(href)} on ${JSON.stringify(base)} -> ${expected}`, () => {
      expect(Href.leavesOrigin(href, base)).toBe(expected);
    });
  }
});

const toExternalUrlTable: Array<[string, string, string]> = [
  ["//example.com/x", "http://site.test/en/a", "http://example.com/x"],
  ["//example.com/x", "app://localhost/en", "https://example.com/x"],
  ["\\\\example.com\\x", "app://localhost/en", "https://example.com/x"],
  [" https://example.com/x", "app://localhost/en", "https://example.com/x"],
  ["MAILTO:a@b.co", "app://localhost/en", "mailto:a@b.co"],
  ["kakaotalk://open", "app://localhost/en", "kakaotalk://open"],
  ["HTTPS://Example.com/x", "http://site.test/en/a", "https://example.com/x"],
  ["https:example.com/x", "app://localhost/en/a", "https://example.com/x"],
  ["HTTPS:example.com/x", "app://localhost/en/a", "https://example.com/x"],
  ["https:/example.com/x", "app://localhost/en/a", "https://example.com/x"],
  ["\thttps:example.com/x", "app://localhost/en/a", "https://example.com/x"],
  ["http:example.com/x", "https://docs.example/base/", "http://example.com/x"],
  ["https:example.com/x", "https://site.test/en/a", "https://site.test/en/example.com/x"],
];

describe("Href.toExternalUrl", () => {
  for (const [href, base, expected] of toExternalUrlTable) {
    test(`${JSON.stringify(href)} on ${JSON.stringify(base)} -> ${JSON.stringify(expected)}`, () => {
      expect(Href.toExternalUrl(href, base)).toBe(expected);
    });
  }
});

describe("Href without URL.canParse", () => {
  test("classifies and resolves on engines without URL.canParse (iOS 16 Safari)", () => {
    const canParse = URL.canParse;
    Reflect.deleteProperty(URL, "canParse");
    try {
      expect(Href.isExternal("/faq")).toBe(false);
      expect(Href.isExternal("HTTPS://x.test")).toBe(true);
      expect(Href.isExternal("//x.test")).toBe(true);
      expect(Href.toExternalUrl("//x.test/a", "app://localhost/")).toBe("https://x.test/a");
    } finally {
      Object.defineProperty(URL, "canParse", { value: canParse, writable: true, configurable: true });
    }
  });
});
