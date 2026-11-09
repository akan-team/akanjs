import type { ModulePreloadPlan } from "./artifact/modulePreloadPlan";

//? RSDW outlines a client reference's chunk URLs into string rows (`5:"/_akan/client/…js"`) its `I` row names as
//? `"$5"`, and may flush the `I` row first. Only an `I` row picks a chunk, so a page's text never adds a preload.
export class FlightModulePreloads {
  static readonly #marker = Buffer.from("/_akan/client/");
  static readonly #maxUrlRowBytes = 1024;
  static readonly #urlRowRe = /^([0-9a-f]+):"(\/_akan\/client\/[^"\\]+\.js)"\n?$/;
  readonly #plan: ModulePreloadPlan;
  readonly #urlByRowId = new Map<string, string>();
  readonly #chunkRefs = new Set<string>();
  readonly #decoder = new TextDecoder();
  #taken: string[] | null = null;

  constructor(plan: ModulePreloadPlan) {
    this.#plan = plan;
  }

  observe(row: Uint8Array, tag: string): void {
    if (this.#taken) return;
    if (tag === "I") this.#observeImport(this.#decoder.decode(row));
    else if (tag === "" && row.byteLength <= FlightModulePreloads.#maxUrlRowBytes) this.#observeString(row);
  }

  get urls(): string[] {
    this.#taken ??= this.#resolve();
    return this.#taken;
  }

  #resolve() {
    const chunkUrls = new Set<string>();
    for (const ref of this.#chunkRefs) {
      const url = ref.startsWith("$") ? this.#urlByRowId.get(ref.slice(1)) : ref;
      if (url && this.#plan.knows(url)) chunkUrls.add(url);
    }
    return this.#plan.urlsOf(chunkUrls);
  }

  #observeString(row: Uint8Array) {
    if (Buffer.from(row.buffer, row.byteOffset, row.byteLength).indexOf(FlightModulePreloads.#marker) < 0) return;
    const match = this.#decoder.decode(row).match(FlightModulePreloads.#urlRowRe);
    if (match?.[1] && match[2]) this.#urlByRowId.set(match[1], match[2]);
  }

  #observeImport(text: string) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(text.slice(text.indexOf(":I") + 2));
    } catch {
      return;
    }
    const chunks: unknown = Array.isArray(metadata) ? metadata[1] : null;
    if (!Array.isArray(chunks)) return;
    for (const chunk of chunks) if (typeof chunk === "string") this.#chunkRefs.add(chunk);
  }
}
