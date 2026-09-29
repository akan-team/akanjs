import { describe, expect, test } from "bun:test";
import { CSR_DEV_KEPT_PATCHES } from "./csrDevManifest";
import {
  CSR_DEV_RUNTIME_SCRIPT,
  type CsrDevRuntimeApi,
  type CsrDevRuntimeHost,
  type CsrModuleFactory,
  installCsrDevRuntime,
} from "./csrDevRuntime";

interface FakeScript {
  src: string;
  dataset: Record<string, string | undefined>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
}

const REFRESH_ID = "node_modules/react-refresh/runtime.js";

const createRefresh = () => {
  const familiesById = new Map<string, { id: string }>();
  const familyOfType = new Map<unknown, { id: string }>();
  const calls = { inject: 0, refresh: 0 };
  const runtime = {
    injectIntoGlobalHook: () => {
      calls.inject += 1;
    },
    // Mirrors react-refresh: a type keeps the family it was first registered under.
    register: (type: unknown, id: string) => {
      if (familyOfType.has(type)) return;
      const family = familiesById.get(id) ?? { id };
      familiesById.set(id, family);
      familyOfType.set(type, family);
    },
    performReactRefresh: () => {
      calls.refresh += 1;
    },
    createSignatureFunctionForTransform: () => (type: unknown) => type,
    isLikelyComponentType: (value: unknown) => typeof value === "function" && /^[A-Z]/.test(value.name),
    getFamilyByType: (value: unknown) => familyOfType.get(value),
  };
  return { calls, runtime };
};

const createHarness = (modules: Record<string, CsrModuleFactory>) => {
  const refresh = createRefresh();
  const timers: (() => void)[] = [];
  const scripts: FakeScript[] = [];
  const warnings: string[] = [];
  let reloads = 0;
  const host: CsrDevRuntimeHost = {
    document: {
      currentScript: { dataset: { akanCsrEntry: "app/entry.ts" } },
      head: {
        appendChild: (node) => {
          scripts.push(node as FakeScript);
          return node;
        },
      },
      createElement: () => ({ src: "", dataset: {}, onload: null, onerror: null, remove: () => undefined }),
    },
    location: {
      reload: () => {
        reloads += 1;
      },
    },
    console: { warn: (...args: unknown[]) => warnings.push(args.join(" ")) },
    setTimeout: (callback: () => void) => timers.push(callback),
    clearTimeout: () => undefined,
  };
  installCsrDevRuntime(host);
  const api = host.__akan as CsrDevRuntimeApi;
  api.define(REFRESH_ID, (_require, record) => {
    record.exports = refresh.runtime;
  });
  for (const [id, factory] of Object.entries(modules)) api.define(id, factory);
  return {
    api,
    host,
    refresh,
    scripts,
    warnings,
    get reloads() {
      return reloads;
    },
    flushTimers: () => {
      for (const timer of timers.splice(0)) timer();
    },
    executed: () => host.__AKAN_CSR_LAST_UPDATE__?.executed ?? [],
  };
};

const component =
  (name: string, extra: Record<string, unknown> = {}): CsrModuleFactory =>
  (_require, record, _exports, $RefreshReg$) => {
    const type = { [name]: () => null }[name];
    $RefreshReg$(type, name);
    record.exports = { [name]: type, ...extra };
  };

const app =
  (label: string): CsrModuleFactory =>
  (require, record, _exports, $RefreshReg$) => {
    const labels = require("akan-module:app/label.ts") as { label: string };
    require("akan-module:app/Counter.tsx");
    const App = () => `${label}:${labels.label}`;
    $RefreshReg$(App, "App");
    record.exports = { App };
  };

const baseModules = (): Record<string, CsrModuleFactory> => ({
  "app/entry.ts": (require) => {
    require("akan-module:app/App.tsx");
  },
  "app/App.tsx": app("v1"),
  "app/Counter.tsx": component("Counter"),
  "app/label.ts": (_require, record) => {
    record.exports = { label: "one" };
  },
});

