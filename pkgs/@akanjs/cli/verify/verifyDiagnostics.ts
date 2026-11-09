import { readFileSync } from "node:fs";
import path from "node:path";
import type { BiomeDiagnostic, BiomeReport } from "@akanjs/devkit/linter";
import type { MaintainabilityReport } from "@akanjs/devkit/maintainabilityReport";
import type { QualityWarning } from "@akanjs/devkit/qualityScanner";
import type { TypecheckRecord } from "@akanjs/devkit/typeChecker";

export type VerifyStepName = "sync" | "lint" | "typecheck" | "build" | "ssr";

export interface VerifyDiagnostic {
  step: VerifyStepName;
  file: string | null;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning";
  message: string;
  fix?: string;
}

type MaintainabilityEntry = ReturnType<typeof MaintainabilityReport.entriesOf>[number];

export class VerifyDiagnostics {
  static fromTypecheck(records: TypecheckRecord[]): VerifyDiagnostic[] {
    return records.map((record) => {
      //? A TS message chain repeats the head in each elaboration; the first line is the one a fix starts from.
      const message = record.message.split("\n")[0] ?? record.message;
      return {
        step: "typecheck",
        file: record.file,
        line: record.line,
        col: record.col,
        code: record.code,
        severity: record.severity,
        ...(VerifyDiagnostics.#dictionaryKeyMiss(message) ?? { message }),
      };
    });
  }

  //? TS cuts the dictionary's key union short (`... 47 more ...`), so the missing key is the only useful part.
  static readonly #dictionaryKeyArg =
    /^(?:Argument of type|Type) '"([\w$-]+)\.([\w$.-]+)"' is not assignable to (?:parameter of )?type '(?:"base\.|ServiceTranslatorKey<"base")/;

  static #dictionaryKeyMiss(message: string): { message: string; fix: string } | null {
    const [, refName, key] = message.match(VerifyDiagnostics.#dictionaryKeyArg) ?? [];
    if (!refName || !key) return null;
    const dictionaryFile = `${refName}.dictionary.ts`;
    if (key.startsWith("error."))
      return {
        message: `"${refName}.${key}" is not an error key of the ${refName} dictionary`,
        fix: `add ${key.slice("error.".length)}: [en, ko] to .error({}) in ${dictionaryFile} (a service module's dictionary must be a serviceDictionary)`,
      };
    return {
      message: `"${refName}.${key}" is not a key of the ${refName} dictionary`,
      fix: `check the spelling, or add ${key}: [en, ko] to .translate({}) in ${dictionaryFile}; one-off text takes l.trans({ en, ko })`,
    };
  }

  static fromBiome(report: BiomeReport, root?: string): VerifyDiagnostic[] {
    return (report.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning")
      .map((diagnostic) => {
        const file = diagnostic.location?.path?.replaceAll("\\", "/") ?? null;
        return {
          step: "lint",
          file,
          line: diagnostic.location?.start?.line ?? 0,
          col: diagnostic.location?.start?.column ?? 0,
          code: diagnostic.category ?? "biome",
          severity: diagnostic.severity === "error" ? "error" : "warning",
          ...(VerifyDiagnostics.#adapterErrorOf(file, diagnostic.message) ??
            VerifyDiagnostics.#deepImportOf(root, file, diagnostic) ?? { message: diagnostic.message }),
        };
      });
  }

  static readonly #deepImport = /^Module files should not import from two or more parent directories/;
  static readonly #deepSpecifier = /["'](\.\.\/\.\.\/[^"']*)["']/g;
  static readonly #layerOf = /^(apps|libs)\/([\w-]+)\/(common|srvkit|webkit|ui)(?:\/|$)/;

  //? The alias rule refuses a path past `@apps/<app>/<layer>`, so the layer's barrel is the one import left.
  static #deepImportOf(root: string | undefined, file: string | null, diagnostic: BiomeDiagnostic) {
    const start = diagnostic.location?.start;
    if (!root || !file || !start || !VerifyDiagnostics.#deepImport.test(diagnostic.message)) return null;
    let line: string;
    try {
      line = readFileSync(path.join(root, file), "utf8").split("\n")[start.line - 1] ?? "";
    } catch {
      return null;
    }
    const specifiers = [...line.matchAll(VerifyDiagnostics.#deepSpecifier)];
    const specifier = (specifiers.find((match) => match.index === start.column - 1) ?? specifiers[0])?.[1];
    if (!specifier) return null;
    const target = path.posix.join(path.posix.dirname(file), specifier);
    const [, kind, name, layer] = target.match(VerifyDiagnostics.#layerOf) ?? [];
    if (!kind || !name || !layer) return null;
    return { message: diagnostic.message, fix: `import from "@${kind}/${name}/${layer}"` };
  }

  static readonly #rawError = /^Do not (throw|construct) a raw `Error`/;
  static readonly #srvkitFile = /^((?:apps|libs)\/([\w-]+))\/srvkit\//;

  //? An adapter belongs to no module, so its keys go in the app's or lib's own service dictionary (`lib/_<name>/`).
  static #adapterErrorOf(file: string | null, message: string): { message: string; fix: string } | null {
    const [, verb] = message.match(VerifyDiagnostics.#rawError) ?? [];
    const [, root, name] = file?.match(VerifyDiagnostics.#srvkitFile) ?? [];
    if (!file || !verb || !root || !name) return null;
    const dict = path.posix.relative(path.posix.dirname(file), `${root}/lib/dict`);
    return {
      message: `Do not ${verb} a raw \`Error\`: an srvkit adapter uses \`Err\` with a key of the ${name} dictionary`,
      fix: `import { Err } from "${dict}"; add <key>: [en, ko] to .error({}) in ${root}/lib/_${name}/${name}.dictionary.ts; ${verb === "throw" ? "throw " : ""}new Err("${name}.error.<key>")`,
    };
  }

  static fromMaintainability(entries: MaintainabilityEntry[]): VerifyDiagnostic[] {
    return entries.map((entry) => ({
      step: "lint",
      file: entry.file,
      line: entry.line,
      col: 0,
      code: entry.rule,
      severity: "error",
      message: entry.problem,
      fix: entry.path ? `${entry.fix} Path: ${entry.path}` : entry.fix,
    }));
  }

  static fromQuality(warnings: QualityWarning[], changedFiles: ReadonlySet<string>): VerifyDiagnostic[] {
    return warnings
      .filter((warning) => warning.file && changedFiles.has(warning.file))
      .map((warning) => ({
        step: "ssr",
        file: warning.file ?? null,
        line: warning.line ?? 0,
        col: 0,
        code: warning.rule,
        severity: "warning",
        message: warning.message,
        ...(warning.fix ? { fix: warning.fix } : {}),
      }));
  }

  static readonly #prefix = /^\[([\w.-]+)\]\s*/;
  static readonly #location = /((?:apps|libs|pkgs)\/[^\s:()`'"]+\.[a-z]+)(?::(\d+)(?::(\d+))?)?/;

  static fromMessage(step: VerifyStepName, message: string, code = `akan.${step}`): VerifyDiagnostic {
    const prefix: RegExpExecArray | null = VerifyDiagnostics.#prefix.exec(message);
    const location: RegExpExecArray | null = VerifyDiagnostics.#location.exec(message);
    return {
      step,
      file: location ? (location[1] ?? null) : null,
      line: Number(location?.[2] ?? 0),
      col: Number(location?.[3] ?? 0),
      code: prefix?.[1] ?? code,
      severity: "error",
      message: message.slice(prefix?.[0].length ?? 0).trim(),
    };
  }
}
