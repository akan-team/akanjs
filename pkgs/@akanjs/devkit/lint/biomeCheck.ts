import { CliError } from "../commandDecorators/cliError";
import { type BiomeDiagnostic, Linter, parseBiomeReport } from "./linter";
import { WithheldEnvFile } from "./withheldEnvFile";

export interface BiomeCheckOptions {
  root: string;
  target: string;
  configPath: string | null;
  write: boolean;
  /** `0` shows every diagnostic. */
  maxDiagnostics: number;
  print: (text: string) => void;
}

//* Biome's own report quotes source lines, so a first run writes the fixes and reads the JSON report. An env file's
//* diagnostics are printed from it by position and rule alone; Biome prints the rest again, from the files that have any.
export class BiomeCheck {
  static async run({ root, target, configPath, write, maxDiagnostics, print }: BiomeCheckOptions) {
    const [biome, ...biomeArgs] = Linter.biomeCommand(root);
    const config = configPath ? ["--config-path", configPath] : [];
    const first = Bun.spawn(
      [
        biome,
        ...biomeArgs,
        "check",
        ...(write ? ["--write"] : []),
        "--reporter=json",
        "--max-diagnostics=none",
        "--no-errors-on-unmatched",
        ...config,
        target,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, exitCode] = await Promise.all([new Response(first.stdout).text(), first.exited]);
    let diagnostics: BiomeDiagnostic[];
    try {
      diagnostics = parseBiomeReport(stdout).diagnostics ?? [];
    } catch {
      throw new CliError("failed", `Biome exited with ${exitCode} and gave no report that could be read.`);
    }
    const shown = diagnostics.filter(({ severity }) => severity !== "hint");
    const [fromEnv, rest] = [
      shown.filter(({ location }) => WithheldEnvFile.isEnvFile(location?.path?.replaceAll("\\", "/"))),
      shown.filter(({ location }) => !WithheldEnvFile.isEnvFile(location?.path?.replaceAll("\\", "/"))),
    ];
    const limit = maxDiagnostics > 0 ? maxDiagnostics : Number.POSITIVE_INFINITY;
    for (const diagnostic of fromEnv.slice(0, limit)) print(BiomeCheck.#line(diagnostic));
    const hidden = Math.max(0, fromEnv.length - limit);
    if (hidden) print(`${hidden} more diagnostics in env files are not shown; --max-diagnostics 0 shows them all.`);
    const remaining = limit - Math.min(fromEnv.length, limit);
    const files = [...new Set(rest.flatMap(({ location }) => (location?.path ? [location.path] : [])))];
    if (files.length && remaining > 0) {
      const second = Bun.spawn(
        [
          biome,
          ...biomeArgs,
          "check",
          `--max-diagnostics=${Number.isFinite(remaining) ? remaining : "none"}`,
          ...config,
          ...files,
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const [out, err] = await Promise.all([new Response(second.stdout).text(), new Response(second.stderr).text()]);
      await second.exited;
      print(`${out}${err}`.trimEnd());
    }
    for (const diagnostic of rest.filter(({ location }) => !location?.path)) print(diagnostic.message);
    const errors = shown.filter(({ severity }) => severity === "error").length;
    if (errors) throw new CliError("checkFailed", `Lint found ${errors} error${errors === 1 ? "" : "s"}.`);
  }

  static #line({ severity, category, location }: BiomeDiagnostic) {
    const at = `${location?.path}:${location?.start?.line ?? 0}:${location?.start?.column ?? 0}`;
    return `${at} ${severity} ${category ?? "biome"} - ${WithheldEnvFile.note}`;
  }
}
