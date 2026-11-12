import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { AppRouteSource } from "@akanjs/devkit/executors";
import { PreviewView } from "@akanjs/devkit/preview";
import type { AkanLocalePrefix, LogRecord } from "akanjs/common";
import { AppPreview, type AppPreviewPage, type AppPreviewReport } from "./appPreview";

const i18n = { defaultLocale: "en", locales: ["en", "ko"] };
const dev = "http://localhost:8282";

type I18n = typeof i18n & { localePrefix?: AkanLocalePrefix };

const appOf = (cwdPath: string, config: I18n = i18n, prefix = "/api") =>
  ({
    name: "demo",
    cwdPath,
    getConfig: async () => ({ i18n: config, api: { prefix } }),
  }) as unknown as App;

const pathsOf = async (
  paths: string[],
  { csr = false, config = i18n, prefix = "/api", root = "/nowhere", pages = [] as string[] } = {},
) => (await AppPreview.planOf(appOf(root, config, prefix), { paths, csr }, { paths: pages, skipped: [] }, dev)).paths;

const pageOf = (overrides: Partial<AppPreviewPage> = {}): AppPreviewPage => ({
  path: "/en/board",
  url: "http://localhost:8282/en/board",
  finalUrl: "http://localhost:8282/en/board",
  status: 200,
  title: "Board",
  text: "Board",
  ms: 1_200,
  failed: false,
  error: null,
  pageErrors: [],
  clientReports: [],
  serverErrors: [],
  consoleErrors: [],
  consoleWarnings: [],
  domFindings: [],
  screenshot: null,
  ...overrides,
});

const recordOf = (name: string, message: string, attrs: Record<string, unknown> = {}) =>
  ({ name, message, attrs, level: "error" }) as unknown as LogRecord;

