import { describe, expect, test } from "bun:test";
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

  test("the serialized script installs the runtime with nothing from this module in scope", () => {
    const host = { document: {}, location: {}, console: {} } as unknown as CsrDevRuntimeHost;
    new Function("self", CSR_DEV_RUNTIME_SCRIPT)(host);
    expect(typeof host.__akan?.define).toBe("function");
    expect(host.__akan?.generation).toBe(0);
  });
});
