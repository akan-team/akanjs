import path from "node:path";
import { AppWorkerPath } from "akanjs/server/appWorkerPath";
import type { AkanWorkersConfig } from "./types";

export class AkanWorkers {
  static readonly entry = /\.(ts|mts|js|mjs)$/;

  //? Published on load, as the route prefixes are: every process the CLI starts from source inherits it.
  static declare(declared: unknown, owner: string, baseDir: string): AkanWorkersConfig {
    const workers = AkanWorkers.parse(declared, owner, baseDir);
    if (Object.keys(workers).length) process.env[AppWorkerPath.envKey] = JSON.stringify(workers);
    else delete process.env[AppWorkerPath.envKey];
    return workers;
  }

  static parse(declared: unknown, owner: string, baseDir: string): AkanWorkersConfig {
    if (declared === undefined) return {};
    if (!declared || typeof declared !== "object" || Array.isArray(declared))
      throw new Error(`${owner}: workers maps each worker's name to its entry file`);
    return Object.fromEntries(
      Object.entries(declared).map(([name, entry]) => {
        if (!AppWorkerPath.name.test(name))
          throw new Error(`${owner}: workers.${name} is not a name (letters, digits, - and _)`);
        if (typeof entry !== "string" || !AkanWorkers.entry.test(entry) || path.isAbsolute(entry))
          throw new Error(
            `${owner}: workers.${name} must be a .ts or .js file, relative to this config (got ${JSON.stringify(entry)})`,
          );
        return [name, path.resolve(baseDir, entry)];
      }),
    );
  }
}
