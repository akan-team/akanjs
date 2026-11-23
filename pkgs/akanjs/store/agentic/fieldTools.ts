import type { AgenticSurface, ToolEntry } from "use-agentic";

type FieldToolEntries = typeof import("./fieldToolEntries");

interface FieldMount {
  surface: AgenticSurface;
  scope: string[];
  entries: (build: FieldToolEntries) => ToolEntry[];
  registered: (() => void)[];
}

const mounts = new Set<FieldMount>();
let built: FieldToolEntries | null = null;
let loading: Promise<FieldToolEntries> | null = null;

const register = (mount: FieldMount, build: FieldToolEntries) => {
  mount.registered = mount.entries(build).map((entry) => mount.surface.registerTool(mount.scope, entry));
};

//? A dynamic import, so a route's own JS never carries the tool builders: they load after the first control mounts.
export const loadFieldTools = (): Promise<FieldToolEntries> => {
  if (!loading) {
    loading = import("./fieldToolEntries");
    loading.then(
      (build) => {
        built = build;
        for (const mount of mounts) register(mount, build);
      },
      () => {
        loading = null;
      },
    );
  }
  return loading;
};

export const mountFieldTools = (
  surface: AgenticSurface,
  scope: string[],
  entries: (build: FieldToolEntries) => ToolEntry[],
) => {
  const mount: FieldMount = { surface, scope, entries, registered: [] };
  mounts.add(mount);
  if (built) register(mount, built);
  else void loadFieldTools();
  return () => {
    mounts.delete(mount);
    for (const unregister of mount.registered) unregister();
  };
};
