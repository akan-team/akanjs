import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Bun loads the ones NODE_ENV picks from the working directory before code runs, so a cloned repo's file can set them.
const dotenvFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
];
// Bun also reads `KEY: value` lines.
const assignedKey = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[=:]/;

// Judged by presence, not value: a comparison would trust whatever a parser difference with Bun's reader lets through.
export class ShellOnlyEnv<Key extends string> {
  readonly #keys: ReadonlySet<string>;
  #cache: { cwd: string; found: Map<string, string> } | undefined;

  constructor(keys: readonly Key[]) {
    this.#keys = new Set(keys);
  }

  get(key: Key): string | undefined {
    if (this.#found().has(key)) return undefined;
    return process.env[key];
  }

  ignored() {
    return [...this.#found()].map(
      ([key, file]) =>
        `${key} is set in ${file}, which the repository controls, so it is ignored. Export it in your shell instead.`,
    );
  }

  #found() {
    const cwd = process.cwd();
    if (this.#cache?.cwd === cwd) return this.#cache.found;
    const found = new Map<string, string>();
    for (const name of dotenvFiles) {
      const file = path.join(cwd, name);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const key = line.match(assignedKey)?.[1];
        if (key && this.#keys.has(key) && !found.has(key)) found.set(key, name);
      }
    }
    this.#cache = { cwd, found };
    return found;
  }
}
