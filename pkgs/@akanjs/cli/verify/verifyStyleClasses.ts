import { existsSync } from "node:fs";
import path from "node:path";
import type { BiomeDiagnostic } from "@akanjs/devkit/lint/linter";

export class VerifyStyleClasses {
  static readonly #message = "daisyUI legacy class";
  static readonly #grit = "node_modules/@akanjs/devkit/lint/no-daisyui-legacy-class.grit";
  static readonly #comment = /\/\*[\s\S]*?\*\//g;
  static readonly #classSelector = /\.((?:\\.|[\w-])+)/g;
  static readonly #utility = /@utility\s+([\w-]+)/g;
  static readonly #tokenSeparator = /[\s"'`{}()[\],]+/;

  //? The pattern is read from the plugin Biome ran, so what this drops cannot drift from what the rule matched.
  static legacyPatternOf(gritSource: string): RegExp | null {
    const at = gritSource.indexOf(`message = "${VerifyStyleClasses.#message}`);
    const open = at === -1 ? -1 : gritSource.lastIndexOf('r"', at);
    if (open === -1) return null;
    let close = open + 2;
    while (close < at && !(gritSource[close] === '"' && gritSource[close - 1] !== "\\")) close += 1;
    if (close >= at) return null;
    try {
      return new RegExp(gritSource.slice(open + 2, close));
    } catch {
      return null;
    }
  }

  static classesDefinedIn(css: string): Set<string> {
    const text = css.replace(VerifyStyleClasses.#comment, "");
    const names = new Set<string>();
    for (const [, name] of text.matchAll(VerifyStyleClasses.#classSelector))
      if (name) names.add(name.replaceAll("\\", ""));
    for (const [, name] of text.matchAll(VerifyStyleClasses.#utility)) if (name) names.add(name);
    return names;
  }

  //? A warning only: the colour-slot error stays, as the commit hook's Biome run reports it whatever the CSS says.
  static async dropDefined(root: string, diagnostics: BiomeDiagnostic[], cssDirs: string[]) {
    const flagged = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning" && diagnostic.message.startsWith(VerifyStyleClasses.#message),
    );
    if (!flagged.length || !existsSync(path.join(root, VerifyStyleClasses.#grit))) return diagnostics;
    const pattern = VerifyStyleClasses.legacyPatternOf(
      await Bun.file(path.join(root, VerifyStyleClasses.#grit)).text(),
    );
    if (!pattern) return diagnostics;
    const defined = await VerifyStyleClasses.#definedClasses(root, cssDirs);
    if (!defined.size) return diagnostics;
    const sources = new Map<string, string[]>();
    const dropped = new Set<BiomeDiagnostic>();
    for (const diagnostic of flagged) {
      const file = diagnostic.location?.path;
      const { start, end } = diagnostic.location ?? {};
      if (!file || !start?.line || !end?.line) continue;
      const absolute = path.resolve(root, file);
      if (!sources.has(absolute))
        sources.set(absolute, existsSync(absolute) ? (await Bun.file(absolute).text()).split("\n") : []);
      const span = VerifyStyleClasses.#linesOf(sources.get(absolute) ?? [], start.line, end.line);
      const legacy = span.split(VerifyStyleClasses.#tokenSeparator).filter((token) => token && pattern.test(token));
      if (legacy.length && legacy.every((token) => defined.has(VerifyStyleClasses.#classNameOf(token))))
        dropped.add(diagnostic);
    }
    return dropped.size ? diagnostics.filter((diagnostic) => !dropped.has(diagnostic)) : diagnostics;
  }

  static #classNameOf(token: string) {
    return token.replace(/^.*:/, "").replace(/^!|!$/g, "").replace(/\/.*$/, "");
  }

  //? Whole lines: Biome's columns count code points, a JS string slices UTF-16 units; a wider span only keeps more.
  static #linesOf(lines: string[], start: number, end: number) {
    return lines.slice(start - 1, end).join("\n");
  }

  static async #definedClasses(root: string, dirs: string[]): Promise<Set<string>> {
    const names = new Set<string>();
    for (const dir of new Set(dirs)) {
      const cwd = path.join(root, dir);
      if (!existsSync(cwd)) continue;
      for await (const file of new Bun.Glob("**/*.css").scan({ cwd })) {
        if (file.split(/[\\/]/).includes("node_modules")) continue;
        for (const name of VerifyStyleClasses.classesDefinedIn(await Bun.file(path.join(cwd, file)).text()))
          names.add(name);
      }
    }
    return names;
  }
}
