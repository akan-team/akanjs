import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { ComponentSizeScanner } from "./componentSizeScanner";
import { ComponentWriteChainScanner } from "./componentWriteChainScanner";
import { EndpointReach } from "./endpointReach";
import { MaintainabilityBaseline } from "./maintainabilityBaseline";
import { MaintainabilityLimits } from "./maintainabilityLimits";
import { MaintainabilityReport } from "./maintainabilityReport";
import type { SourceFileInfo } from "./qualityScanner";
import { ServiceLoopCallScanner } from "./serviceLoopCallScanner";
import { SignalMutationIndex } from "./signalMutationIndex";
import { StoreAccessScanner } from "./storeAccessScanner";
import { StoreWriteScanner } from "./storeWriteScanner";
import { WritePlacementScanner } from "./writePlacementScanner";
import { WritingActionIndex } from "./writingActionIndex";

export interface MaintainabilityScope {
  type: "app" | "lib";
  name: string;
}

export type MaintainabilityRuleId = (typeof MaintainabilityContract.ruleIds)[number];
export type DebtRuleId = Exclude<MaintainabilityRuleId, "akan.baseline.growth">;
export type MaintainabilityCommands = { [rule in MaintainabilityRuleId]?: readonly string[] };

export interface SizeViolation {
  kind: "size";
  rule: "akan.size.file" | "akan.size.component";
  key: string;
  file: string;
  line: number;
  lineCount: number;
  maxLines: number;
  component?: string;
  recorded?: number;
}

export interface MultiWriteViolation {
  kind: "multiWrite";
  rule: "akan.store.multi-write" | "akan.store.root-write-chain" | "akan.component.write-chain";
  key: string;
  file: string;
  line: number;
  owner: string;
  writes: string[];
  writeCount: number;
  recorded?: number;
}

export interface WritePlacementViolation {
  kind: "writePlacement";
  rule: "akan.write.placement";
  key: string;
  file: string;
  line: number;
  writes: string[];
  recorded?: number;
}

export interface LoopCallViolation {
  kind: "loopCall";
  rule: "akan.service.call-in-loop";
  key: string;
  file: string;
  line: number;
  owner: string;
  calls: string[];
  recorded?: number;
}

export interface StoreAccessViolation {
  kind: "storeAccess";
  rule: "akan.component.store-access";
  key: string;
  file: string;
  line: number;
  component: string;
  accessCount: number;
  maxAccesses: number;
  recorded?: number;
}

export interface BaselineGrowth {
  kind: "baselineGrowth";
  rule: "akan.baseline.growth";
  key: string;
  file: string;
  line: number;
  debtRule: DebtRuleId;
  count: number;
  committed?: number;
  reference: string;
}

export type MaintainabilityViolation =
  | SizeViolation
  | MultiWriteViolation
  | StoreAccessViolation
  | WritePlacementViolation
  | LoopCallViolation;
export type MaintainabilityFailure = MaintainabilityViolation | BaselineGrowth;

export type BaselineSeed = "written" | "kept" | "removed" | "clean";

export class MaintainabilityContract {
  static readonly ruleIds = [
    "akan.size.file",
    "akan.size.component",
    "akan.store.multi-write",
    "akan.store.root-write-chain",
    "akan.component.write-chain",
    "akan.component.store-access",
    "akan.write.placement",
    "akan.service.call-in-loop",
    "akan.baseline.growth",
  ] as const;
  static readonly #measuredFiles = "{lib,ui,webkit,srvkit,common,plugin}/**/*.{ts,tsx,md}";
  static readonly #defaultBranches = ["upstream/HEAD", "upstream/main", "origin/HEAD", "origin/main", "main", "master"];
  readonly #workspaceRoot: string;
  readonly #scope: MaintainabilityScope;
  readonly #libNames: string[];

  constructor(workspaceRoot: string, scope: MaintainabilityScope, libNames: string[] = []) {
    this.#workspaceRoot = workspaceRoot;
    this.#scope = scope;
    this.#libNames = libNames.filter((libName) => scope.type === "app" || libName !== scope.name);
  }

  get sysPath() {
    return `${this.#scope.type}s/${this.#scope.name}`;
  }

