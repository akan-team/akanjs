interface RenderScopeStorage {
  run<T>(render: () => T): T;
  getStore(): true | undefined;
}

declare global {
  var __AKAN_RENDER_SCOPE__: RenderScopeStorage | undefined;
}

/**
 * Marks the render of a route — its guards, head, layouts and page body — where a write runs only when its call passes
 * `{ duringRender: true }`. Security: a server render sends the visitor's credential and no `Origin`, which
 * `CrossSiteGuard` reads as a non-browser caller, so a write there would run for whoever opened a link.
 */
export class RenderScope {
  static readonly #storage: RenderScopeStorage = RenderScope.#shared();

  static run<T>(render: () => T): T {
    return RenderScope.#storage.run(render);
  }

  static active(): boolean {
    return RenderScope.#storage.getStore() === true;
  }

  //? Interned: the pages bundle and the framework bundle each carry a copy of this module, and must share one scope.
  static #shared(): RenderScopeStorage {
    globalThis.__AKAN_RENDER_SCOPE__ ??= RenderScope.#createStorage();
    return globalThis.__AKAN_RENDER_SCOPE__;
  }

  static #createStorage(): RenderScopeStorage {
    if (typeof window === "undefined") {
      try {
        const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
        const als = new AsyncLocalStorage<true>();
        return { run: (render) => als.run(true, render), getStore: () => als.getStore() };
      } catch {}
    }
    //? A browser has no async context, so only the render's synchronous part is marked there.
    let current: true | undefined;
    return {
      run(render) {
        const previous = current;
        current = true;
        try {
          return render();
        } finally {
          current = previous;
        }
      },
      getStore: () => current,
    };
  }
}
