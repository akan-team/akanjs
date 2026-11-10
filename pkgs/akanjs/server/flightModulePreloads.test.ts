import { describe, expect, test } from "bun:test";
import { ModulePreloadPlan } from "./artifact/modulePreloadPlan";
import { FlightModulePreloads } from "./flightModulePreloads";
import { sanitizeFlightForSsrStream } from "./ssrFromRscRenderer";

const row = (text: string) => new TextEncoder().encode(text);

describe("FlightModulePreloads", () => {
  const plan = new ModulePreloadPlan(
    { runtime: ["/_akan/client/rsc.js"], vendors: {}, chunkVendors: {} },
    {
      "apps/demo/ui/A.tsx#A": {
        id: "/_akan/client/a.js",
        chunks: ["/_akan/client/a.js", "/_akan/client/a.js", "/_akan/client/chunks/s.js", "/_akan/client/chunks/s.js"],
        name: "A",
      },
      "apps/demo/ui/B.tsx#B": {
        id: "/_akan/client/b.js",
        chunks: ["/_akan/client/b.js", "/_akan/client/b.js"],
        name: "B",
      },
    },
  );

  test("reads the chunks an import row names inline, after the runtime", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(
      row(
        '4:I["/_akan/client/a.js",["/_akan/client/a.js","/_akan/client/a.js","/_akan/client/chunks/s.js","/_akan/client/chunks/s.js"],"A",1]\n',
      ),
      "I",
    );

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js", "/_akan/client/a.js", "/_akan/client/chunks/s.js"]);
  });

  test("resolves the URL rows an import row names, whichever arrives first", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(row('5:"/_akan/client/a.js"\n'), "");
    preloads.observe(row('e:I["$5",["$5","$5","$1a","$1a"],"$1b",1]\n'), "I");
    preloads.observe(row('1a:"/_akan/client/chunks/s.js"\n'), "");

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js", "/_akan/client/a.js", "/_akan/client/chunks/s.js"]);
  });

  test("never preloads a client URL that only the page's own text carries", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(row('0:["$","p",null,{"title":"/_akan/client/b.js","children":"$6"}]\n'), "");
    preloads.observe(row('6:"/_akan/client/b.js"\n'), "");
    preloads.observe(row('7:"see /_akan/client/b.js"\n'), "");

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js"]);
  });

  test("leaves out a client path the build never emitted", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(row('5:"/_akan/client/chunks/gone.js"\n'), "");
    preloads.observe(row('6:I["$5",["$5","$5"],"default"]\n'), "I");

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js"]);
  });

  test("stops reading once its URLs are taken", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(row('4:I["/_akan/client/a.js",["/_akan/client/a.js","/_akan/client/a.js"],"A"]\n'), "I");
    const urls = preloads.urls;
    preloads.observe(row('8:I["/_akan/client/b.js",["/_akan/client/b.js","/_akan/client/b.js"],"B"]\n'), "I");

    expect(urls).toEqual(["/_akan/client/rsc.js", "/_akan/client/a.js"]);
    expect(preloads.urls).toEqual(urls);
  });
});

describe("FlightModulePreloads on the flight React renders", () => {
  const entry = (id: string, name: string, chunks: string[]) => ({
    id,
    chunks: chunks.flatMap((chunk) => [chunk, chunk]),
    name,
    async: true,
  });
  const clientManifest = {
    "apps/demo/ui/Card.tsx#Card": entry("/_akan/client/card-a1.js", "Card", [
      "/_akan/client/card-a1.js",
      "/_akan/client/chunks/shared.js",
    ]),
    "apps/demo/ui/Badge.tsx#Badge": entry("/_akan/client/badge-b2.js", "Badge", [
      "/_akan/client/badge-b2.js",
      "/_akan/client/chunks/shared.js",
    ]),
    "apps/demo/ui/Menu.tsx#Menu": entry("/_akan/client/menu-c3.js", "Menu", ["/_akan/client/menu-c3.js"]),
  };
  const renderFlight = (nodeEnv: string) =>
    Bun.spawn(
      [
        process.execPath,
        "--conditions",
        "react-server",
        `${import.meta.dir}/flightModulePreloads.fixture.tsx`,
        JSON.stringify(clientManifest),
      ],
      { env: { ...process.env, NODE_ENV: nodeEnv }, stdio: ["ignore", "pipe", "inherit"] },
    ).stdout;

  test("preloads each rendered client reference's chunks once, and not a client URL the page's text carries", async () => {
    for (const nodeEnv of ["production", "development"]) {
      const preloads = new FlightModulePreloads(
        new ModulePreloadPlan({ runtime: ["/_akan/client/rsc.js"], vendors: {}, chunkVendors: {} }, clientManifest),
      );
      const flight = sanitizeFlightForSsrStream(renderFlight(nodeEnv), (row, tag) => preloads.observe(row, tag));
      await new Response(flight).arrayBuffer();

      expect({ nodeEnv, urls: preloads.urls }).toEqual({
        nodeEnv,
        urls: [
          "/_akan/client/rsc.js",
          "/_akan/client/card-a1.js",
          "/_akan/client/chunks/shared.js",
          "/_akan/client/badge-b2.js",
        ],
      });
    }
  }, 20_000);
});
