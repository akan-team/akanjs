import { describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { Readable } from "node:stream";
import { Logger } from "akanjs/common";
import { act, Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { createFromNodeStream } from "react-server-dom-webpack/client.node";
import { RscWorker } from "./rscWorkerHost";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import type { SsrLateControl } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

interface Rendered {
  html: string;
  status: number;
  controlAtShell: SsrLateControl | null;
  cacheable: boolean;
  payload: Uint8Array;
}

const readsWindowId = "routecontent/readsWindow";
const readsWindowModule = path.join(import.meta.dir, "ssrRouteContentClient.fixture.tsx");
const streamedLabelId = "routecontent/streamedLabel";
const streamedLabelModule = path.join(import.meta.dir, "ssrStreamedReadClient.fixture.tsx");
const levelBoundaryId = "routecontent/levelBoundary";
const levelBoundaryModule = path.join(import.meta.dir, "../webkit/RouteLevelBoundary.tsx");
const routeContentSsrManifest = {
  moduleLoading: null,
  moduleMap: {
    [readsWindowId]: {
      ReadsWindow: { id: readsWindowModule, chunks: [readsWindowModule, readsWindowModule], name: "ReadsWindow" },
    },
    [streamedLabelId]: {
      StreamedLabel: {
        id: streamedLabelModule,
        chunks: [streamedLabelModule, streamedLabelModule],
        name: "StreamedLabel",
      },
    },
    [levelBoundaryId]: {
      RouteLevelBoundary: {
        id: levelBoundaryModule,
        chunks: [levelBoundaryModule, levelBoundaryModule],
        name: "RouteLevelBoundary",
      },
    },
  },
};

const withRouteContentWorker = async (
  run: (render: (route: string) => Promise<Rendered>) => Promise<void>,
  fixture = "ssrRouteContent.fixture.tsx",
  env: Record<string, string> = {},
) => {
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "routecontent",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    ...env,
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, fixture),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [readsWindowId]: { id: readsWindowId, chunks: [], name: "ReadsWindow" },
      [streamedLabelId]: { id: streamedLabelId, chunks: [], name: "StreamedLabel" },
      [levelBoundaryId]: { id: levelBoundaryId, chunks: [], name: "RouteLevelBoundary" },
    },
  } as unknown as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(async (route) => {
      const request = new Request(`http://localhost/en/${route}`);
      const result = await rsc.renderWithMeta(request);
      if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
      const [rscStream, payloadStream] = result.stream.tee();
      const payload = new Response(payloadStream).arrayBuffer();
      payload.catch(() => undefined);
      const stream = await new SsrFromRscRenderer().render({
        request,
        rscStream,
        ssrManifest: routeContentSsrManifest,
        lateControl: result.lateControl,
      });
      //? What the host reads to pick the status, the moment the shell is ready.
      const controlAtShell = await Promise.race([result.lateControl, Promise.resolve(null)]);
      const status = controlAtShell?.type === "not-found" ? 404 : (result.status ?? 200);
      const html = await new Response(stream).text();
      return {
        html,
        status,
        controlAtShell,
        cacheable: (await result.cacheState).cacheable,
        payload: new Uint8Array(await payload),
      };
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

describe("SSR of a fetch handle's field read refused before the first byte", () => {
  test("answers 200 with the page, leaving the field's Load.Stream for the browser to fill with its notice", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const page = await render("failing/streamed");
          expect(page.status).toBe(200);
          expect(page.html).toContain('<p id="beside">beside <!--$!-->');
          expect(page.html).toContain("<i>label loading</i>");
          expect(page.html).not.toContain("failing error");
        }
      });
    });
  }, 20_000);

  test("still answers a level that awaits the field with its layout's .error() view and a 500", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const failed = await render("failing/awaited");
        expect(failed.status).toBe(500);
        expect(failed.html).toContain('<p id="failing-error">failing error <!-- -->AKAN_RENDER_ERROR</p>');
      });
    });
  }, 20_000);

  test("still answers a layout's .notFound() view that awaits the field with the .error() above it", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const failed = await render("failing/lost");
        expect(failed.status).toBe(500);
        expect(failed.html).toContain('<p id="failing-error">failing error <!-- -->AKAN_RENDER_ERROR</p>');
      });
    });
  }, 20_000);

  test("keeps the render out of the RSC result cache, so the next visitor and a retry render it again", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(
        async (render) => {
          expect((await render("quick")).cacheable).toBe(true);
          for (let attempt = 0; attempt < 3; attempt++) {
            const page = await render("failing/streamed");
            expect(page.status).toBe(200);
            expect(page.cacheable).toBe(false);
          }
        },
        "ssrRouteContent.fixture.tsx",
        { AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/" },
      );
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

const headTags = (html: string) => {
  const head = html.slice(0, html.indexOf("</head>"));
  return {
    titles: [...html.matchAll(/<title[^>]*>([^<]*)<\/title>/g)].map((match) => match[1]),
    descriptions: [...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map((match) => match[1]),
    robots: [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((match) => match[1]),
    inHead: (text: string) => head.includes(text),
  };
};

describe("SSR head of a not-found or error view", () => {
  test("is the NotFound's own title and meta, once, for an unmatched path and a page's or head's router.notFound()", async () => {
    await withRouteContentWorker(async (render) => {
      for (const route of ["no/such/page", "creature/missingno", "named/missingno"]) {
        const missing = await render(route);
        expect(missing.status).toBe(404);
        expect(missing.html).toContain(`missing /en/${route}`);
        const { titles, descriptions, robots, inHead } = headTags(missing.html);
        expect({ route, titles, descriptions, robots }).toEqual({
          route,
          titles: ["Not found – Dex"],
          descriptions: ["Nothing here"],
          robots: ["noindex"],
        });
        expect(inHead("<title>Not found – Dex</title>")).toBe(true);
        expect(inHead('<link rel="manifest"')).toBe(true);
      }
    }, "ssrNotFoundHead.fixture.tsx");
  }, 20_000);

  test("keeps the layouts' head and robots directives when the NotFound writes none, and the page's head when nothing is missing", async () => {
    await withRouteContentWorker(async (render) => {
      const plain = await render("plain/anything");
      expect(plain.html).toContain('<p id="plain-missing">plain missing</p>');
      expect(headTags(plain.html)).toMatchObject({ titles: ["Dex"], robots: ["noindex, nofollow"] });

      const found = await render("creature/mew");
      expect(found.status).toBe(200);
      //? Chromium reads a manifest link only among <head>'s children.
      expect(headTags(found.html).inHead('<link rel="manifest" href="/manifest.webmanifest"/>')).toBe(true);
      expect(headTags(found.html)).toMatchObject({
        titles: ["mew – Dex"],
        descriptions: ["Every creature"],
        robots: [],
      });
    }, "ssrNotFoundHead.fixture.tsx");
  }, 20_000);

  test("is an .error() view's own title, once, for an error a page throws", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const failed = await render("failing/inner");
        expect(failed.status).toBe(500);
        expect(failed.html).toContain('<p id="broken">broken</p>');
        expect(headTags(failed.html).titles).toEqual(["Broken – Dex"]);
      }, "ssrNotFoundHead.fixture.tsx");
    });
  }, 20_000);

  test("leaves the NotFound's tags in its view below a .loading(), whose shell is out before it renders", async () => {
    await withRouteContentWorker(async (render) => {
      const late = await render("slow/missingno");
      expect(late.html).toContain("missing /en/slow/missingno");
      expect(late.html.indexOf("<title>slow – Dex</title>")).toBeLessThan(late.html.indexOf("</head>"));
      expect(headTags(late.html).titles).toContain("Not found – Dex");
    }, "ssrNotFoundHead.fixture.tsx");
  }, 20_000);
});

