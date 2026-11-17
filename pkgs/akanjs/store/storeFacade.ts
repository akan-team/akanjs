type StoreFacadeName = "use" | "do" | "slice";

export class StoreFacade {
  static readonly #sources = new WeakMap<object, unknown>();
  //? Read on any object they are handed by `await`, `JSON.stringify` and React's element check, so none may throw.
  static readonly #probedKeys = new Set(["then", "toJSON", "$$typeof"]);

  static guard<T extends object>(name: StoreFacadeName, target: T): T {
    if (process.env.NODE_ENV !== "development") return target;
    return new Proxy(target, {
      get: (facade, key, receiver) => {
        if (typeof key === "symbol" || key in facade || StoreFacade.#probedKeys.has(key))
          return Reflect.get(facade, key, receiver);
        //? Inline so a production build, which folds this method to `return target`, drops the messages with it.
        //? Set by the dev server's bootstrap where a page loads only the stores its files name: each module's store
        //? keys, keyed by `<module> (<scope>)`. A production bundle never carries it.
        const owners = (globalThis as { [owners: symbol]: unknown })[Symbol.for("akanjs.store.owners")] as
          | Partial<Record<StoreFacadeName, Record<string, string[]>>>
          | undefined;
        if (!owners)
          throw new Error(
            `st.${name}.${key} is not registered: no store loaded on this page declares it. Check the name, or import st from the app's client barrel in a client component of this route.`,
          );
        const modules = Object.entries(owners[name] ?? {})
          .filter(([, keys]) => keys.includes(key))
          .map(([module]) => module);
        const fix = `name st.${name}.${key} statically in the file that reads it, or import st from the app's client barrel there.`;
        const handoff =
          "If a framework component (Load.Units, Model.View, ...) read it for an object a server component handed over, that object carried no reference to load the store: hand over what fetch returned, itself or spread, since a JSON, structuredClone or cache copy and an object written by hand carry none, or name the model in a client file of this route.";
        throw new Error(
          modules.length > 0
            ? `st.${name}.${key} is not registered: it belongs to the store of ${modules.join(" or ")}, which this page has not loaded. To load it, ${fix} ${handoff}`
            : `st.${name}.${key} is not registered: no store loaded on this page declares it. Check the name; if a store declares it, ${fix}`,
        );
      },
    });
  }

  static peek(facade: object, key: string): unknown {
    return key in facade ? (facade as { [key: string]: unknown })[key] : undefined;
  }

  static isBuiltFrom(facade: object, key: string, source: unknown) {
    const built = StoreFacade.peek(facade, key);
    return typeof built === "function" && StoreFacade.#sources.get(built) === source;
  }

  static builtFrom<T extends object>(built: T, source: unknown): T {
    StoreFacade.#sources.set(built, source);
    return built;
  }
}
