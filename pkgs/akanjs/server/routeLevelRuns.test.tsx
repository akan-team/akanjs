import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RouteRender } from "akanjs/client";
import { requestStorage } from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { AkanNotFoundError, AkanRedirectError } from "../client/router";
import { RouteElementComposer } from "./routeElementComposer";
import { RscRenderLevels } from "./rscRenderLevels";

const createDeferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ticks = async () => {
  for (let turn = 0; turn < 5; turn++) await sleep(0);
};

interface Level {
  render: RouteRender;
  started: () => boolean;
  calls: () => number;
  props: () => { params?: unknown; searchParams?: unknown; children?: unknown } | null;
}

const level = (
  name: string,
  body: (call: number) => Promise<void> = async () => undefined,
  { isAsync = true }: { isAsync?: boolean } = {},
): Level => {
  let calls = 0;
  let props: { params?: unknown; searchParams?: unknown; children?: unknown } | null = null;
  const render = (async (received: { children?: ReactNode; params?: unknown; searchParams?: unknown }) => {
    calls += 1;
    props = received;
    await body(calls);
    return (
      <section>
        {name}:{received.children}
      </section>
    );
  }) as RouteRender["render"];
  return { render: { render, isAsync }, started: () => calls > 0, calls: () => calls, props: () => props };
};

const params = { lang: "en" };
const searchParams = { q: "x" };

const renderLevels = async (
  levels: Level[],
  options: { owner?: number; signal?: AbortSignal } = {},
): Promise<{ html: Promise<string>; reported: unknown[] }> => {
  const renders = levels.map((item) => item.render);
  const owner = options.owner === undefined ? undefined : renders[options.owner];
  const element = RouteElementComposer.composeRenders({
    renders,
    params,
    searchParams,
    levelBoundary: owner ? { Boundary: ({ children }) => <>{children}</>, owner } : undefined,
  });
  const reported: unknown[] = [];
  const stream = await renderToReadableStream(
    <html lang="en">
      <body>{element}</body>
    </html>,
    { signal: options.signal, onError: (error) => void reported.push(error) },
  );
  return { html: new Response(stream).text().then((text) => text.replaceAll("<!-- -->", "")), reported };
};

describe("RouteElementComposer starts the levels of a route together", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => void unhandled.push(reason);
  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
  });
  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]);
  });

  test("every level below the first starts while the first still waits, each with the same params and search", async () => {
    const gates = [createDeferred(), createDeferred(), createDeferred(), createDeferred()];
    const levels = gates.map((gate, idx) => level(`level${idx}`, () => gate.promise));
    const { html } = await renderLevels(levels);
    await ticks();

    expect(levels.map((item) => item.started())).toEqual([true, true, true, true]);
    for (const item of levels) {
      expect(item.props()?.params).toBe(params);
      expect(item.props()?.searchParams).toBe(searchParams);
    }
    for (const gate of gates.toReversed()) gate.resolve();
    const body = await html;
    for (const idx of [0, 1, 2, 3]) expect(body).toContain(`level${idx}:`);
    expect(levels.map((item) => item.calls())).toEqual([1, 1, 1, 1]);
  });

  test("the levels at and above the one rendering System.Provider still render one after another", async () => {
    const rootGate = createDeferred();
    const layoutGate = createDeferred();
    const levels = [
      level("overrides"),
      level("root", () => rootGate.promise),
      level("layout", () => layoutGate.promise),
      level("page"),
    ];
    const { html } = await renderLevels(levels, { owner: 1 });
    await ticks();
    expect(levels.map((item) => item.started())).toEqual([true, true, false, false]);

    rootGate.resolve();
    await ticks();
    expect(levels.map((item) => item.started())).toEqual([true, true, true, true]);
    layoutGate.resolve();
    expect(await html).toContain("page:");
  });

  test("a level that is no route module, such as a fallback view, starts only under the level above", async () => {
    const layoutGate = createDeferred();
    const levels = [level("layout", () => layoutGate.promise), level("view", undefined, { isAsync: false })];
    const { html } = await renderLevels(levels);
    await ticks();
    expect(levels[1]?.started()).toBe(false);
    layoutGate.resolve();
    expect(await html).toContain("view:");
  });

  for (const [outcome, thrown] of [
    ["redirects", () => new AkanRedirectError("/en/elsewhere")],
    ["answers not-found", () => new AkanNotFoundError()],
    ["throws", () => new Error("layout failed")],
  ] as const) {
    test(`a level that ${outcome} keeps the levels below off the page and leaves their failures unreported`, async () => {
      const failure = thrown();
      const levels = [
        level("layout", async () => {
          await sleep(5);
          throw failure;
        }),
        level("inner"),
        level("page", async () => {
          throw new Error("page below failed");
        }),
      ];
      const { html, reported } = await renderLevels(levels);
      const body = await html;

      expect(levels.map((item) => item.started())).toEqual([true, true, true]);
      expect(body).not.toContain("inner:");
      expect(body).not.toContain("page:");
      expect(reported).toEqual([failure]);
    });
  }

  test("a level whose early start failed renders again under the levels above, so only its own run counts", async () => {
    const layoutGate = createDeferred();
    const page = level("page", async (call) => {
      if (call === 1) throw new Error("read before the layout");
    });
    const levels = [level("layout", () => layoutGate.promise), page];
    const { html, reported } = await renderLevels(levels);
    await ticks();
    layoutGate.resolve();

    expect(await html).toContain("page:");
    expect(page.calls()).toBe(2);
    expect(reported).toEqual([]);
  });

  test("a level failing again under the levels above is reported once, as its own failure", async () => {
    const layoutGate = createDeferred();
    const failure = new Error("page failed");
    const page = level("page", async () => {
      throw failure;
    });
    const { html, reported } = await renderLevels([level("layout", () => layoutGate.promise), page]);
    await ticks();
    layoutGate.resolve();
    await html;

    expect(page.calls()).toBe(2);
    expect(reported).toEqual([failure]);
  });

  test("a start still running when its level renders is that level's run, its failure reported once", async () => {
    const pageGate = createDeferred();
    const failure = new Error("page failed late");
    const page = level("page", async () => {
      await pageGate.promise;
      throw failure;
    });
    const { html, reported } = await renderLevels([
      level("layout", async () => {
        await sleep(1);
      }),
      page,
    ]);
    await sleep(20);
    pageGate.resolve();
    await html;

    expect(page.calls()).toBe(1);
    expect(reported).toEqual([failure]);
  });

  test("an aborted render leaves the levels it started counted until each settles", async () => {
    RscRenderLevels.track();
    const request = new Request("http://localhost/en/levels");
    const layoutGate = createDeferred();
    const pageGate = createDeferred();
    const controller = new AbortController();
    const levels = [level("layout", () => layoutGate.promise), level("page", () => pageGate.promise)];
    const storage = requestStorage;
    if (!storage) throw new Error("no request storage on the server");
    const { html } = await storage.run(request, () => renderLevels(levels, { signal: controller.signal }));
    html.catch(() => undefined);
    await ticks();
    expect(levels.map((item) => item.started())).toEqual([true, true]);
    controller.abort();
    await ticks();

    let settled = false;
    layoutGate.resolve();
    await ticks();
    RscRenderLevels.of(request)?.whenSettled(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    pageGate.resolve();
    await ticks();
    expect(settled).toBe(true);
  });
});
