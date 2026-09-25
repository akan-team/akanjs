import { StoreSurfaceSource } from "akanjs/store";
import type { AgenticSurface, SurfaceView } from "use-agentic";

/** One of the tools the akan runtime contributes to every screen, whatever that screen declares. */
export type AgentBuiltin = (typeof StoreSurfaceSource.builtins)[number];

/** `true` (the default) takes all of them, `false` none, an array exactly the ones it names. */
export type BuiltinOption = boolean | AgentBuiltin[];

/**
 * The half of the surface one session reads: scoped to its zone, and narrowed to the built-ins it was given.
 *
 * Narrowing happens here rather than on the source because the source is shared — two sessions read one registry,
 * and a zone that must not navigate away cannot take `navigate` off the screen for the root agent too. A withheld
 * tool is withheld from `call` as well as from the listing, answering the same "unknown tool" a name that was
 * never registered gets: a tool the model can still reach by guessing its name is not withheld.
 */
export const sessionView = (surface: AgenticSurface, path: string[], builtins?: BuiltinOption): SurfaceView => {
  const scoped = path.length ? surface.view(path) : surface;
  if (builtins === undefined || builtins === true) return scoped;
  const kept = new Set<string>(builtins === false ? [] : builtins);
  const names = StoreSurfaceSource.builtins as readonly string[];
  const shown = (name: string) => kept.has(name) || !names.includes(name) || surface.declares(name, path);
  return {
    snapshot: () => {
      const snapshot = scoped.snapshot();
      return { ...snapshot, tools: snapshot.tools.filter((tool) => shown(tool.name)) };
    },
    tool: (name) => (shown(name) ? scoped.tool(name) : null),
    call: async (name, args) => {
      if (!shown(name)) throw new Error(`Unknown tool: ${name}`);
      return await scoped.call(name, args);
    },
    read: (name) => scoped.read(name),
    diffSince: (before) => scoped.diffSince(before),
    subscribe: (listener) => scoped.subscribe(listener),
  };
};
