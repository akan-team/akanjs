import { describe, expect, test } from "bun:test";
import { SsrDevShim } from "./ssrDevShim";

interface FakeScript {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface FakeRegistry {
  modules: Map<string, unknown>;
  inspect: () => { generation: number; target: number; started: boolean; failed: boolean };
  hot: (message: unknown) => void;
  provide: (id: string, namespace: unknown) => void;
  has: (id: string) => boolean;
  require: (id: string) => unknown;
  whenDefined: (id: string) => Promise<void>;
}

const createPage = () => {
  const scripts: FakeScript[] = [];
  const baseLoads: string[] = [];
  const baseRequire = Object.assign((id: string) => `base:${id}`, { u: (chunkId: string) => chunkId });
  const self: Record<string, unknown> = {
    __webpack_chunk_load__: async (id: string) => {
      baseLoads.push(id);
    },
    __webpack_require__: baseRequire,
  };
  const document = {
    createElement: () => ({ src: "", async: true, onload: null, onerror: null }) as FakeScript,
    head: {
      appendChild: (script: FakeScript) => {
        scripts.push(script);
      },
    },
  };
  const install = (script: string) => new Function("self", "document", "fetch", script)(self, document, fetch);
  //? The runtime script defines the registry when it runs; later scripts only register into it.
  const load = (index: number) => {
    const script = scripts[index];
    if (!script) throw new Error(`no script ${index} was appended`);
    if (index === 0) {
      const modules = new Map<string, unknown>();
      const waiters = new Map<string, () => void>();
      const registry: FakeRegistry = {
        modules,
        inspect: () => ({ generation: 7, target: 7, started: true, failed: false }),
        hot: () => undefined,
        provide: (id, namespace) => modules.set(id, namespace),
        has: (id) => modules.has(id),
        require: (id) => modules.get(id),
        whenDefined: (id) => new Promise((resolve) => waiters.set(id, resolve)),
      };
      self.__akan = registry;
      self.__define = (id: string, exports: unknown) => {
        modules.set(id, exports);
        waiters.get(id)?.();
      };
    }
    script.onload?.();
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { self, scripts, baseLoads, baseRequire, install, load, settle };
};

const manifest = { version: 1 as const, generation: 7, vendorFile: "vendor-abc.js", entries: {}, epoch: 42 };

describe("SsrDevShim", () => {
  test("the registry chunk boots runtime, vendor file and app.js in order; other chunks keep the base loader", async () => {
    const page = createPage();
    page.install(SsrDevShim.script(manifest, []));
    const chunkLoad = page.self.__webpack_chunk_load__ as (id: string) => Promise<void>;
    await chunkLoad("/_akan/client/runtime-chunk.js");
    expect(page.baseLoads).toEqual(["/_akan/client/runtime-chunk.js"]);
    let booted = false;
    const boot = chunkLoad("ssr-dev").then(() => {
      booted = true;
    });
    expect(chunkLoad("ssr-dev")).toBe(chunkLoad("ssr-dev"));
    expect(page.scripts.map((script) => script.src)).toEqual([SsrDevShim.runtimeUrl]);
    page.load(0);
    await page.settle();
    expect(page.scripts.map((script) => script.src)).toEqual([SsrDevShim.runtimeUrl, "/_akan/ssr-dev/vendor-abc.js"]);
    page.load(1);
    await page.settle();
    expect(page.scripts.at(-1)?.src).toBe("/_akan/ssr-dev/app.js?g=7");
    expect(page.scripts.every((script) => script.async === false)).toBe(true);
    expect(booted).toBe(false);
    page.load(2);
    await boot;
    expect(booted).toBe(true);
    expect(page.self.__AKAN_SSR_EPOCH__).toBe(42);
  });

  test("a registry id reads the module's exports now, or waits for the patch that brings it", async () => {
    const page = createPage();
    page.install(SsrDevShim.script(manifest, []));
    const require = page.self.__webpack_require__ as ((id: string) => unknown) & { u: unknown };
    expect(require.u).toBe(page.baseRequire.u);
    expect(require("/_akan/client/outlet.js")).toBe("base:/_akan/client/outlet.js");
    void (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    const define = page.self.__define as (id: string, exports: unknown) => void;
    define("apps/app/ui/Card.tsx", { Card: "card" });
    expect(require("ssr-dev:apps/app/ui/Card.tsx")).toEqual({ Card: "card" });
    const pending = require("ssr-dev:apps/app/ui/New.tsx") as Promise<unknown>;
    expect(typeof pending.then).toBe("function");
    define("apps/app/ui/New.tsx", { New: "new" });
    expect(await pending).toEqual({ New: "new" });
  });

  test("a tab whose app.js is behind the generation hello named reloads once it has started", async () => {
    const page = createPage();
    let reloads = 0;
    page.self.location = { reload: () => (reloads += 1) };
    page.self.__AKAN_SSR_HELLO_GENERATION__ = 9;
    new Function("self", "document", "fetch", "location", SsrDevShim.script(manifest, []))(
      page.self,
      {
        createElement: () => ({ src: "", async: true, onload: null, onerror: null }),
        head: { appendChild: (s: FakeScript) => page.scripts.push(s) },
      },
      fetch,
      page.self.location,
    );
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    await page.settle();
    page.load(1);
    await page.settle();
    page.load(2);
    await boot;
    expect(reloads).toBe(1);
  });

  test("updates that arrived before the runtime loaded are handed to it", async () => {
    const page = createPage();
    const early = [{ generation: 8, url: "/_akan/ssr-dev/patch-8.js" }];
    page.self.__AKAN_SSR_EARLY_UPDATES__ = early;
    page.install(SsrDevShim.script(manifest, []));
    void (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    const received: unknown[] = [];
    page.load(0);
    (page.self.__akan as FakeRegistry).hot = (message) => received.push(message);
    expect(received).toEqual([]);
    await page.settle();
    expect(received).toEqual(early);
    expect(page.self.__AKAN_SSR_EARLY_UPDATES__).toBeNull();
  });
});
