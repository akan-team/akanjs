import { updateRequestPolicy } from "./requestStorage";

declare global {
  var __AKAN_STREAMED_READS__: WeakSet<object> | undefined;
}

//? Flight reports a rejected promise prop exactly as it reports a level's own throw; this mark is what tells them apart.
export class StreamedRead {
  static readonly #reasons: WeakSet<object> = StreamedRead.#shared();

  //? The render still answers 200, so a cached copy would replay the failure to every visitor, a retry included.
  static mark(reason: unknown): void {
    updateRequestPolicy({ cacheable: false });
    if (typeof reason === "object" && reason !== null) StreamedRead.#reasons.add(reason);
  }

  static is(reason: unknown): boolean {
    return typeof reason === "object" && reason !== null && StreamedRead.#reasons.has(reason);
  }

  //? Interned: the pages bundle and the framework bundle each carry a copy of this module, and must share one set.
  static #shared(): WeakSet<object> {
    globalThis.__AKAN_STREAMED_READS__ ??= new WeakSet();
    return globalThis.__AKAN_STREAMED_READS__;
  }
}
