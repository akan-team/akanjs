import { stripVTControlCharacters } from "node:util";

export interface BunTestFailure {
  file: string | null;
  name: string;
}

export class BunTestReport {
  static readonly #fileHeaderPattern = /^(\S+\.(?:test|spec)\.[cm]?[jt]sx?):$/;
  //? After the last file, bun repeats every failure under an "N tests failed:" line — those belong to no header.
  static readonly #relistPattern = /^\d+ tests? failed:$/;
  static readonly #durationSuffix = /\s+\[[\d.]+m?s\]$/;

  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly errors: number;
  readonly files: number;
  readonly hasSummary: boolean;
  readonly failures: BunTestFailure[];
  readonly lastFile: string | null;

  constructor(output: string) {
    const lines = stripVTControlCharacters(output).split(/\r?\n/);
    let currentFile: string | null = null;
    let lastFile: string | null = null;
    let relisted = false;
    const failures = new Map<string, BunTestFailure>();
    for (const line of lines) {
      if (BunTestReport.#relistPattern.test(line)) relisted = true;
      const header = BunTestReport.#fileHeaderPattern.exec(line);
      if (header?.[1] && !relisted) {
        currentFile = header[1].replaceAll("\\", "/");
        lastFile = currentFile;
        continue;
      }
      if (!line.startsWith("(fail) ")) continue;
      const name = line.slice("(fail) ".length).replace(BunTestReport.#durationSuffix, "");
      if (!failures.has(name)) failures.set(name, { file: relisted ? null : currentFile, name });
    }
    const ran = lines.findLast((line) => /^Ran \d+ tests? across \d+ files?/.test(line));
    this.hasSummary = !!ran;
    this.files = ran ? Number(/across (\d+) files?/.exec(ran)?.[1] ?? 0) : 0;
    this.failures = [...failures.values()];
    this.lastFile = lastFile;
    this.pass = ran
      ? BunTestReport.#lastCount(lines, /^\s*(\d+) pass$/)
      : lines.filter((line) => line.startsWith("(pass) ")).length;
    this.fail = ran ? BunTestReport.#lastCount(lines, /^\s*(\d+) fail$/) : this.failures.length;
    this.skip = ran ? BunTestReport.#lastCount(lines, /^\s*(\d+) skip$/) : 0;
    this.errors = ran ? BunTestReport.#lastCount(lines, /^\s*(\d+) errors?$/) : 0;
  }

  get passed() {
    return this.hasSummary && this.fail === 0 && this.errors === 0;
  }

  static #lastCount(lines: string[], pattern: RegExp) {
    for (const line of lines.toReversed()) {
      const count = pattern.exec(line)?.[1];
      if (count) return Number(count);
    }
    return 0;
  }
}
