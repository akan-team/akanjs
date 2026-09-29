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
  inspect: () => {
    generation: number;
    target: number;
    started: boolean;
    failed: boolean;
    vendorFile?: string;
    epoch?: number;
  };
  hot: (message: unknown) => void;
  catchUp: (generation: number, prefix: string) => void;
  caughtUp: [number, string][];
  provide: (id: string, namespace: unknown) => void;
  has: (id: string) => boolean;
  require: (id: string) => unknown;
  whenDefined: (id: string) => Promise<void>;
}

const createPage = (pageFetch: typeof fetch = fetch) => {
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
  const install = (script: string) => new Function("self", "document", "fetch", script)(self, document, pageFetch);
  //? The runtime script defines the registry when it runs; later scripts only register into it.
  const load = (index: number) => {
    const script = scripts[index];
    if (!script) throw new Error(`no script ${index} was appended`);
    if (script.src === SsrDevShim.runtimeUrl) {
      const modules = new Map<string, unknown>();
      const waiters = new Map<string, () => void>();
      const caughtUp: [number, string][] = [];
      const registry: FakeRegistry = {
        modules,
        inspect: () => ({ generation: 7, target: 7, started: true, failed: false }),
        hot: () => undefined,
        catchUp: (generation, prefix) => caughtUp.push([generation, prefix]),
        caughtUp,
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
    //? What an RSC refresh waits on: the updates that came before the start replay only once it boots.
    expect(page.self.__AKAN_SSR_BOOT__).toBe(chunkLoad("ssr-dev"));
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

  test("a tab whose app.js is behind the generation hello named catches up once it has started", async () => {
    const page = createPage();
    page.self.__AKAN_SSR_HELLO_GENERATION__ = 9;
    page.install(SsrDevShim.script(manifest, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    await page.settle();
    page.load(1);
    await page.settle();
    page.load(2);
    await boot;
    expect((page.self.__akan as FakeRegistry).caughtUp).toEqual([[9, "/_akan/ssr-dev/"]]);
  });

  test("a page rendered before any registry existed keeps asking for one, and boots from it once it does", async () => {
    let asked = 0;
    const booted = { generation: 3, vendorFile: "vendor-new.js", epoch: 99 };
    const page = createPage((async () => {
      asked += 1;
      return asked < 3 ? new Response("Service Unavailable", { status: 503 }) : Response.json(booted);
    }) as unknown as typeof fetch);
    page.install(SsrDevShim.script(null, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    while (page.scripts.length < 2) await page.settle();
    expect(asked).toBe(3);
    expect(page.scripts[1]?.src).toBe("/_akan/ssr-dev/vendor-new.js");
    page.load(1);
    while (page.scripts.length < 3) await page.settle();
    expect(page.scripts[2]?.src).toBe("/_akan/ssr-dev/app.js?g=3");
    page.load(2);
    await boot;
    expect(page.self.__AKAN_SSR_EPOCH__).toBe(99);
  });

  test("a vendor file a whole build pruned is asked for again, and a boot that keeps failing is marked", async () => {
    const next = { generation: 8, vendorFile: "vendor-next.js", epoch: 43 };
    const page = createPage((async () => Response.json(next)) as unknown as typeof fetch);
    page.install(SsrDevShim.script(manifest, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    const fail = async (index: number) => {
      while (page.scripts.length <= index) await page.settle();
      page.scripts[index]?.onerror?.();
    };
    await fail(1);
    while (page.scripts.length < 3) await Bun.sleep(50);
    expect(page.scripts[2]?.src).toBe("/_akan/ssr-dev/vendor-next.js");
    await fail(2);
    await fail(3);
    await fail(4);
    expect(
      await boot.then(
        () => "booted",
        () => "failed",
      ),
    ).toBe("failed");
    expect(page.self.__AKAN_SSR_BOOT_FAILED__).toEqual({ generation: 8, epoch: 43 });
  }, 10_000);

  test("an app.js that failed to start beside the vendor file of the build before reloads onto the current pair", async () => {
    const current = { generation: 8, vendorFile: "vendor-next.js", epoch: 42 };
    const page = createPage((async () => Response.json(current)) as unknown as typeof fetch);
    let reloads = 0;
    page.self.location = { reload: () => (reloads += 1) };
    page.self.__AKAN_SSR_HELLO_GENERATION__ = 9;
    page.install(SsrDevShim.script(manifest, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    const registry = page.self.__akan as FakeRegistry;
    registry.inspect = () => ({
      generation: 8,
      target: 8,
      started: true,
      failed: true,
      vendorFile: "vendor-next.js",
      epoch: 42,
    });
    await page.settle();
    page.load(1);
    await page.settle();
    page.load(2);
    for (let tick = 0; tick < 50 && reloads === 0; tick++) await page.settle();
    expect(reloads).toBe(1);
    expect(registry.caughtUp).toEqual([]);
    //? Left pending: RSDW must not require from the registry that failed while the page goes down.
    expect(await Promise.race([boot.then(() => "settled"), page.settle().then(() => "pending")])).toBe("pending");

    const sameVendor = createPage((async () => Response.json(current)) as unknown as typeof fetch);
    sameVendor.self.location = { reload: () => (reloads += 1) };
    sameVendor.install(SsrDevShim.script(manifest, []));
    const bootSame = (sameVendor.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    sameVendor.load(0);
    (sameVendor.self.__akan as FakeRegistry).inspect = () => ({
      generation: 7,
      target: 7,
      started: true,
      failed: true,
      vendorFile: "vendor-abc.js",
      epoch: 42,
    });
    await sameVendor.settle();
    sameVendor.load(1);
    await sameVendor.settle();
    sameVendor.load(2);
    await bootSame;
    expect(reloads).toBe(1);
  });

  test("an app.js that started beside the vendor file of the build before takes the newer one before it catches up", async () => {
    for (const vendorLoads of [true, false]) {
      const current = { generation: 8, vendorFile: "vendor-next.js", epoch: 42 };
      const page = createPage((async () => Response.json(current)) as unknown as typeof fetch);
      let reloads = 0;
      page.self.location = { reload: () => (reloads += 1) };
      page.self.__AKAN_SSR_HELLO_GENERATION__ = 9;
      page.install(SsrDevShim.script(manifest, []));
      void (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
      page.load(0);
      const registry = page.self.__akan as FakeRegistry;
      registry.inspect = () => ({
        generation: 8,
        target: 8,
        started: true,
        failed: false,
        vendorFile: "vendor-next.js",
        epoch: 42,
      });
      await page.settle();
      page.load(1);
      await page.settle();
      page.load(2);
      await page.settle();
      expect(page.scripts.map((script) => script.src)).toContain("/_akan/ssr-dev/vendor-next.js");
      const newer = page.scripts.findIndex((script) => script.src === "/_akan/ssr-dev/vendor-next.js");
      if (vendorLoads) page.load(newer);
      else page.scripts[newer]?.onerror?.();
      for (let tick = 0; tick < 50 && reloads === 0 && registry.caughtUp.length === 0; tick++) await page.settle();
      expect(registry.caughtUp).toEqual(vendorLoads ? [[9, "/_akan/ssr-dev/"]] : []);
      expect(reloads).toBe(vendorLoads ? 0 : 1);
    }
  });

  test("a vendor file the manifest does not name yet waits rather than reloading every new document", async () => {
    const behind = { generation: 7, vendorFile: "vendor-abc.js", epoch: 42 };
    let asked = 0;
    const page = createPage((async () => {
      asked += 1;
      return Response.json(behind);
    }) as unknown as typeof fetch);
    let reloads = 0;
    page.self.location = { reload: () => (reloads += 1) };
    page.install(SsrDevShim.script(manifest, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.load(0);
    (page.self.__akan as FakeRegistry).inspect = () => ({
      generation: 8,
      target: 8,
      started: true,
      failed: true,
      vendorFile: "vendor-next.js",
      epoch: 43,
    });
    await page.settle();
    page.load(1);
    await page.settle();
    page.load(2);
    await boot;
    expect(reloads).toBe(0);
    expect(asked).toBe(5);
  }, 10_000);

  test("a runtime that failed to load while the backend restarted is loaded again once the registry answers", async () => {
    let asked = 0;
    const page = createPage((async () => {
      asked += 1;
      return Response.json(manifest);
    }) as unknown as typeof fetch);
    page.install(SsrDevShim.script(manifest, []));
    const boot = (page.self.__webpack_chunk_load__ as (id: string) => Promise<void>)("ssr-dev");
    page.scripts[0]?.onerror?.();
    while (page.scripts.length < 2) await Bun.sleep(20);
    expect(asked).toBe(1);
    expect(page.scripts[1]?.src).toBe(SsrDevShim.runtimeUrl);
    page.load(1);
    while (page.scripts.length < 3) await page.settle();
    page.load(2);
    while (page.scripts.length < 4) await page.settle();
    page.load(3);
    await boot;
    expect(page.self.__AKAN_SSR_BOOT_FAILED__).toBeUndefined();
  }, 10_000);

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
