import type { ModulePreloadPlan } from "./artifact/modulePreloadPlan";

//? RSDW outlines a client reference's chunk URLs into string rows (`5:"/_akan/client/…js"`) that its `I` row names
//? as `$5`, so every row is read, and a string counts only when the build emitted a chunk under that URL.
export class FlightModulePreloads {
  static readonly #marker = Buffer.from("/_akan/client/");
  static readonly #chunkUrlRe = /"(\/_akan\/client\/[^"\\]+\.js)"/g;
  readonly #plan: ModulePreloadPlan;
  readonly #chunkUrls = new Set<string>();
  readonly #decoder = new TextDecoder();

  constructor(plan: ModulePreloadPlan) {
    this.#plan = plan;
  }

  observe(row: Uint8Array): void {
    if (Buffer.from(row.buffer, row.byteOffset, row.byteLength).indexOf(FlightModulePreloads.#marker) < 0) return;
    for (const [, url] of this.#decoder.decode(row).matchAll(FlightModulePreloads.#chunkUrlRe))
      if (url && this.#plan.knows(url)) this.#chunkUrls.add(url);
  }

  get urls(): string[] {
    return this.#plan.urlsOf(this.#chunkUrls);
  }
}
