import type { ContextBlock, SurfaceView } from "use-agentic";
import type { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { AgentBridge } from "./AgentBridge";
import { ensureStoreSurface } from "./StoreSurfaceSource";

/** A turn's default context: route, on-screen scopes, and live keys (one-token values inline, the rest by name). */
export class AgentContext {
  //? Security: an id or an enum member is one short token. A longer string, or one with a space in it, is free text
  //? that whoever wrote the record or the link chose, and the model reads that through `readState`, as page content.
  static readonly #token = /^[A-Za-z0-9._-]{0,40}$/;
  static readonly #elided = "…";
  static readonly withheldNote = "Free text is left out. Call readState(key) with a key of `withheld` to read it.";

  static of(): AgentContext {
    return new AgentContext(StoreRegistry.instance, ensureStoreSurface().bridge);
  }

  readonly #instance: StoreInstance;
  readonly #bridge: AgentBridge;

  constructor(instance: StoreInstance, bridge: AgentBridge) {
    this.#instance = instance;
    this.#bridge = bridge;
  }

  blocks(surface: SurfaceView, view: string[] = []): ContextBlock[] {
    const { scopes, resources } = surface.snapshot();
    return [
      this.#routeBlock(),
      ...(scopes.length || resources.length ? [{ kind: "screen", scopes, resources }] : []),
      ...this.#liveBlock(view.join(".")),
    ];
  }

  #routeBlock(): ContextBlock {
    const state = this.#instance.get();
    const [pathKey, paramsKey, searchKey] = AgentBridge.routeKeys;
    const pathname = String(state[pathKey] ?? "");
    const path = pathname
      .split("/")
      .map((segment) => (AgentContext.#token.test(segment) ? segment : AgentContext.#elided))
      .join("/");
    const params = AgentContext.#tokensOf(state[paramsKey]);
    const searchParams = AgentContext.#tokensOf(state[searchKey]);
    const withheld = [
      ...(path === pathname ? [] : [pathKey]),
      ...(params.whole ? [] : [paramsKey]),
      ...(searchParams.whole ? [] : [searchKey]),
    ];
    return {
      kind: "route",
      path,
      params: params.inline,
      searchParams: searchParams.inline,
      ...(withheld.length ? { withheld, note: AgentContext.withheldNote } : {}),
    };
  }

  static #tokensOf(record: unknown): { inline: { [key: string]: string | string[] }; whole: boolean } {
    const entries = record && typeof record === "object" ? Object.entries(record) : [];
    const kept = entries.filter(
      (entry): entry is [string, string | string[]] =>
        AgentContext.#token.test(entry[0]) &&
        (Array.isArray(entry[1]) ? entry[1] : [entry[1]]).every(
          (item) => typeof item === "string" && AgentContext.#token.test(item),
        ),
    );
    return { inline: Object.fromEntries(kept), whole: kept.length === entries.length };
  }

  #liveBlock(viewKey: string): ContextBlock[] {
    const live = this.#bridge.readableKeys(viewKey).map((key) => this.#liveEntry(key));
    return live.length ? [{ kind: "state", live, note: "Call readState(key) to read a value." }] : [];
  }

  #liveEntry(key: string) {
    const meta = this.#bridge.state[key];
    const value = AgentContext.#inlineValue(this.#instance.get()[key]);
    return {
      key,
      ...(meta?.refName ? { model: meta.refName } : {}),
      ...(meta ? { type: meta.type } : {}),
      ...(value !== undefined ? { value } : {}),
    };
  }

  static #inlineValue(value: unknown): unknown {
    if (value === null) return null;
    switch (typeof value) {
      case "string":
        return AgentContext.#token.test(value) ? value : undefined;
      case "number":
      case "boolean":
        return value;
      default:
        return undefined;
    }
  }
}
