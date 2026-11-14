import { describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { Logger, logSeverity } from "akanjs/common";
import { RscWorker } from "./rscWorkerHost";
import { SsrStaticApp } from "./ssrStaticApp";
import type { BaseBuildArtifact } from "./types";
import type { WebRouteContext } from "./webRouteContext";
import { WebStaticApp } from "./webStaticApp";

interface Drawn {
  ok: boolean;
  drawn: boolean;
  html: string | null;
}

const clientId = "staticapp/client";
const clientModule = path.join(import.meta.dir, "rscStaticAppClient.fixture.tsx");
const clientNames = ["ClientNote", "BrowserChart", "NeverReady", "ClientThrows"];
const ssrManifest = {
  moduleLoading: null,
  moduleMap: {
    [clientId]: Object.fromEntries(
      clientNames.map((name) => [name, { id: clientModule, chunks: [clientModule, clientModule], name }]),
    ),
  },
};
const signedIn: [string, string][] = [["authorization", "Bearer u1"]];

const withStaticAppWorker = async (
  run: (
    draw: (name: string, headers?: [string, string][], deadlineMs?: number) => Promise<Drawn>,
    seen: { logs: string[]; warnings: string[] },
  ) => Promise<void>,
) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "staticapp",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscStaticApp.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: Object.fromEntries(
      clientNames.map((name) => [`${clientId}#${name}`, { id: clientId, chunks: [], name }]),
    ),
  } as unknown as BaseBuildArtifact);
  const seen = { logs: [] as string[], warnings: [] as string[] };
  rsc.onLogRecords = (records) => {
    for (const record of records) seen.logs.push(JSON.stringify(record));
  };
  const logger = new Logger("SsrStaticAppTest");
  logger.warn = (message: string) => void seen.warnings.push(message);
  const ssr = new SsrStaticApp(logger);
  try {
    await rsc.ready;
    rsc.setLogLevel(logSeverity.warn);
    await run(async (name, headers = signedIn, deadlineMs = SsrStaticApp.deadlineMs) => {
      const deadlineAt = Date.now() + deadlineMs;
      const { run: page, drawn } = await rsc.drawPagePrompt({ name, arguments: {}, headers }, undefined, deadlineMs);
      if (!page.ok || !drawn) return { ok: page.ok, drawn: false, html: null };
      const html = await ssr.render(
        {
          app: name,
          url: page.url,
          headers,
          lang: "en",
          drawing: drawn,
          ssrManifest,
          origin: "https://board.example.com",
          stylesheetHref: "/_akan/styles.css",
        },
        deadlineAt - Date.now(),
      );
      return { ok: true, drawn: true, html };
    }, seen);
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("a static app drawn as HTML", () => {
  test("is the app alone in its root's look, with no script and its suspended child resolved in place", async () => {
    await withStaticAppWorker(async (draw) => {
      const { html } = await draw("showBoard");
      expect(html).toStartWith("<!DOCTYPE html>");
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain('<html lang="en" data-theme="dark">');
      expect(html).toContain('<base href="https://board.example.com/" target="_blank"/>');
      expect(html).toContain('<link rel="stylesheet" href="https://board.example.com/_akan/styles.css"/>');
      expect(html).toContain('<section data-app-root="/board">');
      expect(html).toContain("<h1>Board</h1>");
      expect(html).toContain("<b>client note</b>");
      expect(html).toContain("<p>late note</p>");
      expect(html).not.toContain("loading");
      expect(html).not.toContain("page frame");
      expect(html).not.toContain("board page");
    });
  }, 20_000);

  test("is never drawn for a caller the guards refuse, nor for an app that is not static", async () => {
    await withStaticAppWorker(async (draw) => {
      expect(await draw("showBoard", [])).toEqual({ ok: false, drawn: false, html: null });
      expect(await draw("showLiveBoard")).toEqual({ ok: true, drawn: false, html: null });
    });
  }, 20_000);

  test("drops a script the app wrote, its end tag malformed or not, and sends nothing when one could be spliced", async () => {
    await withStaticAppWorker(async (draw) => {
      const { html } = await draw("showScripted");
      expect(html).toContain("<h1>Scripted</h1>");
      expect(html).toContain("<p>kept</p>");
      expect(html).not.toMatch(/<script|boot\(\)|inner\(\)/i);
      expect(await draw("showSpliced")).toEqual({ ok: true, drawn: true, html: null });
    });
  }, 20_000);

  test("is not sent when a component needs a browser, on either side of the wire, or the app draws nothing", async () => {
    await withStaticAppWorker(async (draw) => {
      expect(await draw("showCanvas")).toEqual({ ok: true, drawn: true, html: null });
      expect(await draw("showChart")).toEqual({ ok: true, drawn: true, html: null });
      expect(await draw("showBlank")).toEqual({ ok: true, drawn: true, html: null });
    });
  }, 20_000);

  test("drops every handler, embedded document and script link the app wrote, and keeps its text", async () => {
    await withStaticAppWorker(async (draw) => {
      const { html } = await draw("showActive");
      expect(html).toContain("active text");
      expect(html).toContain('title="kept title"');
      expect(html).toContain("entity link");
      expect(html).toContain("svg link");
      expect(html).toContain('<a href="/kept">plain link</a>');
      expect(html).toContain('<iframe title="frame">');
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/srcdoc|<object|<embed|http-equiv|javascript|&#x6A;ava|&Tab;|&colon;/i);
      expect(html).toContain("tab link");
      expect(html).toContain("smil link");
      expect(html).toContain('<animate attributeName="fill" values="red"/>');
      expect(html).not.toMatch(/<set|animateMotion|attributeName="HREF"/);
    });
  }, 20_000);

  test("keeps a relative link whose query holds an ampersand, and a mailto link", async () => {
    await withStaticAppWorker(async (draw) => {
      const { html } = await draw("showRelative");
      expect(html).toContain('<a href="R&amp;D/page.html">rd</a>');
      expect(html).toContain('<a href="/list?a=1&amp;b=2">list</a>');
      expect(html).toContain('<a href="?q=a:b&amp;c">query</a>');
      expect(html).toContain('<a href="mailto:team@example.com">mail</a>');
    });
  }, 20_000);

  test("is not sent when a formula carries a handler or a link, and is sent when it carries neither", async () => {
    await withStaticAppWorker(async (draw, { warnings }) => {
      expect(await draw("showMath")).toEqual({ ok: true, drawn: true, html: null });
      expect(await draw("showOpenMath")).toEqual({ ok: true, drawn: true, html: null });
      expect(warnings.filter((warning) => warning.includes("a formula carries a handler or a link"))).toHaveLength(2);
      expect((await draw("showPlainMath")).html).toContain("<p>plain math</p>");
    });
  }, 20_000);

  test("stops the worker's draw at its deadline, aborting a component that never ends", async () => {
    await withStaticAppWorker(async (draw, { logs }) => {
      for (const name of ["showHung", "showUnsettled"]) {
        const startedAt = Date.now();
        await expect(draw(name, signedIn, 300)).rejects.toMatchObject({ code: "rscWorkerFailed" });
        expect(Date.now() - startedAt).toBeLessThan(3_000);
      }
      for (let tries = 0; tries < 50 && !logs.some((log) => log.includes("at /slow drew no HTML")); tries++)
        await Bun.sleep(50);
      expect(logs.some((log) => log.includes("at /slow drew no HTML: its render ended in error"))).toBe(true);
      expect((await draw("showBoard")).html).toContain("<h1>Board</h1>");
    });
  }, 20_000);

  test("answers at its deadline while the worker is too busy to read its own", async () => {
    await withStaticAppWorker(async (draw) => {
      const startedAt = Date.now();
      await expect(draw("showBusy", signedIn, 300)).rejects.toMatchObject({ code: "rscWorkerFailed" });
      expect(Date.now() - startedAt).toBeLessThan(1_500);
      expect((await draw("showBoard")).html).toContain("<h1>Board</h1>");
    });
  }, 20_000);

  test("is not sent with a Suspense fallback when a boundary does not resolve in time", async () => {
    await withStaticAppWorker(async (draw, { warnings }) => {
      expect(await draw("showNeverReady", signedIn, 1_000)).toEqual({ ok: true, drawn: true, html: null });
      expect(warnings).toEqual([
        'static app "showNeverReady" sent no HTML: its render failed: The operation was aborted.',
      ]);
    });
  }, 20_000);

  test("is not sent when a component throws on either side of the wire, or the document passes its size cap", async () => {
    await withStaticAppWorker(async (draw, { warnings }) => {
      expect(await draw("showServerThrows")).toEqual({ ok: true, drawn: false, html: null });
      expect(await draw("showClientThrows")).toEqual({ ok: true, drawn: true, html: null });
      expect(await draw("showHuge")).toEqual({ ok: true, drawn: true, html: null });
      expect(warnings.at(-1)).toBe(
        `static app "showHuge" sent no HTML: its HTML passed ${SsrStaticApp.maxBytes} bytes`,
      );
    });
  }, 20_000);

  test("starts no guard or load for a draw whose deadline had already passed when the worker took it", async () => {
    await withStaticAppWorker(async (draw) => {
      await expect(draw("showBusy", signedIn, 0)).rejects.toMatchObject({ code: "rscWorkerFailed" });
      const startedAt = Date.now();
      expect((await draw("showBoard")).html).toContain("<h1>Board</h1>");
      expect(Date.now() - startedAt).toBeLessThan(1_500);
    });
  }, 20_000);
});

describe("a static app's HTML step", () => {
  test("is skipped, leaving the HTML out, when the draw used up the deadline", async () => {
    const warnings: string[] = [];
    const run = {
      ok: true as const,
      url: "http://127.0.0.1/en/board",
      records: [],
      route: { params: {}, searchParams: {} },
    };
    const realNow = Date.now;
    const context = {
      logger: { warn: (message: string) => void warnings.push(message) },
      artifact: { i18n: { defaultLocale: "en" } },
      ensureRoute: async () => ({ clientManifest: {}, ssrManifest }),
      stylesheetHref: () => null,
    } as unknown as WebRouteContext;
    const rsc = {
      listPagePrompts: async () => [{ kind: "app", name: "showBoard", pattern: "/:lang/board", static: true }],
      drawPagePrompt: async () => {
        Date.now = () => realNow() + SsrStaticApp.deadlineMs + 1;
        return { run, drawn: { flight: new Uint8Array(), needsBrowser: false } };
      },
    } as unknown as RscWorker;
    const html = spyOn(SsrStaticApp.prototype, "render");
    try {
      const rendered = await new WebStaticApp(context, () => rsc).render({
        name: "showBoard",
        arguments: {},
        headers: [],
        origin: "https://board.example.com",
      });
      expect(rendered).toEqual({ run, html: null });
      expect(html).not.toHaveBeenCalled();
      expect(warnings).toEqual(['static app "showBoard" sent no HTML: its draw used up the deadline']);
    } finally {
      Date.now = realNow;
      html.mockRestore();
    }
  });
});
