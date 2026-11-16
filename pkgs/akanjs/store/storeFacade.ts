type StoreFacadeName = "use" | "do" | "slice";

export class StoreFacade {
  static readonly #sources = new WeakMap<object, unknown>();
  static readonly #keysAwaitAndJsonStringifyProbe = new Set(["then", "toJSON"]);

  static guard<T extends object>(name: StoreFacadeName, target: T): T {
    if (process.env.NODE_ENV !== "development") return target;
    return new Proxy(target, {
      get: (facade, key, receiver) => {
        if (typeof key === "symbol" || key in facade || StoreFacade.#keysAwaitAndJsonStringifyProbe.has(key))
          return Reflect.get(facade, key, receiver);
        throw new Error(
          `st.${name}.${key} is not registered: no store loaded on this page declares it. Check the name, or import st from the app's client barrel in a client component of this route.`,
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
