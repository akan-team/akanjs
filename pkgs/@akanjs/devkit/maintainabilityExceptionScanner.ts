import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { type BaselineEntry, MaintainabilityBaseline } from "./maintainabilityBaseline";
import type { DebtRuleId } from "./maintainabilityContract";
import type { QualityWarning } from "./qualityScanner";

export class MaintainabilityExceptionScanner {
  static readonly rule = "akan.baseline.exceptions";
  static readonly #shapeFix =
    "Many reasoned exceptions under one rule mean its threshold is wrong: fix the limit in MaintainabilityLimits rather than record another. Otherwise shrink the code, and `akan lint` lowers each entry and drops it once it passes.";
  static readonly #correctnessFix =
    "A write rule takes no exception: send the writes through one store action and one endpoint (`akan workflow plan add-mutation`), and `akan lint` drops the entry.";

  async scan(workspaceRoot: string): Promise<QualityWarning[]> {
    const sysPaths = await Promise.all(
      ["apps", "libs", "pkgs"].map((sysRoot) => MaintainabilityExceptionScanner.#dirsIn(workspaceRoot, sysRoot)),
    );
    const warnings = await Promise.all(
      sysPaths.flat().map((sysPath) => MaintainabilityExceptionScanner.#scanSys(workspaceRoot, sysPath)),
    );
    return warnings.flat();
  }

  static async #dirsIn(workspaceRoot: string, root: string): Promise<string[]> {
    const absoluteRoot = path.join(workspaceRoot, root);
    if (!existsSync(absoluteRoot)) return [];
    const entries = await readdir(absoluteRoot, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => `${root}/${entry.name}`);
    const nested = await Promise.all(
      dirs.map(async (dir) =>
        root === "pkgs" && path.posix.basename(dir).startsWith("@")
          ? await MaintainabilityExceptionScanner.#dirsIn(workspaceRoot, dir)
          : [dir],
      ),
    );
    return nested.flat();
  }

  static async #scanSys(workspaceRoot: string, sysPath: string): Promise<QualityWarning[]> {
    const file = `${sysPath}/${MaintainabilityBaseline.fileName}`;
    const absolutePath = path.join(workspaceRoot, file);
    if (!existsSync(absolutePath)) return [];
    const text = await readFile(absolutePath, "utf8");
    let baseline: MaintainabilityBaseline;
    try {
      baseline = MaintainabilityBaseline.parse(text, file);
    } catch {
      //? `akan lint` names a malformed baseline and how it breaks; the scan reports only the ones it can read.
      return [];
    }
    const lines = text.split(/\r?\n/);
    return [...baseline.entriesByRule()].map(([rule, entries]) =>
      MaintainabilityExceptionScanner.#warningOf(sysPath, file, lines, rule, entries),
    );
  }

  static #warningOf(
    sysPath: string,
    file: string,
    lines: string[],
    rule: DebtRuleId,
    entries: BaselineEntry[],
  ): QualityWarning {
    const reasonedNum = entries.filter(({ reason }) => reason !== undefined).length;
    const adoptedNum = entries.length - reasonedNum;
    const listed = entries.map(({ key, reason }) =>
      reason === undefined ? key : `${key} (${JSON.stringify(reason)})`,
    );
    const locations = entries.map(({ key }) => ({
      file,
      line: MaintainabilityExceptionScanner.#lineOf(lines, rule, key),
    }));
    return {
      rule: MaintainabilityExceptionScanner.rule,
      scope: "file",
      severity: "warning",
      file,
      line: locations[0]?.line ?? 1,
      message: `${sysPath} carries ${reasonedNum} reasoned exception${reasonedNum === 1 ? "" : "s"} and ${adoptedNum} adopted-debt entr${adoptedNum === 1 ? "y" : "ies"} for ${rule}: ${listed.join(", ")}.`,
      locations,
      fix: MaintainabilityBaseline.reasonedRules.has(rule)
        ? MaintainabilityExceptionScanner.#shapeFix
        : MaintainabilityExceptionScanner.#correctnessFix,
    };
  }

  static #lineOf(lines: string[], rule: DebtRuleId, key: string) {
    const from = Math.max(
      lines.findIndex((line) => line.includes(`${JSON.stringify(rule)}:`)),
      0,
    );
    return Math.max(lines.findIndex((line, idx) => idx >= from && line.includes(`${JSON.stringify(key)}:`)) + 1, 1);
  }
}
