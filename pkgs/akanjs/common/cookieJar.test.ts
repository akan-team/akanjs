import { describe, expect, test } from "bun:test";
import { CookieJar } from "./cookieJar";

describe("CookieJar.parse", () => {
  test("keeps every occurrence of a name in header order", () => {
    const jar = CookieJar.parse("jwt:x=first; theme=dark; jwt:x=second");

    expect(jar.all("jwt:x")).toEqual(["first", "second"]);
    expect(jar.read("jwt:x")).toEqual({ count: 2 });
    expect(jar.read("theme")).toEqual({ value: "dark", count: 1 });
    expect(jar.read("missing")).toEqual({ count: 0 });
  });

  test("matches a name exactly, so a prefix, a suffix and the bare key are other cookies", () => {
    const jar = CookieJar.parse("jwt:x=a; jwt:x2=b; xjwt:x=c; jwt=d");

    expect(jar.read("jwt:x")).toEqual({ value: "a", count: 1 });
    expect(jar.read("jwt:x2")).toEqual({ value: "b", count: 1 });
    expect(jar.read("xjwt:x")).toEqual({ value: "c", count: 1 });
    expect(jar.read("jwt")).toEqual({ value: "d", count: 1 });
    expect(jar.names()).toEqual(["jwt:x", "jwt:x2", "xjwt:x", "jwt"]);
  });

  test("trims names and values, skips segments without `=`, and keeps `=` inside a value", () => {
    const jar = CookieJar.parse(" spaced = value ;malformed; ;padded=abc==; empty=");

    expect(jar.read("spaced").value).toBe("value");
    expect(jar.has("malformed")).toBe(false);
    expect(jar.read("padded").value).toBe("abc==");
    expect(jar.read("empty")).toEqual({ value: "", count: 1 });
  });

  test("strips one pair of surrounding quotes and percent-decodes once, keeping a malformed escape raw", () => {
    const jar = CookieJar.parse('quoted="a b"; doubled=""x""; encoded=a%20b%253D; broken=100%; lone="x');

    expect(jar.read("quoted").value).toBe("a b");
    expect(jar.read("doubled").value).toBe('"x"');
    expect(jar.read("encoded").value).toBe("a b%3D");
    expect(jar.read("broken").value).toBe("100%");
    expect(jar.read("lone").value).toBe('"x');
  });

  test("keeps a segment with an empty name, which no named lookup can reach", () => {
    const jar = CookieJar.parse("=orphan; theme=dark");

    expect(jar.names()).toEqual(["", "theme"]);
    expect(jar.read("theme").value).toBe("dark");
  });

  test("reads an empty jar from a missing header", () => {
    expect(CookieJar.parse(null).names()).toEqual([]);
    expect(CookieJar.parse(undefined).toHeader()).toBe("");
    expect(CookieJar.parse("").toMap()).toEqual(new Map());
  });
});

describe("CookieJar reads", () => {
  test("readJson unwraps the `j:` form and falls back to the text", () => {
    const jar = CookieJar.parse('prefs=j:{"theme":"dark"}; plain=dark; bad=j:{nope}; twice=j:1; twice=j:2');

    expect(jar.readJson("prefs")).toEqual({ theme: "dark" });
    expect(jar.readJson("plain")).toBe("dark");
    expect(jar.readJson("bad")).toBe("j:{nope}");
    expect(jar.readJson("twice")).toBeUndefined();
  });

  test("toMap holds only the names sent once", () => {
    const map = CookieJar.parse("jwt:x=a; theme=dark; jwt:x=b").toMap();

    expect([...map.keys()]).toEqual(["theme"]);
    expect(map.get("theme")).toEqual({ name: "theme", value: "dark" });
  });

  test("without drops names and toHeader rejoins the raw segments, encoding untouched", () => {
    const jar = CookieJar.parse('jwt:x=a; theme=a%3Bb; jwt=c; other="q"');
    const kept = jar.without((name) => name.startsWith("jwt"));

    expect(kept.toHeader()).toBe('theme=a%3Bb; other="q"');
    expect(kept.read("theme").value).toBe("a;b");
    expect(jar.names()).toEqual(["jwt:x", "theme", "jwt", "other"]);
  });

  test("entries lists every segment decoded, duplicates included", () => {
    expect(CookieJar.parse("a=1; b=%32; a=3").entries()).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
      { name: "a", value: "3" },
    ]);
  });
});
