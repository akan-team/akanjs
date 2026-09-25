import { AgenticSurface } from "use-agentic";
import { AgentBridge } from "./AgentBridge";
import { StoreSurfaceSource } from "./StoreSurfaceSource";

export interface StoreSurface {
  bridge: AgentBridge;
  source: StoreSurfaceSource;
  surface: AgenticSurface;
}

const SURFACE_KEY = Symbol.for("akanjs.store.agentSurface");

/**
 * Attaches the app's store catalogue to the shared surface, once per runtime, lazily — nothing pays for the
 * bridge walk until something agent-facing (the dock, a chat) actually asks. On the server it builds but does not
 * attach: a server-global surface would be shared across requests, and no session assembles context there.
 */
export const ensureStoreSurface = (): StoreSurface => {
  const holder = globalThis as typeof globalThis & { [SURFACE_KEY]?: StoreSurface };
  if (!holder[SURFACE_KEY]) {
    const bridge = AgentBridge.of();
    const source = new StoreSurfaceSource(bridge);
    const surface = AgenticSurface.shared;
    if (typeof window !== "undefined") surface.addSource(source);
    holder[SURFACE_KEY] = { bridge, source, surface };
  }
  return holder[SURFACE_KEY];
};
