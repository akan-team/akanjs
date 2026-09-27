import { afterEach, describe, expect, test } from "bun:test";
import { aclCheck, type CallScope, globMatch, type ResolvedAcl, scopePermits, urlMatch } from "../src/acl.ts";
import { definePlugin, defineWebPlugin, isAkanNativeError, type WebCallContext } from "../src/index.ts";
import { installMockHost, type MockHost } from "../src/testing.ts";

// The same cases run against the Swift and Kotlin copies (scripts/native-vectors.ts).
const vectors = (await Bun.file(new URL("../vectors/scope.json", import.meta.url)).json()) as {
  glob: [string, string, "path" | "path-deny" | "plain", boolean][];
  url: [string, string, "allow" | "deny", boolean][];
  permits: [CallScope, Record<string, string>, string[], string[], boolean, boolean][];
};

describe("globMatch", () => {
  test.each(vectors.glob)("%j matches %j (%s): %p", (pattern, text, mode, expected) => {
    expect(globMatch(pattern, text, mode !== "plain", mode === "path-deny")).toBe(expected);
  });
});

describe("scopePermits", () => {
  test.each(vectors.permits)(
    "%j permits %j (path %j, url %j, fold %p): %p",
    (scope, value, pathFields, urlFields, fold, expected) => {
      expect(scopePermits(scope, value, pathFields, urlFields, fold)).toBe(expected);
    },
  );
});

describe("urlMatch", () => {
  test.each(vectors.url)("%j matches %j (%s): %p", (pattern, url, kind, expected) => {
    expect(urlMatch(pattern, url, kind === "deny")).toBe(expected);
  });

  test("scopePermits compares url fields as URLs", () => {
    const scope: CallScope = {
      allow: [{ url: "https://*.example.com/*" }],
      deny: [{ url: "*://internal.example.com/*" }],
    };
    expect(scopePermits(scope, { url: "https://docs.example.com/x" }, [], ["url"])).toBe(true);
    expect(scopePermits(scope, { url: "https://evil.com/x.example.com/" }, [], ["url"])).toBe(false);
    expect(scopePermits(scope, { url: "https://internal.example.com:8443/" }, [], ["url"])).toBe(false);
    // Allow without a port: the default port only; the deny above still covers every port.
    expect(scopePermits(scope, { url: "https://docs.example.com:8443/x" }, [], ["url"])).toBe(false);
  });
});

describe("aclCheck", () => {
  const acl: ResolvedAcl = {
    grants: [
      { plugin: "fs", windows: "*", items: ["readFile", "stat"] },
      {
        plugin: "fs",
        windows: [1],
        items: ["writeFile"],
        allow: [{ base: "data", path: "notes/**" }],
        deny: [{ path: "notes/secret/**" }],
      },
      { plugin: "fs", windows: [2], items: ["writeFile"], allow: [{ base: "cache", path: "**" }] },
      { plugin: "win", windows: "*", items: "*" },
    ],
    denied: { win: ["close"], fs: ["listen:change"] },
  };

  test("grants by item and window; deny wins in every window", () => {
    expect(aclCheck(acl, "fs", "readFile", 3)).toEqual({ allowed: true });
    expect(aclCheck(acl, "fs", "remove", 1).allowed).toBe(false);
    expect(aclCheck(acl, "win", "setTitle", 7).allowed).toBe(true);
    expect(aclCheck(acl, "win", "close", 1).allowed).toBe(false);
    expect(aclCheck(acl, "fs", "listen:change", 1).allowed).toBe(false);
    expect(aclCheck(acl, "fs", "writeFile", 3).allowed).toBe(false); // no grant for window 3
    expect(aclCheck(acl, "nope", "x", 1).allowed).toBe(false);
  });

  test("scopes of the matching grants; a grant without allow scopes lifts the allow restriction", () => {
    expect(aclCheck(acl, "fs", "writeFile", 1).scope).toEqual({
      allow: [{ base: "data", path: "notes/**" }],
      deny: [{ path: "notes/secret/**" }],
    });
    expect(aclCheck(acl, "fs", "writeFile", 2).scope).toEqual({ allow: [{ base: "cache", path: "**" }], deny: [] });
    const both: ResolvedAcl = {
      grants: [
        { plugin: "fs", windows: "*", items: ["writeFile"], allow: [{ path: "a/**" }] },
        { plugin: "fs", windows: "*", items: "*", deny: [{ path: "a/private/**" }] },
      ],
    };
    expect(aclCheck(both, "fs", "writeFile", 1).scope).toEqual({ allow: null, deny: [{ path: "a/private/**" }] });
  });

  test("no ACL: everything allowed (builds before PL-11)", () => {
    expect(aclCheck(undefined, "fs", "anything")).toEqual({ allowed: true });
  });
});

