import { StreamedRead } from "../streamedRead";

type FieldFactories<Handle> = { [Key in keyof Handle]: () => Handle[Key] };

/** Awaitable as the shape a helper always gave, and destructurable into one promise per field. */
export class FetchHandle {
  /**
   * Each of `requests` gets a swallowing handler, so a field nobody reads cannot surface as an unhandled rejection;
   * `fields` factories are memoized on first read.
   */
  static of<Awaited extends object, Handle extends object>(
    requests: Promise<unknown>[],
    settle: () => Promise<Awaited>,
    fields: FieldFactories<Handle>,
  ): PromiseLike<Awaited> & Handle {
    for (const request of requests) void request.catch(() => undefined);
    let settled: Promise<Awaited> | undefined;
    const resolve = () => {
      if (settled) return settled;
      settled = settle();
      void settled.catch(() => undefined);
      return settled;
    };
    const read = new Map<string, unknown>();
    const factories = fields as { [key: string]: () => unknown };
    const handle = {} as { [key: string]: unknown };
    for (const key of Object.keys(factories)) {
      Object.defineProperty(handle, key, {
        enumerable: true,
        get: () => {
          if (!read.has(key)) read.set(key, FetchHandle.#streamed(factories[key]()));
          return read.get(key);
        },
      });
    }
    // Non-enumerable, so a spread copy yields the fields and not a stray `then` making it look awaitable.
    return Object.defineProperties(handle, {
      // biome-ignore lint/suspicious/noThenProperty: awaitable by design, see above
      then: { value: (...args: unknown[]) => Reflect.apply(resolve().then, resolve(), args) },
      catch: { value: (...args: unknown[]) => Reflect.apply(resolve().catch, resolve(), args) },
      finally: { value: (...args: unknown[]) => Reflect.apply(resolve().finally, resolve(), args) },
    }) as PromiseLike<Awaited> & Handle;
  }

  //? A field is the read a route hands a `Load.*` unawaited, so its failure is the stream's to show, not the page's.
  static #streamed(field: unknown): unknown {
    if (!(field instanceof Promise)) return field;
    return field.catch((reason: unknown) => {
      StreamedRead.mark(reason);
      throw reason;
    });
  }

  /** The awaited shape's fields stay lazy for the same reason the handle's do: a caller reads one, not all. */
  static lazy<Target extends object>(target: Target, fields: { [key: string]: () => unknown }): Target {
    for (const [key, factory] of Object.entries(fields))
      Object.defineProperty(target, key, { enumerable: true, get: factory });
    return target;
  }
}