  get baselinePath() {
    return path.join(this.#workspaceRoot, this.sysPath, MaintainabilityBaseline.fileName);
  }

  async measure(): Promise<MaintainabilityViolation[]> {
    const [signalFiles, storeFiles, serviceFiles] = await Promise.all([
      this.#reachedSources("lib/**/*.signal.ts"),
      this.#reachedSources("lib/**/*.store.ts"),
      this.#reachedSources("lib/**/*.service.ts"),
    ]);
    const index = new WritingActionIndex(new SignalMutationIndex(signalFiles), storeFiles);
    const reach = new EndpointReach(signalFiles, serviceFiles);
    const files = await MaintainabilityContract.#filesUnder(
      path.join(this.#workspaceRoot, this.sysPath),
      MaintainabilityContract.#measuredFiles,
    );
    const violations = await Promise.all(files.map((file) => this.#measureFile(file, index, reach)));
    return violations.flat().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  }

  async enforce({ fix }: { fix: boolean }): Promise<MaintainabilityFailure[]> {
    const [violations, existing, reference] = await Promise.all([
      this.measure(),
      this.#readBaseline(),
      this.#readReferenceBaseline(),
    ]);
    const baseline =
      existing === null ? new MaintainabilityBaseline() : MaintainabilityBaseline.parse(existing, this.baselinePath);
    const tightened = baseline.tightenedBy(violations);
    if (fix && existing !== null) await this.#tighten(baseline, tightened);
    const failures: MaintainabilityFailure[] = violations
      .filter((violation) => !baseline.allows(violation))
      .map((violation) => {
        const recorded = baseline.recordedOf(violation);
        return recorded === undefined ? violation : { ...violation, recorded };
      });
    if (reference === null) return failures;
    const lines = ((await this.#readBaseline()) ?? "").split(/\r?\n/);
    const label = `${reference.ref}:${this.sysPath}/${MaintainabilityBaseline.fileName}`;
    const growths = tightened
      .grownFrom(MaintainabilityBaseline.parse(reference.text, label))
      .map(
        ({ rule, ...growth }): BaselineGrowth => ({
          kind: "baselineGrowth",
          rule: "akan.baseline.growth",
          file: MaintainabilityBaseline.fileName,
          line: MaintainabilityContract.#lineOf(lines, rule, growth.key),
          debtRule: rule,
          reference: reference.ref,
          ...growth,
        }),
      )
      .sort((a, b) => a.line - b.line);
    return [...growths, ...failures];
  }

  async seed({ force = false }: { force?: boolean } = {}): Promise<{
    result: BaselineSeed;
    violations: MaintainabilityViolation[];
  }> {
    const violations = await this.measure();
    const exists = existsSync(this.baselinePath);
    if (exists && !force) return { result: "kept", violations };
    const next = MaintainabilityBaseline.of(violations);
    if (!next.isEmpty) await writeFile(this.baselinePath, next.stringify());
    else if (exists) await rm(this.baselinePath, { force: true });
    return { result: next.isEmpty ? (exists ? "removed" : "clean") : "written", violations };
  }

  describe(failures: MaintainabilityFailure[], commands?: MaintainabilityCommands) {
    return MaintainabilityReport.describe(this.sysPath, failures, commands);
  }

  async #measureFile(
    file: string,
    index: WritingActionIndex,
    reach: EndpointReach,
  ): Promise<MaintainabilityViolation[]> {
    const maxLines = MaintainabilityLimits.fileMaxLinesOf(file);
    const isStore = file.endsWith(".store.ts");
    const isService = file.endsWith(".service.ts");
    const isClientCode = MaintainabilityLimits.isClientCode(file);
    if (!maxLines && !isStore && !isClientCode) return [];
    const workspaceFile = `${this.sysPath}/${file}`;
    const content = await readFile(path.join(this.#workspaceRoot, workspaceFile), "utf8");
    const violations: MaintainabilityViolation[] = [];
    const lineCount = MaintainabilityLimits.lineCountOf(content);
    if (maxLines && lineCount > maxLines && !MaintainabilityLimits.isReexportBarrel(file, content))
      violations.push({ kind: "size", rule: "akan.size.file", key: file, file, line: 1, lineCount, maxLines });
    if (!isStore && !isService && !isClientCode) return violations;
    const source = this.#sourceOf(workspaceFile, content);
    if (isClientCode) violations.push(...MaintainabilityContract.#measureClientCode(file, source, index));
    if (isStore)
      for (const { action, line, writes, writeCount, isRootChain } of new StoreWriteScanner(index).scan(source))
        violations.push({
          kind: "multiWrite",
          rule: isRootChain ? "akan.store.root-write-chain" : "akan.store.multi-write",
          key: `${file}#${action}`,
          file,
          line,
          owner: action,
          writes,
          writeCount,
        });
    if (isService)
      for (const { method, line, calls } of new ServiceLoopCallScanner().scan(source.sourceFile, (method) =>
        reach.reaches(EndpointReach.serviceOf(file), method),
      ))
        violations.push({
          kind: "loopCall",
          rule: "akan.service.call-in-loop",
          key: `${file}#${method}`,
          file,
          line,
          owner: method,
          calls,
        });
    return violations;
  }

  static #measureClientCode(
    file: string,
    { file: workspaceFile, sourceFile }: SourceFileInfo,
    index: WritingActionIndex,
  ) {
    const violations: MaintainabilityViolation[] = [];
    const placement = new WritePlacementScanner(index).scan(file, workspaceFile, sourceFile);
    if (placement)
      violations.push({ kind: "writePlacement", rule: "akan.write.placement", key: file, file, ...placement });
    for (const component of new ComponentSizeScanner().measure(sourceFile))
      if (component.lineCount > MaintainabilityLimits.componentMaxLines)
        violations.push({
          kind: "size",
          rule: "akan.size.component",
          key: `${file}#${component.name}`,
          file,
          line: component.line,
          lineCount: component.lineCount,
          maxLines: MaintainabilityLimits.componentMaxLines,
          component: component.name,
        });
    for (const { component, line, writes, writeCount } of new ComponentWriteChainScanner(index).scan(sourceFile))
      violations.push({
        kind: "multiWrite",
        rule: "akan.component.write-chain",
        key: `${file}#${component}`,
        file,
        line,
        owner: component,
        writes,
        writeCount,
      });
    for (const { component, line, accessCount } of new StoreAccessScanner(index).measure(sourceFile))
      if (accessCount > MaintainabilityLimits.componentMaxStoreAccesses)
        violations.push({
          kind: "storeAccess",
          rule: "akan.component.store-access",
          key: `${file}#${component}`,
          file,
          line,
          component,
          accessCount,
          maxAccesses: MaintainabilityLimits.componentMaxStoreAccesses,
        });
    return violations;
  }

  async #reachedSources(pattern: string) {
    const roots = [this.sysPath, ...this.#libNames.map((libName) => `libs/${libName}`)];
    const files = await Promise.all(
      roots.map(async (root) =>
        (await MaintainabilityContract.#filesUnder(path.join(this.#workspaceRoot, root), pattern)).map(
          (file) => `${root}/${file}`,
        ),
      ),
    );
    return await Promise.all(
      files
        .flat()
        .map(async (file) => this.#sourceOf(file, await readFile(path.join(this.#workspaceRoot, file), "utf8"))),
    );
  }

  #sourceOf(file: string, content: string): SourceFileInfo {
    const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return {
      file,
      absolutePath: path.join(this.#workspaceRoot, file),
      content,
      sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind),
    };
  }

  async #readBaseline() {
    return existsSync(this.baselinePath) ? await readFile(this.baselinePath, "utf8") : null;
  }

  //? `./` resolves the path from the workspace root, which may sit below the repository root.
  async #readReferenceBaseline() {
    const ref = await this.#referenceRef();
    const text = await this.#git(["show", `${ref}:./${this.sysPath}/${MaintainabilityBaseline.fileName}`]);
    return text === null ? null : { ref: ref === "HEAD" ? ref : ref.slice(0, 12), text };
  }

  //* A branch's own commits cannot be the reference: one that raises an entry would make the raise the new floor.
  //* The fork point from the default branch holds still, whatever the branch commits.
  async #referenceRef() {
    for (const branch of MaintainabilityContract.#defaultBranches) {
      if ((await this.#git(["rev-parse", "--verify", "--quiet", `${branch}^{commit}`])) === null) continue;
      const forkPoint = (await this.#git(["merge-base", "HEAD", branch]))?.trim();
      if (forkPoint) return forkPoint;
    }
    return "HEAD";
  }

  async #git(args: string[]) {
    try {
      const proc = Bun.spawn(["git", ...args], { cwd: this.#workspaceRoot, stdout: "pipe", stderr: "ignore" });
      const [text, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      return exitCode === 0 ? text : null;
    } catch {
      return null;
    }
  }

  async #tighten(current: MaintainabilityBaseline, next: MaintainabilityBaseline) {
    if (next.isEmpty) await rm(this.baselinePath, { force: true });
    else if (next.stringify() !== current.stringify()) await writeFile(this.baselinePath, next.stringify());
  }

  static #lineOf(lines: string[], rule: DebtRuleId, key: string) {
    const from = Math.max(
      lines.findIndex((line) => line.includes(`${JSON.stringify(rule)}:`)),
      0,
    );
    const idx = lines.findIndex((line, lineIdx) => lineIdx >= from && line.includes(`${JSON.stringify(key)}:`));
    return Math.max(idx + 1, 1);
  }

  static async #filesUnder(root: string, pattern: string) {
    if (!existsSync(root)) return [];
    const files = await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true }));
    return files
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => !file.includes("node_modules/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
