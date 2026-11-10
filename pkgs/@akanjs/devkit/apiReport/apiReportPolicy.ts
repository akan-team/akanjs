import { readdir } from "node:fs/promises";
import path from "node:path";
import { ApiReport } from "./apiReport";
import { type ApiBreak, ApiReportDiff } from "./apiReportDiff";
import { ChangesetBump } from "./changesetBump";

export interface ApiPolicyVerdict {
  breaks: ApiBreak[];
  bumped: boolean;
}

export class ApiReportPolicy {
  readonly #root: string;
  readonly #reportDir: string;
  readonly #packageName: string;

  constructor(root: string, reportDir: string, packageName: string) {
    this.#root = root;
    this.#reportDir = reportDir;
    this.#packageName = packageName;
  }

  get reportDir() {
    return this.#reportDir;
  }

  async readReports() {
    const dir = path.join(this.#root, this.#reportDir);
    const files = (await readdir(dir).catch(() => [] as string[])).filter((file) => file.endsWith(ApiReport.extension));
    const reports = new Map<string, string>();
    for (const file of files.sort(ApiReport.compare)) reports.set(file, await Bun.file(path.join(dir, file)).text());
    return reports;
  }

  async check(base: string): Promise<ApiPolicyVerdict | null> {
    if ((await this.#git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`])) === null) return null;
    const mergeBase = (await this.#git(["merge-base", base, "HEAD"]))?.trim();
    if (!mergeBase) return null;
    const before = new Map<string, string>();
    const listed = (await this.#git(["ls-tree", "--name-only", `${mergeBase}:${this.#reportDir}`])) ?? "";
    for (const file of listed.split("\n").filter((name) => name.endsWith(ApiReport.extension)))
      before.set(file, (await this.#git(["show", `${mergeBase}:${this.#reportDir}/${file}`])) ?? "");
    const breaks = ApiReportDiff.breaks(before, await this.readReports());
    if (!breaks.length) return { breaks, bumped: false };
    const added = [
      ...((await this.#git(["diff", "--name-only", "--diff-filter=A", mergeBase, "--", ".changeset"])) ?? "").split(
        "\n",
      ),
      ...((await this.#git(["ls-files", "--others", "--exclude-standard", "--", ".changeset"])) ?? "").split("\n"),
    ].filter((file) => file.endsWith(".md") && !file.endsWith("README.md"));
    const bumps = await Promise.all(
      added.map(async (file) =>
        ChangesetBump.of(await Bun.file(path.join(this.#root, file)).text(), this.#packageName),
      ),
    );
    return { breaks, bumped: bumps.some((bump) => ChangesetBump.atLeast(bump, "minor")) };
  }

  async #git(args: string[]) {
    const proc = Bun.spawn(["git", ...args], { cwd: this.#root, stdout: "pipe", stderr: "ignore" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return exitCode === 0 ? stdout : null;
  }
}
