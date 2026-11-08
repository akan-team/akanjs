import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isInside } from "./coreLoader";

export interface AkanRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface VerifyDiagnostic {
  step: string;
  file: string | null;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning";
  message: string;
  fix?: string;
}

export interface VerifyResult {
  ok: boolean;
  targets: string[];
  ms: number;
  steps: { name: string; status: "pass" | "fail" | "skip"; ms: number; fixed: number }[];
  diagnostics: VerifyDiagnostic[];
}

const readJson = (fileName: string): unknown => {
  try {
    return JSON.parse(readFileSync(fileName, "utf8"));
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const kebabOf = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export class AkanCli {
  readonly root: string;
  readonly #prefix: string[];

  constructor(root: string, prefix: string[]) {
    this.root = root;
    this.#prefix = prefix;
  }

  //? A CLI resolved above the folder is outside Workspace Trust. `bunx akan` is no fallback either: without a
  //? local install it fetches an unrelated npm package.
  static of(root: string) {
    const manifest = readJson(path.join(root, "package.json"));
    if (!isRecord(manifest)) return null;
    if (isRecord(manifest.scripts) && typeof manifest.scripts.akan === "string")
      return new AkanCli(root, ["run", "akan"]);
    try {
      const cliManifest = createRequire(path.join(root, "package.json")).resolve("@akanjs/cli/package.json");
      if (!isInside(root, cliManifest)) return null;
      const cli = readJson(cliManifest);
      const bin = isRecord(cli) && isRecord(cli.bin) ? cli.bin.akan : null;
      return typeof bin === "string" ? new AkanCli(root, [path.join(path.dirname(cliManifest), bin)]) : null;
    } catch {
      return null;
    }
  }

  static systemsOf(root: string, kinds: ("apps" | "libs")[] = ["apps", "libs"]) {
    return kinds.flatMap((kind) => {
      const dir = path.join(root, kind);
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, "akan.config.ts")))
        .map((entry) => entry.name)
        .sort();
    });
  }

  static placeOf(root: string, fileName: string) {
    const [kind, system, layer, module] = path.relative(root, fileName).split(path.sep);
    if ((kind !== "apps" && kind !== "libs") || !system) return { system: null, module: null };
    return { system, module: layer === "lib" && module && !module.includes(".") ? module : null };
  }

  static argsOf(inputs: Record<string, string | boolean>) {
    return Object.entries(inputs).flatMap(([name, value]) => {
      if (value === false || value === "") return [];
      return value === true ? [`--${kebabOf(name)}`] : [`--${kebabOf(name)}`, value];
    });
  }

  static shellArgOf(arg: string) {
    return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
  }

  //? stdout can carry build or sync lines before the report, so the report starts at the first line that parses.
  static jsonOf(stdout: string): unknown {
    const lines = stdout.split("\n");
    for (const [at, line] of lines.entries()) {
      if (!line.startsWith("{")) continue;
      try {
        return JSON.parse(lines.slice(at).join("\n"));
      } catch {}
    }
    return null;
  }

  get command() {
    return ["bun", ...this.#prefix];
  }

  run(args: string[], signal?: AbortSignal) {
    return new Promise<AkanRun>((resolve, reject) => {
      const child = spawn("bun", [...this.#prefix, ...args], {
        cwd: this.root,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  }
}