describe("installCsrDevRuntime", () => {
  test("start installs React Refresh before the entry runs, then evaluates the entry", () => {
    const order: string[] = [];
    const harness = createHarness({
      ...baseModules(),
      "app/entry.ts": () => {
        order.push("entry");
      },
    });
    harness.refresh.runtime.injectIntoGlobalHook = () => {
      order.push("inject");
    };
    harness.api.start({ generation: 3, refresh: REFRESH_ID });
    expect(order).toEqual(["inject", "entry"]);
    expect(harness.api.generation).toBe(3);
  });

  test("a component module is its own boundary: only it re-runs, and React refreshes once", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, { "app/Counter.tsx": component("Counter") });
    harness.flushTimers();
    expect(harness.executed()).toEqual(["app/Counter.tsx"]);
    expect(harness.refresh.calls.refresh).toBe(1);
    expect(harness.reloads).toBe(0);
    expect(harness.api.generation).toBe(2);
  });

  test("a non-component module bubbles to the nearest component module above it", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, {
      "app/label.ts": (_require, record) => {
        record.exports = { label: "two" };
      },
    });
    expect(harness.executed()).toEqual(["app/label.ts", "app/App.tsx"]);
    expect(harness.reloads).toBe(0);
  });

  test("a module with nothing above it but the entry reloads the page", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, {
      "app/entry.ts": (require) => {
        require("akan-module:app/App.tsx");
      },
    });
    expect(harness.reloads).toBe(1);
    expect(harness.warnings[0]).toContain("no component boundary above app/entry.ts");
  });

  test("a component module whose exports change hands the update to its importer", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, { "app/Counter.tsx": component("Counter", { initialCount: 0 }) });
    expect(harness.executed()).toEqual(["app/Counter.tsx", "app/App.tsx"]);
    expect(harness.reloads).toBe(0);
  });

  test("a skipped generation reloads instead of applying out of order", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(3, { "app/Counter.tsx": component("Counter") });
    expect(harness.reloads).toBe(1);
    expect(harness.api.generation).toBe(1);
  });

  test("an update that throws while re-running reloads", () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, {
      "app/Counter.tsx": () => {
        throw new Error("boom");
      },
    });
    expect(harness.reloads).toBe(1);
    expect(harness.warnings[0]).toContain("boom");
  });

  test("an export that throws on access is not a component and does not break the boundary check", () => {
    const trap = new Proxy(
      {},
      {
        get: () => {
          throw new Error("not registered yet");
        },
      },
    );
    const harness = createHarness({
      ...baseModules(),
      "app/label.ts": (_require, record) => {
        record.exports = { label: "one", msg: trap };
      },
    });
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, {
      "app/label.ts": (_require, record) => {
        record.exports = { label: "two", msg: trap };
      },
    });
    expect(harness.executed()).toEqual(["app/label.ts", "app/App.tsx"]);
    expect(harness.reloads).toBe(0);
  });

  test("a module that accepts itself stops the bubbling without being a component", () => {
    const modules = baseModules();
    modules["app/label.ts"] = (_require, record) => {
      record.exports = { label: "one" };
      record.hot.accept();
    };
    const harness = createHarness(modules);
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, { "app/label.ts": modules["app/label.ts"] as CsrModuleFactory });
    expect(harness.executed()).toEqual(["app/label.ts"]);
    expect(harness.reloads).toBe(0);
  });

  describe("an importer that accepts its dependencies", () => {
    const pageModule =
      (version: string): CsrModuleFactory =>
      (require, record) => {
        const recipe = require("akan-module:app/recipe.ts") as { tone: string };
        record.exports = { default: { render: () => `${version}:${recipe.tone}` } };
      };
    const routeModules = (updates: string[][]): Record<string, CsrModuleFactory> => ({
      "app/entry.ts": (require, record) => {
        require("akan-module:app/page.tsx");
        record.hot.accept(["akan-module:app/page.tsx"], (updated) => updates.push(updated));
      },
      "app/page.tsx": pageModule("v1"),
      "app/recipe.ts": (_require, record) => {
        record.exports = { tone: "calm" };
      },
    });

    test("takes a changed dependency without re-running itself", () => {
      const updates: string[][] = [];
      const harness = createHarness(routeModules(updates));
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      harness.api.update(2, { "app/page.tsx": pageModule("v2") });
      expect(harness.executed()).toEqual(["app/page.tsx"]);
      expect(updates).toEqual([["app/page.tsx"]]);
      expect(harness.reloads).toBe(0);
    });

    test("is told when a module below the dependency changed", () => {
      const updates: string[][] = [];
      const harness = createHarness(routeModules(updates));
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      harness.api.update(2, {
        "app/recipe.ts": (_require, record) => {
          record.exports = { tone: "bold" };
        },
      });
      expect(harness.executed()).toEqual(["app/recipe.ts", "app/page.tsx"]);
      expect(updates).toEqual([["app/page.tsx"]]);
      expect(harness.reloads).toBe(0);
    });

    test("reloads when its callback throws", () => {
      const modules = routeModules([]);
      modules["app/entry.ts"] = (require, record) => {
        require("akan-module:app/page.tsx");
        record.hot.accept(["app/page.tsx"], () => {
          throw new Error("route table rejected");
        });
      };
      const harness = createHarness(modules);
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      harness.api.update(2, { "app/page.tsx": pageModule("v2") });
      expect(harness.reloads).toBe(1);
      expect(harness.warnings[0]).toContain("route table rejected");
    });

    test("reloads when its async callback rejects", async () => {
      const modules = routeModules([]);
      modules["app/entry.ts"] = (require, record) => {
        require("akan-module:app/page.tsx");
        record.hot.accept(["app/page.tsx"], async () => {
          throw new Error("route table rejected later");
        });
      };
      const harness = createHarness(modules);
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      harness.api.update(2, { "app/page.tsx": pageModule("v2") });
      expect(harness.reloads).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.reloads).toBe(1);
      expect(harness.warnings[0]).toContain("route table rejected later");
    });

    test("holds the next patch until its async callback settles", async () => {
      let release: () => void = () => undefined;
      const modules = routeModules([]);
      modules["app/entry.ts"] = (require, record) => {
        require("akan-module:app/page.tsx");
        record.hot.accept(
          ["app/page.tsx"],
          () =>
            new Promise<void>((resolve) => {
              release = () => resolve();
            }),
        );
      };
      const harness = createHarness(modules);
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
      const loaded = () => harness.scripts.map((script) => script.src);
      harness.api.hot({ generation: 2, url: "/_akan/csr-dev/patch-2.js" });
      harness.api.hot({ generation: 3, url: "/_akan/csr-dev/patch-3.js" });
      await settle();
      harness.api.update(2, { "app/page.tsx": pageModule("v2") });
      harness.scripts[0]?.onload?.();
      await settle();
      expect(loaded()).toEqual(["/_akan/csr-dev/patch-2.js"]);
      release();
      await settle();
      expect(loaded()).toEqual(["/_akan/csr-dev/patch-2.js", "/_akan/csr-dev/patch-3.js"]);
      expect(harness.reloads).toBe(0);
    });
  });

  test("a module never loaded takes its new factory without running", () => {
    const harness = createHarness({ ...baseModules(), "app/Lazy.tsx": component("Lazy") });
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.update(2, { "app/Lazy.tsx": component("Lazy") });
    expect(harness.executed()).toEqual([]);
    expect(harness.api.generation).toBe(2);
  });

  test("toESM keeps an ESM-compiled namespace whole and wraps a CommonJS one with a default", () => {
    const harness = createHarness(baseModules());
    const esm = Object.defineProperty({ named: 1 }, "__esModule", { value: true });
    expect(harness.api.toESM(esm, 1)).toBe(esm);
    const cjs = { named: 2 };
    const wrapped = harness.api.toESM(cjs, 1) as Record<string, unknown>;
    expect(wrapped.default).toBe(cjs);
    expect(Object.keys(wrapped).sort()).toEqual(["default", "named"]);
  });

  test("reExport skips default and the __esModule marker", () => {
    const harness = createHarness(baseModules());
    const source = Object.defineProperty({ a: 1, default: 2 }, "__esModule", { value: true });
    const target = {};
    harness.api.reExport(target, source);
    expect(Object.keys(target)).toEqual(["a"]);
  });

  test("hot queues patches in order and reloads on a reload message", async () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    harness.api.hot({ generation: 2, url: "/_akan/csr-dev/patch-2.js" });
    harness.api.hot({ generation: 3, url: "/_akan/csr-dev/patch-3.js" });
    await settle();
    expect(harness.scripts.map((script) => script.src)).toEqual(["/_akan/csr-dev/patch-2.js"]);
    harness.api.update(2, { "app/Counter.tsx": component("Counter") });
    harness.scripts[0]?.onload?.();
    await settle();
    expect(harness.scripts.map((script) => script.src)).toEqual([
      "/_akan/csr-dev/patch-2.js",
      "/_akan/csr-dev/patch-3.js",
    ]);
    harness.api.hot({ generation: 4, reload: true, reason: "the route table changed" });
    expect(harness.reloads).toBe(1);
    expect(harness.warnings.at(-1)).toContain("the route table changed");
  });

  test("a patch that fails to load asks the server: gone reloads, there retries once, no answer leaves the page", async () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const run = async (answer: () => Promise<{ ok: boolean }>) => {
      const harness = createHarness(baseModules());
      harness.host.fetch = answer;
      harness.api.start({ generation: 1, refresh: REFRESH_ID });
      harness.api.hot({ generation: 2, url: "/_akan/csr-dev/patch-2.js" });
      await settle();
      harness.scripts[0]?.onerror?.();
      await settle();
      return harness;
    };
    expect((await run(async () => ({ ok: false }))).reloads).toBe(1);
    const leaving = await run(async () => {
      throw new Error("cancelled");
    });
    expect(leaving.reloads).toBe(0);
    const there = await run(async () => ({ ok: true }));
    expect(there.reloads).toBe(0);
    expect(there.scripts.map((script) => script.src)).toEqual([
      "/_akan/csr-dev/patch-2.js",
      "/_akan/csr-dev/patch-2.js",
    ]);
    there.scripts[1]?.onerror?.();
    await settle();
    expect(there.reloads).toBe(1);
  });

  test("whenSettled waits for the patch it was handed to load and apply", async () => {
    const harness = createHarness(baseModules());
    harness.api.start({ generation: 1, refresh: REFRESH_ID });
    harness.api.hot({ generation: 2, url: "/_akan/csr-dev/patch-2.js" });
    let settled = false;
    const done = harness.api.whenSettled().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    harness.api.update(2, { "app/Counter.tsx": component("Counter") });
    harness.scripts[0]?.onload?.();
    await done;
    expect(settled).toBe(true);
  });

  describe("library mode (an SSR page)", () => {
    const REFRESH_VENDOR = "vendor:react-refresh/runtime";

    test("startLibrary runs the bootstrap with the provided refresh runtime and injects nothing", () => {
      const order: string[] = [];
      const harness = createHarness({
        "app/boot.ts": () => {
          order.push("boot");
        },
        "app/Counter.tsx": component("Counter"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      expect(order).toEqual(["boot"]);
      expect(harness.refresh.calls.inject).toBe(0);
      expect(harness.api.generation).toBe(2);
      expect(Object.keys(harness.api.require("app/Counter.tsx") as object)).toEqual(["Counter"]);
    });

    test("a provided namespace reads as a compiled ESM module", () => {
      const harness = createHarness({});
      const useState = () => undefined;
      const namespace = { default: { useState }, useState };
      harness.api.provide("vendor:react", namespace);
      const view = harness.api.require("vendor:react") as Record<string, unknown>;
      expect(view.__esModule).toBe(true);
      expect(view.default).toBe(namespace.default);
      expect(view.useState).toBe(useState);
      expect(harness.api.toESM(view, 1)).toBe(view);
    });

    test("whenDefined settles once a patch defines the module", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      const defined = harness.api.whenDefined("app/New.tsx");
      expect(harness.api.has("app/New.tsx")).toBe(false);
      harness.api.update(3, { "app/New.tsx": component("New") });
      await defined;
      expect(Object.keys(harness.api.require("app/New.tsx") as object)).toEqual(["New"]);
    });

    test("a bootstrap that throws leaves the page to reload on the next newer update, not to queue it", () => {
      const harness = createHarness({
        "app/boot.ts": () => {
          throw new Error("store top-level error");
        },
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      expect(() =>
        harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" }),
      ).toThrow("store top-level error");
      harness.api.hot({ generation: 2, url: "/_akan/ssr-dev/patch-2.js" });
      expect(harness.reloads).toBe(0);
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      expect(harness.reloads).toBe(1);
      expect(harness.warnings.at(-1)).toContain("failed to start");
    });

    test("a refresh runtime that fails to load fails the start, so the next newer update reloads rather than queues", () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      expect(() =>
        harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" }),
      ).toThrow();
      expect(harness.api.inspect().failed).toBe(true);
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      expect(harness.reloads).toBe(1);
    });

    test("a payload root that also exports non-components re-runs in place and refreshes its components", () => {
      const harness = createHarness({
        "app/boot.ts": () => undefined,
        "app/Header.tsx": component("Header", { headerLinks: ["a"] }),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.require("app/Header.tsx");
      harness.api.update(3, { "app/Header.tsx": component("Header", { headerLinks: ["a", "b"] }) });
      harness.flushTimers();
      expect(harness.reloads).toBe(0);
      expect(harness.executed()).toEqual(["app/Header.tsx"]);
      expect((harness.api.require("app/Header.tsx") as { headerLinks: string[] }).headerLinks).toEqual(["a", "b"]);
      expect(harness.refresh.calls.refresh).toBe(1);
    });

    test("a module outside the registry's graph and the payload still reloads when nothing can take it", () => {
      const harness = createHarness({
        "app/boot.ts": (require) => {
          require("akan-module:app/config.ts");
        },
        "app/config.ts": (_require, record) => {
          record.exports = { value: 1 };
        },
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.update(3, {
        "app/config.ts": (_require, record) => {
          record.exports = { value: 2 };
        },
      });
      expect(harness.reloads).toBe(1);
    });

    test("catching up loads each missed generation's patch in order, from after the newest one handed over", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.api.catchUp(5, "/_akan/ssr-dev/");
      expect(harness.api.inspect().target).toBe(0);
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      harness.api.catchUp(5, "/_akan/ssr-dev/");
      harness.api.catchUp(5, "/_akan/ssr-dev/");
      expect(harness.api.inspect().target).toBe(5);
      const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
      for (const generation of [3, 4, 5]) {
        harness.api.update(generation, {});
        harness.scripts.at(-1)?.onload?.();
        await settle();
      }
      expect(harness.scripts.map((script) => script.src)).toEqual([
        "/_akan/ssr-dev/patch-3.js",
        "/_akan/ssr-dev/patch-4.js",
        "/_akan/ssr-dev/patch-5.js",
      ]);
      expect(harness.api.generation).toBe(5);
      expect(harness.reloads).toBe(0);
      harness.api.hot({ generation: 5, url: "/_akan/ssr-dev/patch-5.js" });
      harness.api.catchUp(7, "/_akan/ssr-dev/");
      harness.api.hot({ generation: 6, url: "/_akan/ssr-dev/patch-6.js" });
      await settle();
      expect(harness.scripts.slice(3).map((script) => script.src)).toEqual(["/_akan/ssr-dev/patch-6.js"]);
    });

    test("a module that threw is not swapped by the update fixing it or its dependency: the page reloads", () => {
      const harness = createHarness({
        "app/boot.ts": () => undefined,
        "app/Broken.tsx": () => {
          throw new Error("top-level failure");
        },
        "app/Other.tsx": component("Other"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      expect(() => harness.api.require("app/Broken.tsx")).toThrow("top-level failure");
      harness.api.update(3, { "app/Other.tsx": component("Other") });
      expect(harness.reloads).toBe(1);
      expect(harness.warnings.at(-1)).toContain("app/Broken.tsx failed to run");
    });

    test("a failure its importer caught is not held against the page, so the next update still patches in place", () => {
      const harness = createHarness({
        "stub:crypto": () => {
          throw new Error("crypto is a Node built-in the browser does not have");
        },
        "node_modules/iso-lib/index.js": (require, record) => {
          let hasCrypto = true;
          try {
            require("akan-module:stub:crypto");
          } catch {
            hasCrypto = false;
          }
          record.exports = { hasCrypto };
        },
        "app/boot.ts": (require) => {
          require("akan-module:node_modules/iso-lib/index.js");
        },
        "app/Other.tsx": component("Other"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.require("app/Other.tsx");
      harness.api.update(3, { "app/Other.tsx": component("Other") });
      expect(harness.reloads).toBe(0);
    });

    test("a lazy import that failed reloads on the next update, which may carry its fix", async () => {
      let imported: Promise<unknown> = Promise.resolve();
      const harness = createHarness({
        "app/boot.ts": () => undefined,
        "app/Lazy.tsx": () => {
          throw new Error("lazy failure");
        },
        "app/Route.tsx": (_require, record, _exports, _register, _signature, importLazy) => {
          imported = importLazy("akan-module:app/Lazy.tsx");
          record.exports = { Route: () => null };
        },
        "app/Other.tsx": component("Other"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.require("app/Route.tsx");
      await expect(imported).rejects.toThrow("lazy failure");
      harness.api.update(3, { "app/Other.tsx": component("Other") });
      expect(harness.reloads).toBe(1);
      expect(harness.warnings.at(-1)).toContain("app/Lazy.tsx failed to run");
    });

    test("a module that threw and then loaded is no longer held against the page", () => {
      let runs = 0;
      const harness = createHarness({
        "app/boot.ts": () => undefined,
        "app/Flaky.tsx": (_require, record) => {
          runs += 1;
          if (runs === 1) throw new Error("first run failed");
          record.exports = { Flaky: () => null };
        },
        "app/Other.tsx": component("Other"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      expect(() => harness.api.require("app/Flaky.tsx")).toThrow("first run failed");
      harness.api.require("app/Flaky.tsx");
      harness.api.require("app/Other.tsx");
      harness.api.update(3, { "app/Other.tsx": component("Other") });
      expect(harness.reloads).toBe(0);
    });

    test("a stub or a package the payload required is not held when it throws, but a package factory the tab lacks is", async () => {
      const failures = {
        "stub:node:fs": () => {
          throw new Error("fs is a Node built-in the browser does not have");
        },
        "node_modules/throws/index.js": () => {
          throw new Error("the package threw");
        },
      };
      for (const id of Object.keys(failures)) {
        const harness = createHarness({
          "app/boot.ts": () => undefined,
          "app/Other.tsx": component("Other"),
          ...failures,
        });
        harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
        harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
        harness.api.require("app/Other.tsx");
        expect(() => harness.api.require(id)).toThrow();
        harness.api.update(3, { "app/Other.tsx": component("Other") });
        expect(harness.reloads).toBe(0);
      }

      let imported: Promise<unknown> = Promise.resolve();
      const harness = createHarness({
        "app/boot.ts": () => undefined,
        "app/Globe.tsx": (_require, record, _exports, _register, _signature, importLazy) => {
          imported = importLazy("akan-module:node_modules/new-pkg/index.js");
          record.exports = { Globe: () => null };
        },
        "app/Other.tsx": component("Other"),
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.require("app/Globe.tsx");
      await expect(imported).rejects.toThrow("no module registered as node_modules/new-pkg/index.js");
      harness.api.update(3, { "app/Other.tsx": component("Other") });
      expect(harness.reloads).toBe(1);
    });

    test("a patch queued behind one that went unanswered waits for the catch-up instead of reloading the tab", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.host.fetch = async () => {
        throw new Error("offline");
      };
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      harness.api.hot({ generation: 4, url: "/_akan/ssr-dev/patch-4.js" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.scripts[0]?.onerror?.();
      for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.scripts.map((script) => script.src)).toEqual(["/_akan/ssr-dev/patch-3.js"]);
      expect(harness.reloads).toBe(0);
      expect(harness.api.inspect().target).toBe(2);
    });

    test("whenSettled waits for the start to replay an update that came before it", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      let settled = false;
      void harness.api.whenSettled().then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      harness.scripts[0]?.onload?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(true);
    });

    test("a module no update brought in time is held like one that threw, so the update defining it reloads", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      const waiting = harness.api.whenDefined("app/Late.tsx");
      harness.flushTimers();
      await expect(waiting).rejects.toThrow("no update brought one");
      harness.api.update(3, { "app/Late.tsx": component("Late") });
      expect(harness.reloads).toBe(1);
    });

    test("a start that failed reloads on a reload of its own generation, and names the build app.js came from", () => {
      const harness = createHarness({
        "app/boot.ts": () => {
          throw new Error("vendor:new-dep is not provided");
        },
      });
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      expect(() =>
        harness.api.startLibrary({
          generation: 4,
          refresh: REFRESH_VENDOR,
          bootstrap: "app/boot.ts",
          vendorFile: "vendor-b.js",
          epoch: 9,
        }),
      ).toThrow();
      expect(harness.api.inspect()).toMatchObject({ failed: true, vendorFile: "vendor-b.js", epoch: 9 });
      harness.api.hot({ generation: 3, reload: true });
      expect(harness.reloads).toBe(0);
      harness.api.hot({ generation: 4, reload: true, reason: "an npm module joined the graph" });
      expect(harness.reloads).toBe(1);
    });

    test("a patch whose load and probe both went unanswered stays owed to the next catch-up", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.host.fetch = async () => {
        throw new Error("offline");
      };
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.scripts[0]?.onerror?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.api.inspect().target).toBe(2);
      harness.api.catchUp(3, "/_akan/ssr-dev/");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.scripts.map((script) => script.src)).toEqual([
        "/_akan/ssr-dev/patch-3.js",
        "/_akan/ssr-dev/patch-3.js",
      ]);
      harness.api.catchUp(200, "/_akan/ssr-dev/");
      expect(harness.reloads).toBe(1);
    });

    test("an update that arrives before the start waits for it, and one the app already holds is dropped", async () => {
      const harness = createHarness({ "app/boot.ts": () => undefined });
      harness.api.hot({ generation: 2, url: "/_akan/ssr-dev/patch-2.js" });
      harness.api.hot({ generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.scripts).toEqual([]);
      harness.api.provide(REFRESH_VENDOR, harness.refresh.runtime);
      harness.api.startLibrary({ generation: 2, refresh: REFRESH_VENDOR, bootstrap: "app/boot.ts" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(harness.scripts.map((script) => script.src)).toEqual(["/_akan/ssr-dev/patch-3.js"]);
    });
  });

  test("a reconnecting tab catches up on as many patches as the artifact writer keeps", () => {
    expect(CSR_DEV_RUNTIME_SCRIPT).toContain(`maxCatchUp = ${CSR_DEV_KEPT_PATCHES};`);
  });

  test("the serialized script installs the runtime with nothing from this module in scope", () => {
    const host = { document: {}, location: {}, console: {} } as unknown as CsrDevRuntimeHost;
    new Function("self", CSR_DEV_RUNTIME_SCRIPT)(host);
    expect(typeof host.__akan?.define).toBe("function");
    expect(host.__akan?.generation).toBe(0);
  });
});
