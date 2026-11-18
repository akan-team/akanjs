import { CliError } from "../commandDecorators/cliError";
import { type BiomeDiagnostic, Linter, parseBiomeReport } from "./linter";
import { WithheldEnvFile } from "./withheldEnvFile";

export interface BiomeCheckOptions {
  root: string;
  targets: string[];
  configPath: string | null;
  write: boolean;
  //? 0 shows every diagnostic.
  maxDiagnostics: number;
  print: (text: string) => void;
}

//* Biome's own report quotes source lines, so a first run writes the fixes and reads the JSON report. An env file's
//* diagnostics are printed from it by position and rule alone; Biome prints the rest again, from the files that have any.
export class BiomeCheck {
  static readonly #groupSize = 100;
  static readonly #summary = /^(?:Checked \d+ files? in |Found \d+ (?:errors?|warnings?|info))/;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: an ANSI colour sequence starts with the escape character
  static readonly #colour = /\u001b\[[0-9;]*m/g;

  static async run({ root, targets, configPath, write, maxDiagnostics, print }: BiomeCheckOptions) {
    const [biome, ...biomeArgs] = Linter.biomeCommand(root);
    //? Pinned: without it a malformed biome.json makes Biome fall back to discovery and name the wrong file.
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
        ...targets,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(first.stdout).text(),
      new Response(first.stderr).text(),
      first.exited,
    ]);
    let diagnostics: BiomeDiagnostic[];
    try {
      diagnostics = parseBiomeReport(stdout).diagnostics ?? [];
    } catch {
      const cause = (stderr || stdout).trim();
      throw new CliError(
        "failed",
        cause && !WithheldEnvFile.namesEnvFile(cause)
          ? cause
          : `Biome exited with ${exitCode} and gave no report that could be read.`,
      );
    }
    const shown = diagnostics.filter(({ severity }) => severity !== "hint");
    const inEnv = (diagnostic: BiomeDiagnostic) =>
      WithheldEnvFile.isEnvFile(diagnostic.location?.path?.replaceAll("\\", "/"));
    const fromEnv = shown.filter(inEnv);
    const rest = shown.filter((diagnostic) => !inEnv(diagnostic));
    let remaining = maxDiagnostics > 0 ? maxDiagnostics : Number.POSITIVE_INFINITY;
    for (const diagnostic of fromEnv.slice(0, remaining)) print(BiomeCheck.#line(diagnostic));
    let hidden = Math.max(0, fromEnv.length - remaining);
    remaining -= Math.min(fromEnv.length, remaining);
    for (const group of BiomeCheck.#groups(rest)) {
      if (remaining <= 0) {
        hidden += group.count;
        continue;
      }
      const second = Bun.spawn(
        [
          biome,
          ...biomeArgs,
          "check",
          //? Biome shows 20 diagnostics unless told otherwise.
          `--max-diagnostics=${Number.isFinite(remaining) ? remaining : "none"}`,
          ...(process.stdout.isTTY && !process.env.NO_COLOR ? ["--colors=force"] : []),
          ...config,
          ...group.files,
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const [out, err] = await Promise.all([
        new Response(second.stdout).text(),
        new Response(second.stderr).text(),
        second.exited,
      ]);
      print(BiomeCheck.withoutSummary(`${out}${err}`));
      remaining -= Math.min(group.count, remaining);
    }
    for (const diagnostic of rest.filter(({ location }) => !location?.path)) print(diagnostic.message);
    if (hidden) print(`${hidden} more diagnostics are not shown; --max-diagnostics 0 shows them all.`);
    const count = (severity: string) => shown.filter((diagnostic) => diagnostic.severity === severity).length;
    for (const [severity, noun] of [
      ["error", "error"],
      ["warning", "warning"],
      ["information", "info"],
    ] as const)
      if (count(severity))
        print(`Found ${count(severity)} ${noun}${count(severity) === 1 || noun === "info" ? "" : "s"}.`);
    const errors = count("error");
    if (errors) throw new CliError("checkFailed", `Lint found ${errors} error${errors === 1 ? "" : "s"}.`);
  }

  //? Each group's summary counts only its own files; the one printed at the end counts the whole run.
  static withoutSummary(text: string) {
    return text
      .split("\n")
      .filter((line) => !BiomeCheck.#summary.test(line.replace(BiomeCheck.#colour, "")))
      .join("\n")
      .trim();
  }

  static #groups(diagnostics: BiomeDiagnostic[]) {
    const counts = new Map<string, number>();
    for (const { location } of diagnostics)
      if (location?.path) counts.set(location.path, (counts.get(location.path) ?? 0) + 1);
    const entries = [...counts];
    return Array.from({ length: Math.ceil(entries.length / BiomeCheck.#groupSize) }, (_, index) => {
      const slice = entries.slice(index * BiomeCheck.#groupSize, (index + 1) * BiomeCheck.#groupSize);
      return { files: slice.map(([file]) => file), count: slice.reduce((sum, [, count]) => sum + count, 0) };
    });
  }

  static #line({ severity, category, location }: BiomeDiagnostic) {
    const at = `${location?.path}:${location?.start?.line ?? 0}:${location?.start?.column ?? 0}`;
    return `${at} ${severity} ${category ?? "biome"} - ${WithheldEnvFile.note}`;
  }
}
