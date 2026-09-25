import type { ContextBlock, SurfaceView } from "use-agentic";
import type { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import type { AgentBridge } from "./AgentBridge";
import { ensureStoreSurface } from "./storeSurface";

/**
 * The akan default context for a turn: where the user is (route), what is on screen (scopes and their curated
 * resources), and which store keys the mounted components are reading (live keys). Live entries carry names and
 * small primitives only — anything bigger is one `readState` call away, masked — so the block cannot bloat with
 * what happens to be in the store. Base-store plumbing is kept off the surface by `st.use.x({ agent: false })`
 * at each call site, and the route block carries the three of them that matter.
 */
export class AgentContext {
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
    const state = this.#instance.get();
    const { scopes, resources } = surface.snapshot();
    return [
      {
        kind: "route",
        path: String(state.pathname ?? ""),
        params: state.params ?? {},
        searchParams: state.searchParams ?? {},
      },
      ...(scopes.length || resources.length ? [{ kind: "screen", scopes, resources }] : []),
      ...this.#liveBlock(view.join(".")),
    ];
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

  /** Primitives ride inline; anything bigger stays a name the agent pulls with `readState`. */
  static #inlineValue(value: unknown): unknown {
    if (value === null) return null;
    switch (typeof value) {
      case "string":
        return value.length <= 200 ? value : `${value.slice(0, 200)}…`;
      case "number":
      case "boolean":
        return value;
      default:
        return undefined;
    }
  }
}
