import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { GitRevision } from "../workspace/gitRevision";
import { BareErrorScanner } from "./bareErrorScanner";
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
import { StructureScanner } from "./structureScanner";
import { WritePlacementScanner } from "./writePlacementScanner";
import { WritingActionIndex } from "./writingActionIndex";

export interface MaintainabilityScope {
  type: "app" | "lib" | "pkg";
  name: string;
}

export type MaintainabilityRuleId = (typeof MaintainabilityContract.ruleIds)[number];
export type DebtRuleId = Exclude<MaintainabilityRuleId, "akan.baseline.growth">;
export type MaintainabilityCommands = { [rule in MaintainabilityRuleId]?: readonly string[] };

export interface SizeViolation {
  kind: "size";
  rule: "akan.size.file" | "akan.size.component" | "akan.size.function";
  key: string;
  file: string;
  line: number;
  lineCount: number;
  maxLines: number;
  component?: string;
  function?: string;
  recorded?: number;
}

export interface ClassSizeViolation {
  kind: "classSize";
  rule: "akan.size.class";
  key: string;
  file: string;
  line: number;
  owner: string;
  memberCount: number;
  maxMembers: number;
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

export interface BareErrorViolation {
  kind: "bareError";
  rule: "akan.error.bare-error";
  key: string;
  file: string;
  line: number;
  lines: number[];
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
  measured?: boolean;
}

export interface StaleTotal {
  kind: "staleTotal";
  rule: DebtRuleId;
  key: string;
  file: string;
  line: number;
  count: number;
  recorded: number;
}

export type MaintainabilityViolation =
  | SizeViolation
  | ClassSizeViolation
  | MultiWriteViolation
  | StoreAccessViolation
  | WritePlacementViolation
  | LoopCallViolation
  | BareErrorViolation;
export type MaintainabilityFailure = MaintainabilityViolation | BaselineGrowth | StaleTotal;

export type BaselineSeed = "written" | "kept" | "removed" | "clean";

export class MaintainabilityContract {
  static readonly ruleIds = [
    "akan.size.file",
    "akan.size.component",
    "akan.size.function",
    "akan.size.class",
    "akan.store.multi-write",
    "akan.store.root-write-chain",
    "akan.component.write-chain",
    "akan.component.store-access",
    "akan.write.placement",
    "akan.service.call-in-loop",
    "akan.error.bare-error",
    "akan.baseline.growth",
  ] as const;
  static readonly #measuredFiles = "{lib,ui,webkit,srvkit,common,plugin}/**/*.{ts,tsx,md}";
  static readonly #defaultBranches = ["upstream/HEAD", "upstream/main", "origin/HEAD", "origin/main", "main", "master"];
  readonly #workspaceRoot: string;
  readonly #scope: MaintainabilityScope;
  readonly #libNames: string[];
  #tree: ReadonlyMap<string, string> | null = null;

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
    if (this.#scope.type === "pkg") return await this.#measurePackage();
    const [signalFiles, storeFiles, serviceFiles] = await Promise.all([
      this.#reachedSources("lib/**/*.signal.ts"),
      this.#reachedSources("lib/**/*.store.ts"),
      this.#reachedSources("lib/**/*.service.ts"),
    ]);
    const index = new WritingActionIndex(new SignalMutationIndex(signalFiles), storeFiles);
    const reach = new EndpointReach(signalFiles, serviceFiles);
    const files = await this.#filesIn(this.sysPath, MaintainabilityContract.#measuredFiles);
    const violations = await Promise.all(files.map((file) => this.#measureFile(file, index, reach)));
    return violations.flat().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  }

  async enforce({ fix }: { fix: boolean }): Promise<MaintainabilityFailure[]> {
    const [violations, existing, reference] = await Promise.all([
      this.measure(),
      this.#readBaseline(),
      this.#readReferenceBaseline(),
    ]);
    const moves = await this.#movesSince(reference.ref);
    const onDisk =
      existing === null ? new MaintainabilityBaseline() : MaintainabilityBaseline.parse(existing, this.baselinePath);
    const baseline = fix ? onDisk.movedBy(moves) : onDisk;
    const tightened = baseline.tightenedBy(violations);
    if (fix && existing !== null) await this.#tighten(onDisk, tightened);
    //? Without fix the file on disk is what merges, so an entry it holds above the measured count is checked as written.
    const working = fix ? tightened : baseline;
    const lines = ((await this.#readBaseline()) ?? "").split(/\r?\n/);
    const failures: MaintainabilityFailure[] = [
      ...working.staleTotals(violations).map(
        ({ rule, count, recorded }): StaleTotal => ({
          kind: "staleTotal",
          rule,
          key: MaintainabilityBaseline.totalKey,
          file: MaintainabilityBaseline.fileName,
          line: MaintainabilityContract.#lineOf(lines, rule, MaintainabilityBaseline.totalKey),
          count,
          recorded,
        }),
      ),
      ...baseline.unallowed(violations).map((violation) => {
        const recorded = baseline.recordedOf(violation);
        return recorded === undefined ? violation : { ...violation, recorded };
      }),
    ];
    const source = `${reference.label}:${this.sysPath}/${MaintainabilityBaseline.fileName}`;
    const recorded =
      reference.text !== null ? MaintainabilityBaseline.parse(reference.text, source, { lenient: true }) : null;
    const unrecorded = new Set(working.rulesOutside(recorded));
    const measured = unrecorded.size ? await this.#measuredAt(reference.ref) : null;
    if (recorded === null && measured === null) return failures;
    const committed = (recorded ?? new MaintainabilityBaseline()).withSectionsOf(measured, unrecorded).movedBy(moves);
    //? Without fix the entries on disk keep their old keys, so they are compared under the moved ones the reference took.
    const growths = (fix ? working : working.movedBy(moves))
      .grownFrom(committed)
      .map(
        ({ rule, ...growth }): BaselineGrowth => ({
          kind: "baselineGrowth",
          rule: "akan.baseline.growth",
          file: MaintainabilityBaseline.fileName,
          line: MaintainabilityContract.#lineOf(lines, rule, growth.key),
          debtRule: rule,
          reference: reference.label,
          ...(unrecorded.has(rule) ? { measured: true } : {}),
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
    const next = MaintainabilityBaseline.of(violations, MaintainabilityContract.#reasonsIn(await this.#readBaseline()));
    if (!next.isEmpty) await writeFile(this.baselinePath, next.stringify());
    else if (exists) await rm(this.baselinePath, { force: true });
    return { result: next.isEmpty ? (exists ? "removed" : "clean") : "written", violations };
  }

  describe(failures: MaintainabilityFailure[], commands?: MaintainabilityCommands) {
    return MaintainabilityReport.describe(this.sysPath, failures, commands);
  }

  async #measurePackage() {
    const files = (await this.#packageFiles()).filter(MaintainabilityLimits.isPackageSource);
    const packageName = await this.#packageName();
    const violations = await Promise.all(
      files.map(async (file) => {
        const workspaceFile = `${this.sysPath}/${file}`;
        const content = await this.#read(workspaceFile);
        return MaintainabilityContract.#measurePackageFile(
          file,
          this.#sourceOf(workspaceFile, content).sourceFile,
          MaintainabilityLimits.holdsBareErrors(packageName, file),
        );
      }),
    );
    return violations.flat();
  }

  async #packageName() {
    const manifest = `${this.sysPath}/package.json`;
    const text = this.#tree
      ? this.#tree.get(manifest)
      : existsSync(path.join(this.#workspaceRoot, manifest))
        ? await this.#read(manifest)
        : undefined;
    try {
      const { name } = JSON.parse(text ?? "{}") as { name?: unknown };
      return typeof name === "string" ? name : null;
    } catch {
      return null;
    }
  }

  static #measurePackageFile(file: string, sourceFile: ts.SourceFile, holdsBareErrors: boolean) {
    const violations: MaintainabilityViolation[] = [];
    const maxLines = MaintainabilityLimits.packageFileMaxLines;
    const lineCount = MaintainabilityLimits.lineCountOf(sourceFile.text);
    if (lineCount > maxLines && !MaintainabilityLimits.isReexportBarrel(file, sourceFile.text))
      violations.push({ kind: "size", rule: "akan.size.file", key: file, file, line: 1, lineCount, maxLines });
    const { functions, classes } = new StructureScanner().measure(sourceFile);
    const longFunctions = functions.filter(({ lineCount }) => lineCount > MaintainabilityLimits.functionMaxLines);
    for (const { name, line, lineCount } of MaintainabilityContract.#numbered(longFunctions))
      violations.push({
        kind: "size",
        rule: "akan.size.function",
        key: `${file}#${name}`,
        file,
        line,
        lineCount,
        maxLines: MaintainabilityLimits.functionMaxLines,
        function: name,
      });
    const largeClasses = classes.filter(({ memberCount }) => memberCount > MaintainabilityLimits.classMaxMembers);
    for (const { name, line, memberCount } of MaintainabilityContract.#numbered(largeClasses))
      violations.push({
        kind: "classSize",
        rule: "akan.size.class",
        key: `${file}#${name}`,
        file,
        line,
        owner: name,
        memberCount,
        maxMembers: MaintainabilityLimits.classMaxMembers,
      });
    const bareErrors = holdsBareErrors ? new BareErrorScanner().lines(sourceFile) : [];
    if (bareErrors.length)
      violations.push({
        kind: "bareError",
        rule: "akan.error.bare-error",
        key: file,
        file,
        line: bareErrors[0] ?? 1,
        lines: bareErrors,
      });
    return violations;
  }

  //? Only breaches are numbered: a short function sharing a recorded one's name never moves the recorded key.
  static #numbered<Item extends { name: string }>(items: Item[]) {
    const seen = new Map<string, number>();
    return items.map((item) => {
      const count = (seen.get(item.name) ?? 0) + 1;
      seen.set(item.name, count);
      return count === 1 ? item : { ...item, name: `${item.name}[${count}]` };
    });
  }

  //? Git lists what the package holds without its ignored build output, caches and sample artifacts.
  async #packageFiles() {
    const listed = this.#tree
      ? null
      : await this.#git(["ls-files", "-z", "-co", "--exclude-standard", "--", `./${this.sysPath}`]);
    if (listed === null) return await this.#filesIn(this.sysPath, "**/*.{ts,tsx}");
    const prefix = `${this.sysPath}/`;
    return listed
      .split("\0")
      .filter((file) => file.startsWith(prefix) && existsSync(path.join(this.#workspaceRoot, file)))
      .map((file) => file.slice(prefix.length))
      .filter((file) => !file.includes("node_modules/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
    const content = await this.#read(workspaceFile);
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
      roots.map(async (root) => (await this.#filesIn(root, pattern)).map((file) => `${root}/${file}`)),
    );
    return await Promise.all(files.flat().map(async (file) => this.#sourceOf(file, await this.#read(file))));
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
    return { ref, label: ref === "HEAD" ? ref : ref.slice(0, 12), text };
  }

  //* With no baseline file at the reference, or no section there for a rule, the debt its code already holds is the
  //* floor: none for a scope new to the branch or one whose paid-off file was removed, and the breaches it had for a
  //* scope that adopts the gate here or a rule this version adds.
  async #measuredAt(ref: string) {
    if ((await this.#git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) === null) return null;
    const roots = [this.sysPath, ...this.#libNames.map((libName) => `libs/${libName}`)];
    const contract = new MaintainabilityContract(this.#workspaceRoot, this.#scope, this.#libNames);
    contract.#tree = await new GitRevision(this.#workspaceRoot).filesAt(
      ref,
      (file) => /\.(tsx?|md)$/.test(file) || file === `${this.sysPath}/package.json`,
      roots,
    );
    return MaintainabilityBaseline.of(await contract.measure());
  }

  //* A branch's own commits cannot be the reference: one that raises an entry would make the raise the new floor.
  //* The fork point from the default branch holds still, whatever the branch commits.
  //* Without that history the only copy left is the branch's own, so a shallow checkout fails instead of passing.
  async #referenceRef() {
    for (const branch of MaintainabilityContract.#defaultBranches) {
      if ((await this.#git(["rev-parse", "--verify", "--quiet", `${branch}^{commit}`])) === null) continue;
      const forkPoint = (await this.#git(["merge-base", "HEAD", branch]))?.trim();
      if (forkPoint) return forkPoint;
      throw new Error(MaintainabilityContract.#missingHistory(this.sysPath, `HEAD shares no commit with ${branch}`));
    }
    if ((await this.#git(["rev-parse", "--is-shallow-repository"]))?.trim() === "true")
      throw new Error(MaintainabilityContract.#missingHistory(this.sysPath, "this is a shallow clone"));
    return "HEAD";
  }

  //? Git pairs a moved file with its old path by content, so its entries carry over instead of reading as new debt.
  //? A move that also rewrote more than half the file, or left a file at the old path, reads as an add and fails as new.
  async #movesSince(ref: string) {
    const staged = await this.#stagedScope();
    try {
      const diff = ["diff", ...(staged ? ["--cached"] : []), "--relative", "--name-status", "-z", "-M", ref];
      const fields = (await this.#git([...diff, "--", this.sysPath], staged?.env))?.split("\0") ?? [];
      const prefix = `${this.sysPath}/`;
      const moves = new Map<string, string>();
      for (let idx = 0; idx < fields.length; idx += fields[idx]?.startsWith("R") ? 3 : 2) {
        const [from, to] = [fields[idx + 1], fields[idx + 2]];
        if (!fields[idx]?.startsWith("R") || !from?.startsWith(prefix) || !to?.startsWith(prefix)) continue;
        moves.set(from.slice(prefix.length), to.slice(prefix.length));
      }
      return moves;
    } finally {
      if (staged) await rm(staged.dir, { recursive: true, force: true });
    }
  }

  //? Git pairs moves only between staged paths, so a copy of the index stages the scope's tracked changes and its new
  //? sources: a plain rename pairs too, the user's index is never written, and no other untracked file is stored.
  //? Where any step fails, the moves already staged in the user's index are still read.
  async #stagedScope() {
    const indexPath = (await this.#git(["rev-parse", "--git-path", "index"]))?.trim();
    const untracked = (await this.#git(["ls-files", "-o", "--exclude-standard", "-z", "--", this.sysPath]))
      ?.split("\0")
      .filter((file) => /\.(tsx?|md)$/.test(file));
    if (!indexPath || !untracked) return null;
    const dir = await mkdtemp(path.join(tmpdir(), "akan-moves-")).catch(() => null);
    if (!dir) return null;
    const env = { GIT_INDEX_FILE: path.join(dir, "index") };
    const listPath = path.join(dir, "untracked");
    try {
      const indexFile = path.resolve(this.#workspaceRoot, indexPath);
      if (existsSync(indexFile)) await copyFile(indexFile, env.GIT_INDEX_FILE);
      await writeFile(listPath, untracked.join("\0"));
      const added =
        (await this.#git(["add", "-u", "--", this.sysPath], env)) !== null &&
        (!untracked.length ||
          (await this.#git(["add", "--pathspec-from-file", listPath, "--pathspec-file-nul"], env)) !== null);
      if (added) return { dir, env };
    } catch {
      //? A full or read-only temp dir: fall back to the moves the user's own index holds.
    }
    await rm(dir, { recursive: true, force: true });
    return null;
  }

  static #missingHistory(sysPath: string, cause: string) {
    return (
      `${sysPath}/${MaintainabilityBaseline.fileName} is compared with its copy where this branch forked from the default branch, ` +
      `but ${cause}. Fetch the default branch with its history (in GitHub Actions, actions/checkout with fetch-depth: 0).`
    );
  }

  //? GIT_OPTIONAL_LOCKS=0 keeps a read from refreshing the index under the user's own git, which would then fail on index.lock.
  async #git(args: string[], env: Record<string, string> = {}) {
    try {
      const proc = Bun.spawn(["git", ...args], {
        cwd: this.#workspaceRoot,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...env },
        stdout: "pipe",
        stderr: "ignore",
      });
      const [text, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      return exitCode === 0 ? text : null;
    } catch {
      return null;
    }
  }

  static #reasonsIn(text: string | null) {
    if (text === null) return new Map<string, string>();
    try {
      return MaintainabilityBaseline.parse(text, MaintainabilityBaseline.fileName, { lenient: true }).reasons;
    } catch {
      //? A file too broken to read is what `--force` replaces; its reasons go with it.
      return new Map<string, string>();
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
    if (key === MaintainabilityBaseline.totalKey) return from + 1;
    const idx = lines.findIndex((line, lineIdx) => lineIdx >= from && line.includes(`${JSON.stringify(key)}:`));
    return Math.max(idx + 1, 1);
  }

  async #filesIn(root: string, pattern: string) {
    const glob = new Bun.Glob(pattern);
    const files = this.#tree
      ? [...this.#tree.keys()]
          .filter((file) => file.startsWith(`${root}/`))
          .map((file) => file.slice(root.length + 1))
          .filter((file) => glob.match(file))
      : await MaintainabilityContract.#filesOnDisk(path.join(this.#workspaceRoot, root), glob);
    return files.filter((file) => !file.includes("node_modules/")).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  static async #filesOnDisk(root: string, glob: Bun.Glob) {
    if (!existsSync(root)) return [];
    const files = await Array.fromAsync(glob.scan({ cwd: root, onlyFiles: true }));
    return files.map((file) => file.split(path.sep).join("/"));
  }

  async #read(file: string) {
    return this.#tree ? (this.#tree.get(file) ?? "") : await readFile(path.join(this.#workspaceRoot, file), "utf8");
  }
}
