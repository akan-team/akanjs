import "../test/registerDom";
import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act, use } from "react";
import { ModulePreloadPlan } from "./artifact/modulePreloadPlan";
import { FlightModulePreloads } from "./flightModulePreloads";
import { sanitizeFlightForSsrStream } from "./ssrFromRscRenderer";

const origin = "http://localhost";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const refChunk = (model: string) => `/_akan/client/${model}-ref.js`;
const pages = {
  first: ["widget", "sprocket", "gadget"],
  next: ["bracket", "flange", "gasket"],
  bare: ["rivet", "washer", "spacer"],
} as const;

const entry = (id: string, name: string) => ({ id, chunks: [id, id], name, async: true });
const clientManifest = {
  "apps/demo/ui/View.tsx#View": entry("/_akan/client/view-a1.js", "View"),
  "apps/demo/ui/Units.tsx#Units": entry("/_akan/client/units-a1.js", "Units"),
  "apps/demo/ui/New.tsx#New": entry("/_akan/client/new-a1.js", "New"),
  ...Object.fromEntries(
    Object.values(pages)
      .flat()
      .map((model) => [`apps/demo/lib/__client/${model}.ref.ts#reference`, entry(refChunk(model), "reference")]),
  ),
};

//? The server half is the real one: a `FetchClient` whose handoffs React's flight server writes, in its own process.
const flightOf = (models: readonly string[], references: "refs" | "bare") =>
  Bun.spawn(
    [
      process.execPath,
      "--conditions",
      "react-server",
      `${import.meta.dir}/rscClientModelRuntime.fixture.tsx`,
      JSON.stringify(clientManifest),
      models.join(","),
      references,
    ],
    { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "inherit"] },
  ).stdout;

interface Handoff {
  refName: string;
  _runtime?: unknown;
}
interface Rendered {
  component: string;
  model: string;
  runtimeLoaded: boolean;
  carried: unknown;
}
const events: string[] = [];
const evaluated = new Set<string>();
const rendered: Rendered[] = [];
const note = (component: string, { refName, _runtime }: Handoff) => {
  if (!rendered.some((each) => each.model === refName)) events.push(`rendered ${refName}`);
  rendered.push({ component, model: refName, runtimeLoaded: evaluated.has(refChunk(refName)), carried: _runtime });
  return <p>{`${component} ${refName}`}</p>;
};
const modules = new Map<string, Record<string, unknown>>([
  ["/_akan/client/view-a1.js", { View: ({ view }: { view: Handoff }) => note("View", view) }],
  ["/_akan/client/units-a1.js", { Units: ({ init }: { init: Promise<Handoff> }) => note("Units", use(init)) }],
  ["/_akan/client/new-a1.js", { New: ({ slice }: { slice: Handoff }) => note("New", slice) }],
  ...Object.values(pages)
    .flat()
    .map((model): [string, Record<string, unknown>] => [refChunk(model), { reference: model }]),
]);
const served = new Map<string, () => ReadableStream<Uint8Array>>();
let firstFlight = "";

