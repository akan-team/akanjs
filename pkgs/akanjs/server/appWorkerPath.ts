import path from "node:path";

//* A source run has no `workers/<name>.js`, so the CLI hands the server the declared source paths in `AKAN_WORKERS`.
export class AppWorkerPath {
  static readonly dir = "workers";
  static readonly envKey = "AKAN_WORKERS";
  static readonly name = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

  static built(appDir: string, name: string) {
    return path.join(appDir, AppWorkerPath.dir, `${name}.js`);
  }

  static sources(env: NodeJS.ProcessEnv = process.env): { [name: string]: string } {
    const declared = env[AppWorkerPath.envKey];
    if (!declared) return {};
    try {
      const sources: unknown = JSON.parse(declared);
      return sources && typeof sources === "object" ? (sources as { [name: string]: string }) : {};
    } catch {
      return {};
    }
  }
}
