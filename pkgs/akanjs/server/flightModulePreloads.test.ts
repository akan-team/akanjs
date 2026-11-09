import { describe, expect, test } from "bun:test";
import { ModulePreloadPlan } from "./artifact/modulePreloadPlan";
import { FlightModulePreloads } from "./flightModulePreloads";

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
    },
  );

  test("reads the chunks an import row names inline, after the runtime", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(
      row(
        '4:I["/_akan/client/a.js",["/_akan/client/a.js","/_akan/client/a.js","/_akan/client/chunks/s.js","/_akan/client/chunks/s.js"],"A",1]\n',
      ),
    );

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js", "/_akan/client/a.js", "/_akan/client/chunks/s.js"]);
  });

  test("leaves out a client path the build never emitted", () => {
    const preloads = new FlightModulePreloads(plan);
    preloads.observe(row('5:"/_akan/client/chunks/gone.js"\n'));
    preloads.observe(row('6:"see /_akan/client/a.js in the docs"\n'));

    expect(preloads.urls).toEqual(["/_akan/client/rsc.js"]);
  });
});