describe("AppPreview path rules", () => {
  test("adds the default locale where a path has none and keeps one that does", async () => {
    expect(await pathsOf([])).toEqual(["/en/"]);
    expect(await pathsOf(["/board", "ko/board", "/en/board?tab=2", "/board"])).toEqual([
      "/en/board",
      "/ko/board",
      "/en/board?tab=2",
    ]);
  });

  test('keeps an unprefixed path under localePrefix "as-needed", which serves the default locale there', async () => {
    const config = { ...i18n, localePrefix: "as-needed" as const };
    expect(await pathsOf([], { config })).toEqual(["/"]);
    expect(await pathsOf(["/board", "/ko/board"], { config })).toEqual(["/board", "/ko/board"]);
    expect(await pathsOf(["/board"], { config, csr: true })).toEqual(["/en/board?csr=true&akanMobileTarget=preview"]);
  });

  test("opens a full URL's path exactly as written, the way to reach a route the rules do not know", async () => {
    expect(await pathsOf([`${dev}/oauth/authorize?client_id=a`, `${dev}/board`], { csr: true })).toEqual([
      "/oauth/authorize?client_id=a",
      "/board",
    ]);
    expect(await pathsOf(["HTTP://localhost:8282/oauth/token", "Https://localhost:8282/x"])).toEqual([
      "/oauth/token",
      "/x",
    ]);
  });

  test("keeps a path that starts with // on the dev server instead of reading it as another host", async () => {
    expect(await pathsOf([`${dev}//example.com/x?a=1`, "//example.com/board"])).toEqual([
      "/example.com/x?a=1",
      "/en/example.com/board",
    ]);
    expect(AppPreview.probeUrlOf("http://localhost:8282", "//example.com/x").origin).toBe("http://localhost:8282");
    expect(AppPreview.probeUrlOf("http://localhost:8282", "board").href).toBe("http://localhost:8282/board");
  });

  test("gives every route-derived page the locale, even one that shares a server route's path", async () => {
    expect(await pathsOf([], { pages: ["/openapi.json", "/board"] })).toEqual(["/en/openapi.json", "/en/board"]);
    expect(await pathsOf(["/openapi.json"], { csr: true, pages: ["/openapi.json"] })).toEqual([
      "/openapi.json",
      "/en/openapi.json?csr=true&akanMobileTarget=preview",
    ]);
  });

  test("opens Studio, the other framework routes and served files as written, without a locale or the CSR boot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-preview-public-"));
    try {
      await Bun.write(path.join(root, "public/images/logo.png"), "png");
      const paths = [
        "/_akan/studio",
        "/_akan/studio?view=runtime",
        "/__rsc/board",
        "/.well-known/assetlinks.json",
        "/backend/memo",
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml",
        "/shop/manifest.webmanifest",
        "/openapi.json",
        "/mcp",
        "/images/logo.png",
        "/images/missing.png",
        "/shop/sitemap.xml",
        "/_akanish",
        "/board",
      ];
      expect(await pathsOf(paths, { csr: true, prefix: "/backend", root })).toEqual([
        "/_akan/studio",
        "/_akan/studio?view=runtime",
        "/__rsc/board",
        "/.well-known/assetlinks.json",
        "/backend/memo",
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml",
        "/shop/manifest.webmanifest",
        "/openapi.json",
        "/mcp",
        "/images/logo.png",
        "/en/images/missing.png?csr=true&akanMobileTarget=preview",
        "/en/shop/sitemap.xml?csr=true&akanMobileTarget=preview",
        "/en/_akanish?csr=true&akanMobileTarget=preview",
        "/en/board?csr=true&akanMobileTarget=preview",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    expect(await pathsOf(["/api/memo", "/apidocs"])).toEqual(["/api/memo", "/en/apidocs"]);
  });

  test("reads a path that ends in a slash as a page outside the framework prefixes, as the server does", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-preview-slash-"));
    try {
      await Bun.write(path.join(root, "public/logo.png"), "png");
      const paths = [
        "/openapi.json/",
        "/mcp/",
        "/favicon.ico/",
        "/robots.txt/",
        "/shop/manifest.webmanifest/",
        "/logo.png/",
        "/_akan/studio/",
        "/api/memo/",
        "/board/",
      ];
      const boot = "?csr=true&akanMobileTarget=preview";
      expect(await pathsOf(paths, { csr: true, root })).toEqual([
        `/en/openapi.json/${boot}`,
        `/en/mcp/${boot}`,
        `/en/favicon.ico/${boot}`,
        `/en/robots.txt/${boot}`,
        `/en/shop/manifest.webmanifest/${boot}`,
        `/en/logo.png/${boot}`,
        "/_akan/studio/",
        "/api/memo/",
        `/en/board/${boot}`,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps a page whose last segment has a dot a page", async () => {
    expect(await pathsOf(["/release/1.2.3", "/user/a@b.com", "/docs/robots.txt"])).toEqual([
      "/en/release/1.2.3",
      "/en/user/a@b.com",
      "/en/docs/robots.txt",
    ]);
    expect(await pathsOf(["/en/release/1.2.3", "/en/favicon.ico"], { csr: true })).toEqual([
      "/en/release/1.2.3?csr=true&akanMobileTarget=preview",
      "/en/favicon.ico?csr=true&akanMobileTarget=preview",
    ]);
  });

  test("names a screenshot after the page, its query and its boot, one name per page", () => {
    expect(AppPreview.screenshotName("/en/")).toBe("en.png");
    expect(AppPreview.screenshotName("/")).toBe("_index.png");
    expect(AppPreview.screenshotName("/en/board/[id]?csr=true&akanMobileTarget=preview")).toMatch(
      /^en-board-_id__\w{1,6}\.csr\.png$/,
    );
    expect(AppPreview.screenshotName("/_akan/studio?view=runtime")).toMatch(
      /^_akan-studio_\w{1,6}\.view-runtime-\w{1,6}\.png$/,
    );
    expect(AppPreview.screenshotName("/en/board?tab=a/b&csr=true&akanMobileTarget=preview")).toMatch(
      /^en-board\.tab-a_b-\w{1,6}\.csr\.png$/,
    );
    const boot = ["?csr=true&akanMobileTarget=preview", "?akanMobileTarget=preview", "?csr=true", "?csr=1"];
    const queries = ["", ...boot, "?a=b+c", "?a=b%20c", "?view=runtime", "?view=signals", "?a=b&c=d"];
    const names = [...queries, "?a=b-c-d", "?a-b=c-d", "?q=사과", "?q=포도"].map((query) =>
      AppPreview.screenshotName(`/x${query}`),
    );
    expect(new Set(names).size).toBe(names.length);
    const pages = ["/a/b", "/a-b", "/a_b", "/a/b-c", "/a-b/c", "/", "/index", "/_index", "/a", "/A", "/a//b", "/사과"];
    const pageNames = pages.map((page) => AppPreview.screenshotName(page).toLowerCase());
    expect(new Set(pageNames).size).toBe(pages.length);
    const long = AppPreview.screenshotName(`/${"p".repeat(300)}?q=${"v".repeat(300)}&csr=true`);
    expect(long.length).toBeLessThan(160);
    expect(long).not.toBe(AppPreview.screenshotName(`/${"p".repeat(299)}?q=${"v".repeat(300)}&csr=true`));
  });
});

describe("AppPreview.planOf", () => {
  const none = { paths: [] as string[], skipped: [] as string[] };
  const planOf = (
    options: Parameters<typeof AppPreview.planOf>[1],
    changed = none,
    app = appOf("/nowhere", i18n, "/backend"),
  ) => AppPreview.planOf(app, options, changed, dev);

  test("reads the app's API prefix and public/ for the paths it opens as written", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-preview-app-"));
    try {
      await Bun.write(path.join(root, "public/logo.png"), "png");
      const plan = await planOf(
        { paths: ["/backend/memo", "/logo.png", "/board", "/mcp"], changed: true },
        { paths: ["/openapi.json"], skipped: [] },
        appOf(root, i18n, "/backend"),
      );
      expect(plan).toEqual({
        paths: ["/backend/memo", "/logo.png", "/en/board", "/mcp", "/en/openapi.json"],
        notes: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("opens a page --changed finds as a page, unprefixed only under as-needed without --csr", async () => {
    const changed = { paths: ["/board"], skipped: [] };
    const asNeeded = appOf("/nowhere", { ...i18n, localePrefix: "as-needed" as const }, "/backend");
    expect((await planOf({ changed: true }, changed)).paths).toEqual(["/en/board"]);
    expect((await planOf({ changed: true }, changed, asNeeded)).paths).toEqual(["/board"]);
    expect((await planOf({ changed: true, csr: true }, changed, asNeeded)).paths).toEqual([
      "/en/board?csr=true&akanMobileTarget=preview",
    ]);
  });

  test("opens a page once whether or not its path ends in a slash", async () => {
    const changed = { paths: ["/", "/board/"], skipped: [] };
    expect((await planOf({ paths: ["/en", "/en/board", "/board?tab=2"], changed: true }, changed)).paths).toEqual([
      "/en",
      "/en/board",
      "/en/board?tab=2",
    ]);
  });

  test("opens once two paths that would write one screenshot, and names the one that folded", async () => {
    const booted = "/en/board?akanMobileTarget=preview&csr=true";
    expect(await planOf({ paths: ["/board?akanMobileTarget=preview", "/board"], csr: true })).toEqual({
      paths: [booted],
      notes: [`/board opens as ${booted}, which writes the same screenshot.`],
    });
    expect(await planOf({ paths: ["/x?a=1&&b=2", "/x?a=1&b=2", "/x?b=2&a=1"] })).toEqual({
      paths: ["/en/x?a=1&&b=2", "/en/x?b=2&a=1"],
      notes: ["/x?a=1&b=2 opens as /en/x?a=1&&b=2, which writes the same screenshot."],
    });
    expect(await planOf({ paths: ["/board", "/en/board", "/board"] })).toEqual({ paths: ["/en/board"], notes: [] });
    expect(await planOf({ paths: ["/openapi.json", "/openapi.json/"] })).toEqual({
      paths: ["/openapi.json", "/en/openapi.json/"],
      notes: [],
    });
  });

  test("names in the --csr note only the rows it opens, not a path that folded into one", async () => {
    expect(await planOf({ paths: ["/backend/memo", "/backend/memo/", "/board"], csr: true })).toEqual({
      paths: ["/backend/memo", "/en/board?csr=true&akanMobileTarget=preview"],
      notes: [
        "--csr does not apply to /backend/memo: it opens without the CSR boot.",
        "/backend/memo/ opens as /backend/memo, which writes the same screenshot.",
      ],
    });
  });

  test("says which paths --csr does not apply to instead of dropping it silently", async () => {
    const authorize = `${dev}/oauth/authorize`;
    const plan = await planOf({ paths: [authorize, "/openapi.json", "/board", "/openapi.json"], csr: true });
    expect(plan).toEqual({
      paths: ["/oauth/authorize", "/openapi.json", "/en/board?csr=true&akanMobileTarget=preview"],
      notes: [`--csr does not apply to ${authorize}, /openapi.json: they open without the CSR boot.`],
    });
    expect((await planOf({ paths: ["/mcp"], csr: true })).notes).toEqual([
      "--csr does not apply to /mcp: it opens without the CSR boot.",
    ]);
    expect((await planOf({ paths: ["/openapi.json"] })).notes).toEqual([]);
  });

  test("says when a full URL names another server, whose path it opens on the dev server instead", async () => {
    const plan = await planOf({ paths: ["https://staging.example.com/board", "http://127.0.0.1:8282/en/board"] });
    expect(plan).toEqual({
      paths: ["/board", "/en/board"],
      notes: [`https://staging.example.com/board names another server: its path opens on ${dev}.`],
    });
    const others = ["http://localhost:3000/a", "https://localhost:8282/b"];
    expect((await planOf({ paths: others })).notes).toEqual([
      `${others.join(", ")} name other servers: their paths open on ${dev}.`,
    ]);
  });

  test("takes only a host the dev server binds on its port for the dev server, and notes any other", async () => {
    const local = [
      "http://localhost:8282/a",
      "http://localhost.:8282/b",
      "http://LOCALHOST:8282/c",
      "http://127.0.0.1:8282/d",
      "http://127.1:8282/e",
      "http://0.0.0.0:8282/f",
    ];
    for (const url of local) expect((await planOf({ paths: [url] })).notes).toEqual([]);
    const others = [
      "http://demo.localhost:8282/a",
      "http://admin.localhost:8282/b",
      "http://127.0.0.2:8282/c",
      "http://[::1]:8282/d",
      "http://[::]:8282/e",
      "http://10.0.0.5:8282/f",
      "http://localhost:3000/g",
      "https://127.0.0.1:8282/h",
      "http://localhost/i",
      "http://notlocalhost:8282/j",
    ];
    for (const url of others)
      expect((await planOf({ paths: [url] })).notes).toEqual([
        `${url} names another server: its path opens on ${dev}.`,
      ]);
    expect((await planOf({ paths: others })).notes).toEqual([
      `${others.join(", ")} name other servers: their paths open on ${dev}.`,
    ]);
  });

  test("refuses --changed with nothing to open and no path typed", async () => {
    const skipped = { paths: [], skipped: ["/admin/:userId needs a concrete path"] };
    await expect(planOf({ changed: true }, skipped)).rejects.toThrow(
      "No page to open: /admin/:userId needs a concrete path. Pass a concrete path, e.g. `akan preview demo /memo/1`.",
    );
    expect((await planOf({ paths: ["/memo/1"], changed: true }, skipped)).paths).toEqual(["/en/memo/1"]);
  });
});

describe("AppPreview.changedPages", () => {
  const pageDir = "/repo/apps/demo/page";
  const sourcesOf = (files: string[]): AppRouteSource[] =>
    files.map((file) => ({ key: `./${file}`, absPath: `${pageDir}/${file}`, info: { devOnly: false } }));
  const sources = sourcesOf([
    "_layout.tsx",
    "_index.tsx",
    "about.tsx",
    "admin/_layout.tsx",
    "admin/users.tsx",
    "admin/[userId].tsx",
  ]);

  test("opens a changed page, and every page under a changed layout but one it cannot fill a param of", () => {
    expect(AppPreview.changedPages(sources, [`${pageDir}/about.tsx`])).toEqual({ paths: ["/about"], skipped: [] });
    expect(AppPreview.changedPages(sources, [`${pageDir}/admin/_layout.tsx`])).toEqual({
      paths: ["/admin/users"],
      skipped: ["/admin/:userId needs a concrete path"],
    });
  });

  test("falls back to the home page when no route file changed", () => {
    expect(AppPreview.changedPages(sources, ["/repo/apps/demo/ui/Card.tsx"])).toEqual({ paths: ["/"], skipped: [] });
  });

  test("opens only the first few pages a root layout change reaches", () => {
    const many = sourcesOf([
      "_layout.tsx",
      ...Array.from({ length: AppPreview.changedPageLimit + 2 }, (_, idx) => `page${idx}.tsx`),
    ]);
    const { paths, skipped } = AppPreview.changedPages(many, [`${pageDir}/_layout.tsx`]);
    expect(paths).toHaveLength(AppPreview.changedPageLimit);
    expect(skipped).toEqual(["2 more page(s) under a changed layout"]);
  });
});

describe("AppPreview.attribute", () => {
  test("fails the page on a client report for it or a server error, and skips a report from another page", () => {
    const page = pageOf();
    AppPreview.attribute(page, [
      recordOf("ClientReport", "Uncaught error on /en/board (ssr): TypeError: x", { href: "/en/board?tab=2" }),
      recordOf("ClientReport", "Uncaught error on /en/other (ssr): boom", { href: "/en/other" }),
      recordOf("WebRouter", "[SSR] render failed scope=/en/board: boom\n    at a\n    at b"),
    ]);
    expect(page.clientReports).toEqual(["Uncaught error on /en/board (ssr): TypeError: x"]);
    expect(page.serverErrors).toEqual(["[WebRouter] [SSR] render failed scope=/en/board: boom\n    at a\n    at b"]);
    expect(page.failed).toBe(true);
  });
});

describe("AppPreview.render", () => {
  const report: AppPreviewReport = {
    app: "demo",
    origin: "http://localhost:8282",
    engine: "webkit",
    viewport: AppPreview.mobileViewport,
    server: "kept",
    serverPid: 4242,
    serverLog: "local/apps/demo/runtime/preview/server.log",
    logsRead: false,
    skipped: ["/admin/:userId needs a concrete path"],
    notes: ["--csr does not apply to /openapi.json: it opens without the CSR boot."],
    pages: [
      pageOf({ path: "/en/", url: "http://localhost:8282/en/", finalUrl: "http://localhost:8282/en/explore" }),
      pageOf({ failed: true, status: 500, pageErrors: ["The page body rendered empty."], text: "" }),
    ],
  };

  test("prints a verdict per page, the redirect, each finding and how to stop a kept server", () => {
    const text = AppPreview.render(report);
    expect(text).toContain(`left running (pid 4242; stop it with \`${AppPreview.stopArgvOf(4242).join(" ")}\`)`);
    expect(text).toContain("client and server errors are not shown");
    expect(text).toContain("Not opened: /admin/:userId needs a concrete path.");
    expect(text).toContain("Note: --csr does not apply to /openapi.json: it opens without the CSR boot.");
    expect(text).toContain('ok    /en/ -> /en/explore  200  "Board"  1.2s');
    expect(text).toContain('FAIL  /en/board  500  "Board"  1.2s\n  page: The page body rendered empty.');
    expect(text.trim().endsWith("1 of 2 page(s) failed.")).toBe(true);
  });

  test("stops a server's process group, and on Windows, which has none, its process tree", () => {
    expect(AppPreview.stopArgvOf(4242, "linux")).toEqual(["kill", "-INT", "-4242"]);
    expect(AppPreview.stopArgvOf(4242, "darwin")).toEqual(["kill", "-INT", "-4242"]);
    expect(AppPreview.stopArgvOf(4242, "win32")).toEqual(["taskkill", "/PID", "4242", "/T", "/F"]);
  });
});

describe("AppPreview.run", () => {
  const devServerOf = (root: string) =>
    Bun.serve({
      port: 0,
      fetch: (req) => {
        const { pathname } = new URL(req.url);
        if (pathname === "/_akan/app/health") return Response.json({ status: "running" });
        if (pathname === "/_akan/app/info") return Response.json({ appName: "demo", workspaceRoot: root });
        return new Response("missing", { status: 404 });
      },
    });

  test("opens the pages --changed reaches from git and reports what it skipped and why --csr did not apply", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-preview-changed-"));
    const server = devServerOf(root);
    const pageDir = path.join(root, "apps/demo/page");
    const files = ["about.tsx", "admin/_layout.tsx", "admin/users.tsx", "admin/[userId].tsx"];
    const opened: string[] = [];
    const runtimeDir = process.env.AKAN_RUNTIME_DIR;
    process.env.AKAN_RUNTIME_DIR = path.join(root, "runtime");
    const unavailable = spyOn(PreviewView, "unavailableReason").mockReturnValue(undefined);
    const probe = spyOn(PreviewView, "probe").mockImplementation(async (url) => {
      opened.push(url);
      const empty: string[] = [];
      return {
        url,
        finalUrl: url,
        status: 200,
        title: "",
        text: "",
        pageErrors: empty,
        consoleErrors: empty,
        consoleWarnings: empty,
        domFindings: empty,
      };
    });
    try {
      for (const file of files) await Bun.write(path.join(pageDir, file), "export default null;\n");
      const git = (...args: string[]) =>
        Bun.$`git -c user.name=akan -c user.email=akan@example.com -c commit.gpgsign=false -c core.hooksPath=/dev/null ${args}`
          .cwd(root)
          .quiet();
      await git("init", "-q");
      await git("add", "apps/demo/page/about.tsx");
      await git("commit", "-q", "--no-verify", "-m", "base");
      const app = {
        name: "demo",
        cwdPath: path.join(root, "apps/demo"),
        workspace: { workspaceRoot: root },
        getDevPort: async () => server.port,
        getConfig: async () => ({ i18n, api: { prefix: "/api" } }),
        getRouteSources: async () =>
          files.map((file) => ({ key: `./${file}`, absPath: path.join(pageDir, file), info: { devOnly: false } })),
      } as unknown as App;
      const report = await AppPreview.run(app, { changed: true, csr: true, paths: ["/openapi.json"] });
      const origin = `http://localhost:${server.port}`;
      expect(report.skipped).toEqual(["/admin/:userId needs a concrete path"]);
      expect(report.notes).toEqual(["--csr does not apply to /openapi.json: it opens without the CSR boot."]);
      expect(opened).toEqual([`${origin}/openapi.json`, `${origin}/en/admin/users?csr=true&akanMobileTarget=preview`]);
      expect(report.pages.map((page) => [page.path, page.failed])).toEqual([
        ["/openapi.json", false],
        ["/en/admin/users?csr=true&akanMobileTarget=preview", false],
      ]);
    } finally {
      if (runtimeDir === undefined) delete process.env.AKAN_RUNTIME_DIR;
      else process.env.AKAN_RUNTIME_DIR = runtimeDir;
      unavailable.mockRestore();
      probe.mockRestore();
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  });

  test.skipIf(!PreviewView.available)(
    "uses the dev server that answers as this app and probes its pages without starting another",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "akan-preview-"));
      const server = Bun.serve({
        port: 0,
        fetch: (req) => {
          const { pathname } = new URL(req.url);
          if (pathname === "/_akan/app/health") return Response.json({ status: "running" });
          if (pathname === "/_akan/app/info") return Response.json({ appName: "demo", workspaceRoot: root });
          if (pathname === "/en/board")
            return new Response("<!doctype html><title>Board</title><body><h1>Board</h1></body>", {
              headers: { "content-type": "text/html" },
            });
          if (pathname === "/_akan/studio")
            return new Response("<!doctype html><title>Akan Studio</title><body><h1>Studio</h1></body>", {
              headers: { "content-type": "text/html" },
            });
          return new Response("<!doctype html><title>Missing</title><body>missing</body>", {
            status: 404,
            headers: { "content-type": "text/html" },
          });
        },
      });
      const app = {
        name: "demo",
        cwdPath: root,
        workspace: { workspaceRoot: root },
        getDevPort: async () => server.port,
        getConfig: async () => ({ i18n, api: { prefix: "/api" } }),
      } as unknown as App;
      try {
        const paths = ["/board", "/gone", "/_akan/studio", "http://staging.example.com/en/board"];
        const report = await AppPreview.run(app, { paths, timeoutMs: 20_000 });
        expect(report.server).toBe("running");
        expect(report.notes).toEqual([
          `http://staging.example.com/en/board names another server: its path opens on http://localhost:${server.port}.`,
        ]);
        expect(report.logsRead).toBe(false);
        expect(report.pages.map((page) => [page.path, page.status, page.failed, page.text])).toEqual([
          ["/en/board", 200, false, "Board"],
          ["/en/gone", 404, true, "missing"],
          ["/_akan/studio", 200, false, "Studio"],
        ]);
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    PreviewView.startTimeoutMs + 60_000,
  );
});