//? The body the browser hydrates, decoded from the page's Flight payload as the RSC client entry decodes it.
const bodyOf = async (payload: Uint8Array): Promise<ReactNode> => {
  const html = await createFromNodeStream<ReactElement<{ children: ReactNode }>>(
    Readable.from([payload]),
    routeContentSsrManifest,
  );
  const body = Children.toArray(html.props.children).find(
    (child): child is ReactElement<{ children: ReactNode }> => isValidElement(child) && child.type === "body",
  );
  return createElement(Fragment, null, body?.props.children);
};

const markupOf = async (node: ReactNode) => {
  const stream = await renderToReadableStream(node, { onError: () => undefined });
  await stream.allReady;
  return await new Response(stream).text();
};

//? A DOM only for the hydration: the worker host and the SSR renderer above read `typeof window`.
const hydrated = async (payload: Uint8Array, run: (container: HTMLElement, uncaught: unknown[]) => void) => {
  const markup = await markupOf(await bodyOf(payload));
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { hydrateRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.appendChild(container);
  const uncaught: unknown[] = [];
  const kept = ["main", "section", "#beside"].map((selector) => [selector, container.querySelector(selector)] as const);
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    const tree = await bodyOf(payload);
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onUncaughtError: (error) => void uncaught.push(error),
        onCaughtError: () => undefined,
        onRecoverableError: () => undefined,
      });
    });
    await act(async () => {});
    for (const [selector, node] of kept) expect(container.querySelector(selector)).toBe(node);
    run(container, uncaught);
  } finally {
    await act(async () => {
      root?.unmount();
    });
    await GlobalRegistrator.unregister();
  }
};

describe("A route level that fails after the first byte", () => {
  test("answers 200, then hydrates into the level's notice under the layouts above it, which keep their nodes", async () => {
    await withLoggedErrors(async () => {
      await withRouteContentWorker(async (render) => {
        const late = await render("late/broken");
        expect(late.status).toBe(200);
        expect(late.html).toContain(
          '<section>late:<!--$?--><template id="B:3"></template><!--/$--><aside id="beside">',
        );
        expect(late.html).toContain('$RX("B:3"');
        const nested = await render("failing/nested");
        expect(nested.status).toBe(200);
        expect(nested.html).toContain("<section>failing:<!--$!-->");

        await hydrated(late.payload, (container, uncaught) => {
          expect(container.querySelector('section > [role="alert"]')?.textContent).toContain("base.retry");
          expect(container.querySelector("#beside")).not.toBeNull();
          expect(uncaught).toEqual([]);
        });
        await hydrated(nested.payload, (container, uncaught) => {
          expect(container.querySelector('section > [role="alert"]')).not.toBeNull();
          expect(container.querySelector("#nested")).toBeNull();
          expect(uncaught).toEqual([]);
        });
      });
    });
  }, 20_000);
});
