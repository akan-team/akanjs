import { rm } from "node:fs/promises";
import path from "node:path";
import { ApiReport } from "@akanjs/devkit/apiReport/apiReport";
import { type ApiBreak, ApiReportDiff } from "@akanjs/devkit/apiReport/apiReportDiff";
import { ApiReportPolicy } from "@akanjs/devkit/apiReport/apiReportPolicy";

/**
 * The public API of the akanjs package, one report per entry point under api-report/akanjs.
 *
 *   bun run api:report                  rewrite the reports from the source
 *   bun run api:report --check          exit 1 when the committed reports differ from what the source declares
 *   bun run api:report --base <ref>     exit 1 when an export was removed or changed since <ref> and no changeset
 *                                       added since then bumps akanjs by minor or major
 */
class ApiReportRun {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #packageName = "akanjs";
  static readonly #policy = new ApiReportPolicy(
    ApiReportRun.#root,
    path.join("api-report", ApiReportRun.#packageName),
    ApiReportRun.#packageName,
  );
  static readonly #rule =
    "A removed export or a changed declaration needs a changeset that bumps akanjs by `minor` and says how to upgrade (pkgs/akanjs/CONTRIBUTING.md).";

  async run(args: string[]) {
    const baseIdx = args.indexOf("--base");
    if (baseIdx >= 0) return await this.#checkPolicy(args[baseIdx + 1]);
    const startedAt = performance.now();
    const generated = await ApiReport.generate(path.join(ApiReportRun.#root, "pkgs", ApiReportRun.#packageName));
    const committed = await ApiReportRun.#policy.readReports();
    const drift = ApiReportDiff.drift(committed, generated);
    const elapsed = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
    const reportDir = ApiReportRun.#policy.reportDir;
    if (args.includes("--check")) {
      if (!ApiReportDiff.hasDrift(drift)) {
        console.info(`[api-report] ${generated.size} reports match the source (${elapsed})`);
        return 0;
      }
      for (const file of [...drift.changed, ...drift.added, ...drift.removed])
        console.info(`[api-report] differs: ${reportDir}/${file}`);
      ApiReportRun.#printBreaks(ApiReportDiff.breaks(committed, generated), ApiReportRun.#rule);
      console.info("[api-report] Run `bun run api:report` and commit the result.");
      return 1;
    }
    for (const file of drift.removed) await rm(path.join(ApiReportRun.#root, reportDir, file));
    for (const file of [...drift.changed, ...drift.added])
      await Bun.write(path.join(ApiReportRun.#root, reportDir, file), generated.get(file) ?? "");
    const written = drift.changed.length + drift.added.length + drift.removed.length;
    console.info(`[api-report] ${generated.size} reports, ${written} rewritten (${elapsed})`);
    ApiReportRun.#printBreaks(ApiReportDiff.breaks(committed, generated), ApiReportRun.#rule);
    return 0;
  }

  async #checkPolicy(base: string | undefined) {
    if (!base) {
      console.info("[api-report] --base takes a git ref, such as origin/main.");
      return 1;
    }
    const verdict = await ApiReportRun.#policy.check(base);
    if (!verdict) {
      console.info(`[api-report] ${base} names no commit with a merge base here; fetch it first.`);
      return 1;
    }
    if (!verdict.breaks.length) {
      console.info(`[api-report] no export removed or changed since ${base}`);
      return 0;
    }
    ApiReportRun.#printBreaks(
      verdict.breaks,
      verdict.bumped ? "A changeset added on this branch bumps akanjs by minor or major." : ApiReportRun.#rule,
    );
    return verdict.bumped ? 0 : 1;
  }

  static #printBreaks(breaks: ApiBreak[], note: string) {
    if (!breaks.length) return;
    for (const { report, name, kind, before, after } of breaks) {
      console.info(`[api-report] ${kind}: ${name} (${report})`);
      if (before !== undefined && after !== undefined)
        console.info([ApiReportRun.#indent(before, "  - "), ApiReportRun.#indent(after, "  + ")].join("\n"));
    }
    console.info(`[api-report] ${note}`);
  }

  static #indent(block: string, prefix: string) {
    return block
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
  }
}

process.exit(await new ApiReportRun().run(process.argv.slice(2)));
