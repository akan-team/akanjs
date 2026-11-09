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
