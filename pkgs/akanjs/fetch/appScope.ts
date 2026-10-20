interface AppScopeStorage {
  run<T>(app: string, load: () => T): T;
  getStore(): string | undefined;
}

declare global {
  var __AKAN_APP_SCOPE__: AppScopeStorage | undefined;
}

/**
 * Marks the run of a page's `.app()` load, which may only query: an MCP view replays those queries from the tool
 * result's snapshot, so a write in the load would run once for the tool call and again when the view draws.
 */
export class AppScope {
  static readonly #storage: AppScopeStorage = AppScope.#shared();

  static run<T>(app: string, load: () => T): T {
    return AppScope.#storage.run(app, load);
  }

  /** The app whose load is running here, if any. */
  static current(): string | undefined {
    return AppScope.#storage.getStore();
  }

  //? Interned: the pages bundle and the framework bundle each carry a copy of this module, and must share one scope.
  static #shared(): AppScopeStorage {
    globalThis.__AKAN_APP_SCOPE__ ??= AppScope.#createStorage();
    return globalThis.__AKAN_APP_SCOPE__;
  }

  static #createStorage(): AppScopeStorage {
    if (typeof window === "undefined") {
      try {
        const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
        const als = new AsyncLocalStorage<string>();
        return { run: (app, load) => als.run(app, load), getStore: () => als.getStore() };
      } catch {}
    }
    //? A browser has no async context, so only the load's synchronous part is marked there.
    let current: string | undefined;
    return {
      run(app, load) {
        const previous = current;
        current = app;
        try {
          return load();
        } finally {
          current = previous;
        }
      },
      getStore: () => current,
    };
  }
}
