import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

// Bun auto-loads .env from the current directory only, so a run from a subdirectory sees none of the workspace's keys.
// Applied as runtime overrides, never stored: copying a key into ~/.akan/code/auth.json gives it a second lifetime.
export class AkanEnvKeys {
  static async apply(runtime: ModelRuntime, workspaceRoot: string) {
    const applied: string[] = [];
    for (const [name, value] of AkanEnvKeys.#entries(workspaceRoot)) {
      const provider = AkanEnvKeys.#providerOf(name);
      if (!provider || !value) continue;
      // Serially: the runtime's credential writes share one file, and a key written mid-write goes missing.
      await runtime.setRuntimeApiKey(provider, value);
      applied.push(provider);
    }
    return applied;
  }

  static #entries(workspaceRoot: string): [string, string][] {
    const fromProcess = Object.entries(process.env).filter(([, value]) => typeof value === "string") as [
      string,
      string,
    ][];
    const file = path.join(workspaceRoot, ".env");
    if (!existsSync(file)) return fromProcess;
    const fromFile = readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line): [string, string] => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      });
    // The real environment wins: an operator exporting a key for one run should not be overridden by the file.
    return [...fromFile, ...fromProcess];
  }

  /** `DEEPSEEK_API_KEY` names the provider `deepseek`; the engine's provider ids are lower-kebab. */
  static #providerOf(name: string) {
    const match = /^([A-Z0-9_]+)_API_KEY$/.exec(name);
    return match?.[1]?.toLowerCase().replace(/_/g, "-");
  }
}
