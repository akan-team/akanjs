type Env = Record<string, string | undefined>;

// `akan start` outranks a stray NODE_ENV=production (a Bun-loaded `.env`, a CI default): its artifact has no
// routes manifest, so production mode would throw on every request.
export const isDevBuild = (env: Env = process.env): boolean =>
  env.NODE_ENV !== "production" || env.AKAN_COMMAND_TYPE === "start";