const settled = async (model: string) => {
  for (let waited = 0; waited < 15_000 && !rendered.some((each) => each.model === model); waited += 25)
    await act(async () => {
      await sleep(25);
    });
};
const renderedOf = (models: readonly string[]) => {
  const last = (model: string) => rendered.findLast((each) => each.model === model);
  return models.map((model) => last(model));
};
const orderOf = (model: string) =>
  [
    `requested ${refChunk(model)}`,
    `loaded ${refChunk(model)}`,
    `evaluated ${refChunk(model)}`,
    `rendered ${model}`,
  ].map((event) => events.indexOf(event));

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_BUNDLE_COMMAND = "build";
  spyOn(console, "error").mockImplementation(() => undefined);
  spyOn(console, "warn").mockImplementation(() => undefined);
  firstFlight = await new Response(flightOf(pages.first, "refs")).text();
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/first`);
  Object.assign(globalThis, {
    TransformStream,
    PerformanceObserver: class {
      observe() {}
      takeRecords() {
        return [];
      }
    },
    __webpack_require__: Object.assign(
      (id: string) => {
        if (!evaluated.has(id)) events.push(`evaluated ${id}`);
        evaluated.add(id);
        return modules.get(id) ?? {};
      },
      { u: () => "" },
    ),
    __webpack_get_script_filename__: (chunkId: string) => chunkId,
    __webpack_chunk_load__: async (chunkId: string) => {
      events.push(`requested ${chunkId}`);
      await sleep(40);
      events.push(`loaded ${chunkId}`);
    },
    __RSC_CHUNKS__: [[1, firstFlight]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200 });
      const { pathname } = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      return new Response(served.get(pathname)?.() ?? null, { headers: { "Content-Type": "text/x-component" } });
    },
  });
  document.documentElement.setAttribute("lang", "en");
  document.documentElement.innerHTML =
    "<head></head><body><main><p>View widget</p><p>Units sprocket</p><!--$--><p>New gadget</p><!--/$--></main></body>";
  await act(async () => {
    await import("./rscClient");
  });
}, 30_000);

describe("a model a server component hands to a client component", () => {
  test("has its reference's chunk named in the flight, for the document to preload", async () => {
    const preloads = new FlightModulePreloads(
      new ModulePreloadPlan({ runtime: ["/_akan/client/rsc.js"], vendors: {}, chunkVendors: {} }, clientManifest),
    );
    const flight = sanitizeFlightForSsrStream(new Blob([firstFlight]).stream(), (row, tag) =>
      preloads.observe(row, tag),
    );
    await new Response(flight).arrayBuffer();

    expect(preloads.urls).toEqual(expect.arrayContaining(pages.first.map(refChunk)));
  });

  test("is loaded before that component renders on the first page: handed directly, in a promise, after the shell", async () => {
    await settled("gadget");

    expect(renderedOf(pages.first)).toEqual([
      { component: "View", model: "widget", runtimeLoaded: true, carried: "widget" },
      { component: "Units", model: "sprocket", runtimeLoaded: true, carried: "sprocket" },
      { component: "New", model: "gadget", runtimeLoaded: true, carried: "gadget" },
    ]);
    expect(rendered.filter(({ runtimeLoaded }) => !runtimeLoaded)).toEqual([]);
    for (const model of pages.first) expect(orderOf(model)).toEqual([...orderOf(model)].sort((a, b) => a - b));
    for (const model of pages.first) expect(orderOf(model)).not.toContain(-1);
  }, 30_000);

  test("is loaded before that component renders after a client navigation, the streamed part included", async () => {
    served.set("/next", () => flightOf(pages.next, "refs"));
    expect(events.filter((event) => pages.next.some((model) => event.includes(model)))).toEqual([]);

    await act(async () => {
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/next");
    });
    await settled("gasket");

    expect(renderedOf(pages.next)).toEqual([
      { component: "View", model: "bracket", runtimeLoaded: true, carried: "bracket" },
      { component: "Units", model: "flange", runtimeLoaded: true, carried: "flange" },
      { component: "New", model: "gasket", runtimeLoaded: true, carried: "gasket" },
    ]);
    expect(rendered.filter(({ runtimeLoaded }) => !runtimeLoaded)).toEqual([]);
    for (const model of pages.next) expect(orderOf(model)).toEqual([...orderOf(model)].sort((a, b) => a - b));
    for (const model of pages.next) expect(orderOf(model)).not.toContain(-1);
  }, 30_000);

  test("renders as before when the server registered no reference, asking for no chunk", async () => {
    served.set("/bare", () => flightOf(pages.bare, "bare"));

    await act(async () => {
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/bare");
    });
    await settled("spacer");

    expect(renderedOf(pages.bare)).toEqual([
      { component: "View", model: "rivet", runtimeLoaded: false, carried: undefined },
      { component: "Units", model: "washer", runtimeLoaded: false, carried: undefined },
      { component: "New", model: "spacer", runtimeLoaded: false, carried: undefined },
    ]);
    expect(events.filter((event) => pages.bare.some((model) => event.includes(`${model}-ref`)))).toEqual([]);
  }, 30_000);
});
