import { afterEach, describe, expect, test } from "bun:test";
import { SessionRefresh } from "./sessionRefresh";

const pageRequest = (cookie?: string) => new Request("http://localhost/en/home", { headers: cookie ? { cookie } : {} });

const renewed = ["jwt=new-access; Path=/; HttpOnly", "refresh=new-refresh; Path=/; HttpOnly; Max-Age=600"];

afterEach(() => {
  SessionRefresh.use(null);
});

describe("SessionRefresh", () => {
  test("sets, replaces and drops cookies on the request the way the browser will store them", () => {
    const after = SessionRefresh.cookieHeaderAfter("theme=dark; jwt=old; jwt=planted; refresh=old-refresh", [
      "jwt=new; Path=/; HttpOnly",
      "refresh=; Path=/; Max-Age=0",
      "claims=a.b; Path=/; Expires=Thu, 01 Jan 2099 00:00:00 GMT",
      "gone=x; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);

    expect(after).toBe("theme=dark; jwt=new; claims=a.b");
  });

  test("leaves the request alone without a hook, without cookies, or when the hook issues nothing", async () => {
    const calls: string[] = [];
    expect(await SessionRefresh.apply(pageRequest("jwt=old"))).toEqual([]);

    SessionRefresh.use((request) => {
      calls.push(request.headers.get("cookie") ?? "");
      return null;
    });
    expect(await SessionRefresh.apply(pageRequest())).toEqual([]);
    const request = pageRequest("jwt=old");
    expect(await SessionRefresh.apply(request)).toEqual([]);

    expect(calls).toEqual(["jwt=old"]);
    expect(request.headers.get("cookie")).toBe("jwt=old");
  });

  test("hands the render the issued session and answers every response with it, uncacheable", async () => {
    SessionRefresh.use(() => renewed);
    const route = SessionRefresh.answering(async (req: Request) => {
      await SessionRefresh.apply(req);
      return Response.redirect(`http://localhost/signin?seen=${encodeURIComponent(req.headers.get("cookie") ?? "")}`);
    });

    const response = await route(pageRequest("theme=dark; jwt=expired; refresh=old-refresh"));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("seen")).toBe(
      "theme=dark; jwt=new-access; refresh=new-refresh",
    );
    expect(response.headers.getSetCookie()).toEqual(renewed);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("leaves a response alone when the request issued nothing", async () => {
    SessionRefresh.use(() => []);
    const route = SessionRefresh.answering(async (req: Request) => {
      await SessionRefresh.apply(req);
      return new Response("ok", { headers: { "cache-control": "no-cache" } });
    });

    const response = await route(pageRequest("jwt=fresh"));

    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("runs one refresh for concurrent requests with the same cookies, and answers a late one with it too", async () => {
    const pending: ((setCookies: string[]) => void)[] = [];
    SessionRefresh.use(
      () =>
        new Promise<string[]>((resolve) => {
          pending.push(resolve);
        }),
    );

    const first = SessionRefresh.apply(pageRequest("jwt=expired; refresh=old-refresh"));
    const second = SessionRefresh.apply(pageRequest("jwt=expired; refresh=old-refresh"));
    const other = SessionRefresh.apply(pageRequest("jwt=expired; refresh=someone-else"));
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[0]?.(renewed);
    pending[1]?.([]);
    expect(await first).toEqual(renewed);
    expect(await second).toEqual(renewed);
    expect(await other).toEqual([]);

    expect(await SessionRefresh.apply(pageRequest("jwt=expired; refresh=old-refresh"))).toEqual(renewed);
    expect(pending).toHaveLength(2);
  });

  test("asks again once the reuse window passes, and at once after a refresh that issued nothing", async () => {
    const reuseMs = SessionRefresh.reuseMs;
    SessionRefresh.reuseMs = 5;
    try {
      let calls = 0;
      SessionRefresh.use(() => {
        calls += 1;
        return calls === 1 ? renewed : [];
      });
      await SessionRefresh.apply(pageRequest("refresh=old-refresh"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await SessionRefresh.apply(pageRequest("refresh=old-refresh"));
      await SessionRefresh.apply(pageRequest("refresh=old-refresh"));
      expect(calls).toBe(3);
    } finally {
      SessionRefresh.reuseMs = reuseMs;
    }
  });

  test("renders with the cookies the browser sent when the hook throws, and drops a line that splits headers", async () => {
    SessionRefresh.use(() => {
      throw new Error("store down");
    });
    const request = pageRequest("jwt=expired");
    expect(await SessionRefresh.apply(request)).toEqual([]);
    expect(request.headers.get("cookie")).toBe("jwt=expired");

    SessionRefresh.use(() => [
      "jwt=new; Path=/\r\nX-Injected: 1",
      "claims=a\0b; Path=/",
      "name=\u4e2d; Path=/",
      "refresh=new; Path=/",
    ]);
    const issuing = pageRequest("jwt=expired");
    expect(await SessionRefresh.apply(issuing)).toEqual(["refresh=new; Path=/"]);
    expect(issuing.headers.get("cookie")).toBe("jwt=expired; refresh=new");
  });

  test("renders with the cookies the browser sent when the hook gives no answer in time, and asks again after", async () => {
    const timeoutMs = SessionRefresh.timeoutMs;
    SessionRefresh.timeoutMs = 5;
    try {
      let calls = 0;
      SessionRefresh.use(() => {
        calls += 1;
        return calls === 1 ? new Promise<string[]>(() => undefined) : renewed;
      });
      const request = pageRequest("jwt=expired; refresh=old-refresh");
      expect(await SessionRefresh.apply(request)).toEqual([]);
      expect(request.headers.get("cookie")).toBe("jwt=expired; refresh=old-refresh");

      expect(await SessionRefresh.apply(pageRequest("jwt=expired; refresh=old-refresh"))).toEqual(renewed);
      expect(calls).toBe(2);
    } finally {
      SessionRefresh.timeoutMs = timeoutMs;
    }
  });
});
