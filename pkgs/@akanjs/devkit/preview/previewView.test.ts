import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PreviewChrome } from "./PreviewChrome";
import { PreviewView } from "./PreviewView";

const serve = (html: string, status = 200) =>
  Bun.serve({ port: 0, fetch: () => new Response(html, { status, headers: { "content-type": "text/html" } }) });

const browserTestMs = PreviewView.startTimeoutMs + 30_000;
const slowChromeRuns = PreviewView.isAvailable("chrome") && process.platform !== "win32";

const withSlowChrome = async (body: string, startSeconds = 3) => {
  const dir = await mkdtemp(path.join(tmpdir(), "akan-slow-chrome-"));
  const chrome = path.join(dir, "chrome");
  const chromeLog = path.join(dir, "chrome.log");
  //? Bun.WebView sends the browser's stderr to /dev/null, which would hide why it died.
  await writeFile(
    chrome,
    `#!/bin/sh\nexec 2>>"${chromeLog}"\nsleep ${startSeconds}\nexec "${PreviewChrome.executable()}" "$@"\n`,
  );
  await chmod(chrome, 0o755);
  const script = `const { PreviewView } = await import(${JSON.stringify(path.join(import.meta.dir, "PreviewView.ts"))});\n${body}`;
  //? Chrome is spawned once per process, so only a fresh process takes the slow executable.
  const child = Bun.spawn([process.execPath, "-e", script], {
    env: { ...process.env, [PreviewChrome.pathEnvKey]: chrome },
    stdout: "pipe",
    stderr: "pipe",
    timeout: PreviewView.startTimeoutMs + 15_000,
  });
  try {
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const chromeErr = await Bun.file(chromeLog)
      .text()
      .catch(() => "");
    return { code, out: out.trim(), log: `${err}\nChrome's stderr:\n${chromeErr}` };
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
};

describe("PreviewView", () => {
  test("reports whether this Bun build can drive a headless page at all", () => {
    expect(typeof PreviewView.available).toBe("boolean");
  });

  test("formats a console call the way the console prints it", () => {
    expect(PreviewView.formatConsole(["%cstyled%c %s of %d", "color:red", "", "two", 3, "extra"])).toBe(
      "styled two of 3 extra",
    );
    expect(PreviewView.formatConsole(["a\n\n\n  \nb"])).toBe("a\nb");
    expect(PreviewView.formatConsole(["x".repeat(2_000)])).toHaveLength(1_500);
  });

  test.skipIf(!PreviewView.available)(
    "finds an empty body and a console error on a real page",
    async () => {
      const server = serve('<!doctype html><html><body></body><script>console.error("boom")</script></html>');
      try {
        const probe = await PreviewView.probe(`http://localhost:${server.port}/`);
        expect(probe.pageErrors.join(" ")).toContain("rendered empty");
        expect(probe.consoleErrors.join(" ")).toContain("boom");
      } finally {
        server.stop(true);
      }
    },
    browserTestMs,
  );

  test.skipIf(!PreviewView.available)(
    "reads the status, the live title, a failed dev build and a page wider than the viewport",
    async () => {
      const server = serve(
        [
          "<!doctype html><html><head><title>Before</title></head><body>",
          '<div style="width:900px">wide</div>',
          '<div class="__akan_hmr_overlay" data-status="error">Build failed: page.tsx</div>',
          '<script>document.title = "After";</script>',
          "</body></html>",
        ].join(""),
        404,
      );
      try {
        const probe = await PreviewView.probe(`http://localhost:${server.port}/missing`, { width: 390, height: 844 });
        expect(probe.status).toBe(404);
        expect(probe.title).toBe("After");
        expect(probe.text).toBe("wide Build failed: page.tsx");
        expect(probe.pageErrors).toEqual(["The dev build failed: Build failed: page.tsx"]);
        expect(probe.domFindings.join(" ")).toContain("first wider element: div");
      } finally {
        server.stop(true);
      }
    },
    browserTestMs,
  );

  test.skipIf(!PreviewView.available)(
    "gives up on a server that takes the connection and never answers",
    async () => {
      const server = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => undefined) });
      try {
        await expect(PreviewView.probe(`http://localhost:${server.port}/`, { timeoutMs: 1_500 })).rejects.toThrow(
          "Timed out loading",
        );
      } finally {
        server.stop(true);
      }
    },
    browserTestMs,
  );

  test.skipIf(!slowChromeRuns)(
    "starts the page's bound once the browser is up, however long Chrome takes to spawn",
    async () => {
      const server = serve("<!doctype html><title>Up</title><body>up</body>");
      try {
        const { code, out, log } = await withSlowChrome(
          `const probe = await PreviewView.probe("http://localhost:${server.port}/", { engine: "chrome", timeoutMs: 1_500 });
console.log(probe.text);`,
        );
        expect(out, log).toBe("up");
        expect(code, log).toBe(0);
      } finally {
        server.stop(true);
      }
    },
    browserTestMs,
  );

  test.skipIf(!slowChromeRuns)(
    "gives a later page only its own bound for a browser that missed its start, and recovers once it is up",
    async () => {
      const { code, out, log } = await withSlowChrome(
        `const open = () =>
  PreviewView.probe("about:blank", { engine: "chrome", startTimeoutMs: 1_500, timeoutMs: 1_000 }).then(
    () => "opened",
    (error) => error.message,
  );
console.log(await open());
console.log(await open());
let late = await open();
for (let tries = 0; late.startsWith("Timed out starting") && tries < 100; tries++) late = await open();
console.log(late);
Bun.WebView.closeAll();
await Bun.sleep(500);
console.log(await open());
Bun.WebView.closeAll();`,
        6,
      );
      expect(out, log).toBe(
        [
          "Timed out starting the chrome browser after 1.5 s.",
          "Timed out starting the chrome browser after 1 s.",
          "opened",
          "Timed out starting the chrome browser after 1.5 s.",
        ].join("\n"),
      );
      expect(code, log).toBe(0);
    },
    browserTestMs,
  );

  test.skipIf(!slowChromeRuns)(
    "gives a browser killed after it missed its start the full bound for its next start",
    async () => {
      const { code, out, log } = await withSlowChrome(
        `const open = () =>
  PreviewView.probe("about:blank", { engine: "chrome", startTimeoutMs: 1_500, timeoutMs: 1_000 }).then(
    () => "opened",
    (error) => error.message,
  );
console.log(await open());
const killed = open();
Bun.WebView.closeAll();
console.error(await killed);
await Bun.sleep(500);
console.log(await open());
Bun.WebView.closeAll();`,
        6,
      );
      expect(out, log).toBe(
        [
          "Timed out starting the chrome browser after 1.5 s.",
          "Timed out starting the chrome browser after 1.5 s.",
        ].join("\n"),
      );
      expect(code, log).toBe(0);
    },
    browserTestMs,
  );
});
