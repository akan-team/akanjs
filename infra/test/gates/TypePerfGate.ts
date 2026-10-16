import path from "node:path";
import type { Gate, GateRow, Measurements } from "./gate";

/**
 * How much work the type checker does on a fixed app: instantiations and types, read off `tsc --extendedDiagnostics`.
 * Both are deterministic for a given tree, unlike the check time, which is reported and never gated. The fetch and
 * store types are deep inference, so this is the number an editor's responsiveness follows.
 */
export class TypePerfGate implements Gate {
  readonly name = "type-perf";
  readonly recordsBaseline = true;
  static readonly #tolerance = 1.05;
  readonly #root: string;
  readonly #app: string;

  constructor(root: string, app = "minimal") {
    this.#root = root;
    this.#app = app;
  }

  // The entries `akan typecheck` checks, from the same folder, so the relative includes resolve the same way.
  async #writeTsconfig() {
    const typecheckDir = path.join(this.#root, "apps", this.#app, ".akan", "typecheck");
    const tsconfigPath = path.join(typecheckDir, "tsconfig.gate.json");
    const tsconfig = {
      extends: "../../tsconfig.json",
      compilerOptions: { noEmit: true, incremental: false },
      include: [
        "../../main.ts",
        "../../server.ts",
        "../../client.ts",
        "../../page/**/*.ts",
        "../../page/**/*.tsx",
        "../../../../pkgs/akanjs/*/types/**/*.d.ts",
      ],
      references: [],
    };
    await Bun.write(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
    return tsconfigPath;
  }

  async measure(): Promise<Measurements> {
    const tsconfigPath = await this.#writeTsconfig();
    const proc = Bun.spawn(["bunx", "tsc", "-p", tsconfigPath, "--extendedDiagnostics"], {
      cwd: this.#root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const read = (label: string) => {
      const match = new RegExp(`^${label}:\\s+([\\d.]+)`, "m").exec(stdout);
      if (!match) throw new Error(`tsc printed no "${label}" (exit ${exitCode}):\n${stdout}${stderr}`);
      return Number(match[1]);
    };
    if (exitCode !== 0) throw new Error(`tsc reported errors for ${this.#app}:\n${stdout.split("\nFiles:")[0]}`);
    return {
      instantiations: read("Instantiations"),
      types: read("Types"),
      checkMs: Math.round(read("Check time") * 1000),
    };
  }

  check(measured: Measurements, baseline: Measurements | undefined): GateRow[] {
    const gated = (metric: "instantiations" | "types"): GateRow => {
      const recorded = baseline?.[metric] ?? null;
      return {
        metric,
        value: measured[metric] ?? 0,
        baseline: recorded,
        limit: recorded === null ? null : Math.floor(recorded * TypePerfGate.#tolerance),
        unit: "count",
      };
    };
    return [
      gated("instantiations"),
      gated("types"),
      {
        metric: "check time",
        value: measured.checkMs,
        baseline: baseline?.checkMs ?? null,
        limit: null,
        unit: "ms",
      },
    ];
  }
}
