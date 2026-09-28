import type { App } from "../commandDecorators";

export const bundleDefine = (app: App, command: "build" | "start", renderEnv: "ssr" | "csr") => {
  const nodeEnv = command === "build" ? "production" : (process.env.NODE_ENV ?? "development");
  return {
    "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    "process.env.AKAN_PUBLIC_RENDER_ENV": JSON.stringify(renderEnv),
    //? Sorted: Windows hands a child its environment sorted, while keys the config sets at runtime trail the parent's,
    //? and the dev registries hash this object to tell a worker's build from the builder's.
    ...Object.fromEntries(
      Object.entries(app.getPublicEnv())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
    ),
  };
};
