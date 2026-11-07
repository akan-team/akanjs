import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { AppRouteSource } from "@akanjs/devkit/executors";
import { PreviewView } from "@akanjs/devkit/preview";
import type { LogRecord } from "akanjs/common";
import { AppPreview, type AppPreviewPage, type AppPreviewReport } from "./appPreview";

const i18n = { defaultLocale: "en", locales: ["en", "ko"] };

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

describe("AppPreview.pagePaths", () => {
  test("adds the default locale where a path has none and keeps one that does", () => {
    expect(AppPreview.pagePaths([], i18n, { csr: false })).toEqual(["/en/"]);
    expect(AppPreview.pagePaths(["/board", "ko/board", "/en/board?tab=2", "/board"], i18n, { csr: false })).toEqual([
      "/en/board",
      "/ko/board",
      "/en/board?tab=2",
    ]);
  });

  test('keeps an unprefixed path under localePrefix "as-needed", which serves the default locale there', () => {
    const asNeeded = { ...i18n, localePrefix: "as-needed" as const };
    expect(AppPreview.pagePaths([], asNeeded, { csr: false })).toEqual(["/"]);
    expect(AppPreview.pagePaths(["/board", "/ko/board"], asNeeded, { csr: false })).toEqual(["/board", "/ko/board"]);
    expect(AppPreview.pagePaths(["/board"], asNeeded, { csr: true })).toEqual([
      "/en/board?csr=true&akanMobileTarget=preview",
    ]);
  });

  test("takes a full URL by its path, and opens the CSR boot when asked", () => {
    expect(AppPreview.pagePaths(["http://localhost:8282/en/board"], i18n, { csr: true })).toEqual([
      "/en/board?csr=true&akanMobileTarget=preview",
    ]);
  });

  test("names a screenshot after the page and its boot", () => {
    expect(AppPreview.screenshotName("/en/")).toBe("en.png");
    expect(AppPreview.screenshotName("/en/board/[id]?csr=true")).toBe("en-board-_id_.csr.png");
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
          return new Response("<!doctype html><title>Missing</title><body>missing</body>", {
            status: 404,
            headers: { "content-type": "text/html" },
          });
        },
      });
      const app = {
        name: "demo",
        workspace: { workspaceRoot: root },
        getDevPort: async () => server.port,
        getConfig: async () => ({ i18n }),
      } as unknown as App;
      try {
        const report = await AppPreview.run(app, { paths: ["/board", "/gone"], timeoutMs: 20_000 });
        expect(report.server).toBe("running");
        expect(report.logsRead).toBe(false);
        expect(report.pages.map((page) => [page.path, page.status, page.failed, page.text])).toEqual([
          ["/en/board", 200, false, "Board"],
          ["/en/gone", 404, true, "missing"],
        ]);
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