describe("scopePermits", () => {
  const scope: CallScope = {
    allow: [{ base: "data", path: "notes/**" }, { base: "cache" }],
    deny: [{ path: "notes/secret/**" }],
  };
  test("allow entries match on all their fields; deny wins; missing fields do not match", () => {
    const ok = (base: string, path: string) => scopePermits(scope, { base, path }, ["path"]);
    expect(ok("data", "notes/a.txt")).toBe(true);
    expect(ok("data", "notes")).toBe(true);
    expect(ok("data", "notes/secret/k")).toBe(false);
    expect(ok("data", "other.txt")).toBe(false);
    expect(ok("cache", "anything/deep")).toBe(true);
    expect(ok("cache", "notes/secret/k")).toBe(false); // deny has no base: it applies to every base
    expect(scopePermits(scope, { path: "notes/a" }, ["path"])).toBe(false);
    expect(scopePermits(undefined, { path: "x" })).toBe(true);
    expect(scopePermits({ allow: null, deny: [] }, { path: "x" })).toBe(true);
  });
});

describe("page side (web implementations) and mock host (native)", () => {
  let host: MockHost | null = null;
  afterEach(() => {
    host?.uninstall();
    host = null;
  });

  interface Api {
    read(args: { path: string }): Promise<string>;
    remove(args: { path: string }): Promise<void>;
  }
  const seen: (WebCallContext | undefined)[] = [];
  const plugin = definePlugin<Api, { change: number }>("fs", {
    methods: ["read", "remove"],
    events: ["change"],
    web: defineWebPlugin<Api, { change: number }>({
      methods: {
        read: async ({ path }, ctx?: WebCallContext) => {
          seen.push(ctx);
          return path;
        },
        remove: async () => {},
      },
      events: { change: () => () => {} },
    }),
  });
  const acl: ResolvedAcl = { grants: [{ plugin: "fs", windows: "*", items: ["read"], deny: [{ path: "secret/**" }] }] };

  test("web: denied methods reject NOT_ALLOWED, allowed ones get their scope, isAllowed reflects it", async () => {
    host = installMockHost({ platform: "web", acl });
    seen.length = 0;
    expect(await plugin.read({ path: "a" })).toBe("a");
    expect(seen).toEqual([{ scope: { allow: null, deny: [{ path: "secret/**" }] } }]);
    const error = await plugin.remove({ path: "a" }).then(
      () => null,
      (e) => e,
    );
    expect(isAkanNativeError(error, "NOT_ALLOWED")).toBe(true);
    expect(plugin.isAllowed("read")).toBe(true);
    expect(plugin.isAllowed("remove")).toBe(false);
    expect(plugin.isSupported("remove")).toBe(true); // platform support is a separate question
  });

  test("native: the host refuses with NOT_ALLOWED and passes the scope to allowed calls", async () => {
    const scopes: unknown[] = [];
    host = installMockHost({
      platform: "android",
      acl,
      plugins: {
        fs: {
          methods: { read: (args, _h, scope) => (scopes.push(scope), args.path), remove: () => {} },
          events: ["change"],
        },
      },
    });
    expect(await plugin.read({ path: "x" })).toBe("x");
    expect(scopes).toEqual([{ allow: null, deny: [{ path: "secret/**" }] }]);
    expect(
      isAkanNativeError(
        await plugin.remove({ path: "x" }).then(
          () => null,
          (e) => e,
        ),
        "NOT_ALLOWED",
      ),
    ).toBe(true);
    // A $listen the capabilities do not grant is refused; the page only logs it.
    const stop = plugin.listen("change", () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(host.subscriptions("fs", "change")).toBe(0);
    stop();
  });

  test("no ACL in boot: everything allowed as before", async () => {
    host = installMockHost({ platform: "web" });
    expect(plugin.isAllowed("remove")).toBe(true);
    await plugin.remove({ path: "a" });
  });
});
