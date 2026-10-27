import { describe, expect, test } from "bun:test";
import { CookieJar } from "../common/cookieJar";
import { AppWsData } from "../server/routing/appWsData";
import {
  cookieJar,
  cookies,
  getRequestDynamicUsage,
  parseCookieHeader,
  requestStorage,
  untrackedCookieJar,
  untrackedCookies,
} from "./requestStorage";

const header = 'jwt:alpha=planted; theme=dark; jwt:alpha=own; prefs=j:"dark"; encoded=a%20b';

describe("request cookies", () => {
  test("read one jar, so the request store, a socket handshake and the parser agree on a duplicate", () => {
    if (!requestStorage) return;
    const request = new Request("https://app.example.com/en", { headers: { cookie: header } });
    const parsed = CookieJar.parse(header);
    const socket = AppWsData.fromRequest(request).jar;

    requestStorage.run(request, () => {
      for (const jar of [cookieJar(), untrackedCookieJar(), socket]) {
        expect(jar.read("jwt:alpha")).toEqual(parsed.read("jwt:alpha"));
        expect(jar.names()).toEqual(parsed.names());
      }
      expect(cookies().has("jwt:alpha")).toBe(false);
      expect(untrackedCookies().get("theme")).toEqual({ name: "theme", value: "dark" });
      expect(cookies().get("encoded")?.value).toBe("a b");
      expect(cookies().get("prefs")?.value).toBe('j:"dark"');
      expect(cookieJar().readJson("prefs")).toBe("dark");
    });
  });

  test("an untracked read leaves the route static, a tracked one marks it", () => {
    if (!requestStorage) return;
    requestStorage.run(new Request("https://app.example.com/", { headers: { cookie: header } }), () => {
      untrackedCookieJar();
      expect(getRequestDynamicUsage()?.cookies).toBe(false);
      cookieJar();
      expect(getRequestDynamicUsage()?.cookies).toBe(true);
    });
  });

  test("read nothing outside a request", () => {
    expect(cookieJar().names()).toEqual([]);
    expect(cookies()).toEqual(new Map());
  });

  test("the deprecated parser still answers last-wins with its `j:` unwrapping", () => {
    const parsed = parseCookieHeader(header);

    expect(parsed.get("jwt:alpha")?.value).toBe("own");
    expect(parsed.get("prefs")?.value).toBe("dark");
    expect(parsed.get("encoded")?.value).toBe("a%20b");
  });
});
