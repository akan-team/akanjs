import path from "node:path";
import { AppWorkerPath } from "akanjs/server/appWorkerPath";
import type { AkanWorkersConfig } from "./types";

export interface WorkerDeclarer {
  owner: string;
  workers: AkanWorkersConfig;
}

export interface LibWorkers {
  lib: string;
  workers: AkanWorkersConfig;
}

export class AkanWorkers {
  static readonly entry = /\.(ts|mts|js|mjs)$/;

  /** The declarer's own entries, then those of the libs named: its own wins a name, two libs may not differ on one. */
  static select(own: WorkerDeclarer, libWorkers: LibWorkers[], libs: string[], { strict = true } = {}) {
    const chosen = new Map<string, { owner: string; entry: string }>();
    for (const [name, entry] of Object.entries(own.workers)) chosen.set(name, { owner: own.owner, entry });
    for (const { lib, workers } of libWorkers) {
      if (!libs.includes(lib)) continue;
      const owner = `libs/${lib}/akan.config.ts`;
      for (const [name, entry] of Object.entries(workers)) {
        const held = chosen.get(name);
        if (!held) chosen.set(name, { owner, entry });
        else if (strict && held.owner !== own.owner && held.entry !== entry)
          throw new Error(
            `${held.owner} and ${owner} declare workers.${name} differently; declare it in ${own.owner} to pick one.`,
          );
      }
    }
    return chosen;
  }

  //? Published to `process.env`, as the route prefixes are: every process the CLI starts from source inherits it.
  static publish(chosen: Map<string, { entry: string }>): AkanWorkersConfig {
    const sources = Object.fromEntries([...chosen].map(([name, { entry }]) => [name, entry]));
    if (chosen.size) process.env[AppWorkerPath.envKey] = JSON.stringify(sources);
    else delete process.env[AppWorkerPath.envKey];
    return sources;
  }

  static parse(declared: unknown, owner: string, baseDir: string): AkanWorkersConfig {
    if (declared === undefined) return {};
    if (!declared || typeof declared !== "object" || Array.isArray(declared))
      throw new Error(`${owner}: workers maps each worker's name to its entry file`);
    return Object.fromEntries(
      Object.entries(declared).map(([name, entry]) => {
        if (!AppWorkerPath.validName.test(name))
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
