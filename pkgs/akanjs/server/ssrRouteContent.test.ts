import { describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { Logger } from "akanjs/common";
import { RscWorker } from "./rscWorkerHost";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import type { SsrLateControl } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

interface Rendered {
  html: string;
  status: number;
  controlAtShell: SsrLateControl | null;
}

const readsWindowId = "routecontent/readsWindow";
const readsWindowModule = path.join(import.meta.dir, "ssrRouteContentClient.fixture.tsx");

const withRouteContentWorker = async (run: (render: (route: string) => Promise<Rendered>) => Promise<void>) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "routecontent",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "ssrRouteContent.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: { [readsWindowId]: { id: readsWindowId, chunks: [], name: "ReadsWindow" } },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(async (route) => {
      const request = new Request(`http://localhost/en/${route}`);
      const result = await rsc.renderWithMeta(request);
      if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
      const stream = await new SsrFromRscRenderer().render({
        request,
        rscStream: result.stream,
        ssrManifest: {
          moduleLoading: null,
          moduleMap: {
            [readsWindowId]: {
              ReadsWindow: {
                id: readsWindowModule,
                chunks: [readsWindowModule, readsWindowModule],
                name: "ReadsWindow",
              },
            },
          },
        },
        lateControl: result.lateControl,
      });
      //? What the host reads to pick the status, the moment the shell is ready.
      const controlAtShell = await Promise.race([result.lateControl, Promise.resolve(null)]);
      const status = controlAtShell?.type === "not-found" ? 404 : (result.status ?? 200);
      return { html: await new Response(stream).text(), status, controlAtShell };
    });
  } finally {
    rsc.kill();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withLoggedErrors = async (run: () => Promise<void>) => {
  const logged = spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  try {
    await run();
  } finally {
    logged.mockRestore();
  }
};

describe("SSR of a route with no .loading()", () => {
  test("writes the page in place in the shell, a large one included, with nothing left for a reveal script", async () => {
    await withRouteContentWorker(async (render) => {
      const quick = await render("quick");
      expect(quick.html).toContain('<main>root:<!--$--><p id="quick">quick content</p><!--/$--></main>');
      expect(quick.html).not.toContain('<div hidden id="S:');
      expect(quick.html).not.toContain("$RC(");

      const large = await render("large");
      expect(large.html).toContain('<main>root:<!--$--><article id="large">');
      expect(large.html).not.toContain('<div hidden id="S:');
    });
  }, 20_000);

  test("holds the response for a not-found or redirect the page raises after I/O, so it is a real status", async () => {
    await withRouteContentWorker(async (render) => {
      expect((await render("gone")).controlAtShell).toEqual({ type: "not-found" });
      expect((await render("moved")).controlAtShell).toMatchObject({ type: "redirect", location: "/en/quick" });
    });
  }, 20_000);

  test("fails the document on an error the page throws after I/O, rather than ship one the browser breaks on", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        await expect(render("broken")).rejects.toThrow("page broke");
      });
    });
  }, 20_000);

  test("answers an error the page throws after I/O with its layout's .error() view and a 500", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const failed = await render("failing/inner");
        expect(failed.status).toBe(500);
        expect(failed.html).toContain("<section>failing:");
        expect(failed.html).toContain('<p id="failing-error">failing error <!-- -->AKAN_RENDER_ERROR</p>');
      });
    });
  }, 20_000);

  test("client-renders only the level whose client component fails on the server, in a 200 document", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const page = await render("clientonly");
        expect(page.status).toBe(200);
        expect(page.controlAtShell).toBeNull();
        expect(page.html).toContain("<main>root:<!--$!-->");
        expect(page.html).not.toContain("<b>");
        expect(page.html).not.toContain('<div hidden id="S:');
      });
    });
  }, 20_000);
});

describe("SSR of a route with a .loading()", () => {
  test("streams the level's fallback first and reveals its content later, as before", async () => {
    await withRouteContentWorker(async (render) => {
      const { html } = await render("loading");
      const fallbackAt = html.indexOf("<i>page loading</i>");
      expect(fallbackAt).toBeGreaterThan(-1);
      expect(html.indexOf('<div hidden id="S:')).toBeGreaterThan(fallbackAt);
      expect(html).toContain("loaded content");
    });
  }, 20_000);

  test("keeps the layouts above that level in the shell and the levels below it inside its boundary", async () => {
    await withRouteContentWorker(async (render) => {
      const { html } = await render("section/inner");
      expect(html).toContain(
        '<main>root:<!--$?--><template id="B:0"></template><i>section loading</i><!--/$--></main>',
      );
      //? Each level below keeps its own boundary, revealed inside the still-hidden one, so only `B:0` changes the page.
      const reveals = html.match(/\$RC\("B:\d+"/g) ?? [];
      expect(reveals.filter((reveal) => reveal === '$RC("B:0"')).toHaveLength(1);
      expect(reveals.at(-1)).toBe('$RC("B:0"');
      expect(html.indexOf("<p>inner content</p>")).toBeGreaterThan(-1);
      expect(html.indexOf("<p>inner content</p>")).toBeLessThan(html.lastIndexOf('$RC("B:0"'));
    });
  }, 20_000);
});
