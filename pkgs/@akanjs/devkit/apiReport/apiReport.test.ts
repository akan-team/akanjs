import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { ApiReport } from "./apiReport";
import { ApiReportDiff } from "./apiReportDiff";
import { ApiReportPolicy } from "./apiReportPolicy";
import { ChangesetBump } from "./changesetBump";

const makeTempRoot = tempDirs("akan-api-report-");

const fixture: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "demo",
    exports: {
      ".": { types: "./index.ts", import: "./index.ts" },
      "./package.json": "./package.json",
      "./sub": "./sub/index.ts",
      "./styles.css": "./styles.css",
      "./parts/*": "./parts/*",
    },
  }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ESNext", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true },
  }),
  "node_modules/thirdparty/package.json": JSON.stringify({ name: "thirdparty", types: "./index.d.ts" }),
  "node_modules/thirdparty/index.d.ts": "export declare class Clock { now(): number; }\n",
  "index.ts": `import { makeHidden } from "./hidden";
import { endpoint } from "./mixin";
export { Clock as Timer } from "thirdparty";
export * from "./store";
export * as tools from "./tools";
const local = 1;
export { local as renamed };
/** @deprecated use \`next\` */
export const legacy = (value: string) => value.length;
export function pick(value: string): string;
export function pick(value: number): number;
export function pick(value: string | number) {
  return value;
}
export type Mode = "b" | "a" | "c";
export interface Shape {
  mode: Mode;
}
export const made = makeHidden();
export class Endpoint extends endpoint({ ping: (id: string) => id.length }) {}
`,
  "store.ts": `import type { Options } from "./options";
export class Store {
  #secret = 1;
  private hidden = 2;
  protected guarded = 3;
  private constructor(readonly name: string) {}
  static make(name: string) {
    return new Store(name);
  }
  configure(options: Options) {
    return options;
  }
  private helper() {
    return this.#secret + this.hidden;
  }
}
`,
  "options.ts": "export interface Options {\n  retries: number;\n}\n",
  "hidden.ts": `interface Options {
  verbose: boolean;
}
interface Inner {
  depth: number;
  options: Options;
}
export interface Hidden {
  label: string;
  inner: Inner;
}
export const makeHidden = (): Hidden => ({ label: "", inner: { depth: 0, options: { verbose: false } } });
`,
  "mixin.ts": `export const endpoint = <Api extends Record<string, (...args: never[]) => unknown>>(api: Api) =>
  class {
    api = api;
  };
`,
  "tools.ts": `import type { Options } from "./options";
export const version = "1";
export interface Tool {
  options: Options;
}
`,
  "sub/index.ts": "export const answer = 42 as const;\n",
};

const writeFixture = async (overrides: Record<string, string> = {}) => {
  const root = await makeTempRoot();
  for (const [file, content] of Object.entries({ ...fixture, ...overrides }))
    await writeText(path.join(root, file), content);
  return root;
};

//? Each generate runs the TypeScript declaration emit, which took up to 5.5 s on a CI runner under coverage.
setDefaultTimeout(30_000);

const generate = async (overrides: Record<string, string> = {}) =>
  await ApiReport.generate(await writeFixture(overrides));

describe("ApiReport", () => {
  test("reads named TS entry points and lists wildcards apart", () => {
    const { entries, wildcards } = ApiReport.entriesOf(JSON.parse(fixture["package.json"] ?? "{}"), "/pkg");
    expect(entries.map(({ specifier, reportName, file }) => ({ specifier, reportName, file }))).toEqual([
      { specifier: "demo", reportName: "demo.api.md", file: "/pkg/index.ts" },
      { specifier: "demo/sub", reportName: "demo.sub.api.md", file: "/pkg/sub/index.ts" },
    ]);
    expect(wildcards).toEqual(["./parts/*"]);
  });

  test("renders each export, then what the exports name that no entry exports", async () => {
    const files = await generate();
    expect([...files.keys()]).toEqual(["demo.api.md", "demo.sub.api.md", "demo.wildcards.api.md"]);
    expect(files.get("demo.api.md")).toBe(`# \`demo\`

Generated from the declaration emit by \`bun run api:report\`. Do not edit it by hand.

\`\`\`ts
export declare class Endpoint extends Endpoint_base {
}

export type Mode = "a" | "b" | "c";

export interface Shape {
    mode: Mode;
}

export declare class Store {
    readonly name: string;
    protected guarded: number;
    private constructor();
    static make(name: string): Store;
    configure(options: Options): Options;
}

export { Clock as Timer } from "thirdparty";

/** @deprecated */
export declare const legacy: (value: string) => number;

export declare const made: import("./hidden").Hidden;

export declare function pick(value: string): string;
export declare function pick(value: number): number;

export declare const renamed = 1;

export declare namespace tools {
    interface Tool {
        options: Options;
    }
    const version = "1";
}
\`\`\`

${ApiReport.referencedHeading}

The declarations above name these, and no entry point exports them.

\`\`\`ts
declare const Endpoint_base: {
    new (): {
        api: {
            ping: (id: string) => number;
        };
    };
};

interface Hidden {
    label: string;
    inner: Inner;
}

interface Inner {
    depth: number;
    options: Options;
}

// hidden
interface Options {
    verbose: boolean;
}

// options
interface Options {
    retries: number;
}
\`\`\`
`);
    expect(files.get("demo.sub.api.md")).toContain("export declare const answer: 42;");
    expect(files.get("demo.wildcards.api.md")).toContain("- `./parts/*`");
  });

  test("shows a change to a mixin's fields as a break of its emitted base", async () => {
    const before = await generate();
    const after = await generate({
      "index.ts": (fixture["index.ts"] ?? "").replace("ping: (id: string)", "pong: (id: string)"),
    });
    expect(ApiReportDiff.breaks(before, after).map(({ name, kind }) => `${kind} ${name}`)).toEqual([
      "changed Endpoint_base (referenced)",
    ]);
  });

  test("shows a change to a type only an export's type names", async () => {
    const before = await generate();
    const after = await generate({
      "hidden.ts": (fixture["hidden.ts"] ?? "").replace("depth: number", "depth: string"),
    });
    expect(ApiReportDiff.breaks(before, after).map(({ name, kind }) => `${kind} ${name}`)).toEqual([
      "changed Inner (referenced)",
    ]);
  });

  test("compares a referenced type the same change exports with its old block", async () => {
    const hidden = fixture["hidden.ts"] ?? "";
    const exportingInner = (from: "index.ts" | "sub/index.ts", source: string) => ({
      [from]: `export type { Inner } from "${from === "index.ts" ? "." : ".."}/hidden";\n${fixture[from] ?? ""}`,
      "hidden.ts": source.replace("interface Inner", "export interface Inner"),
    });
    const before = await generate();
    expect(ApiReportDiff.breaks(before, await generate(exportingInner("index.ts", hidden)))).toEqual([]);
    expect(
      ApiReportDiff.breaks(
        before,
        await generate(exportingInner("index.ts", hidden.replace("depth: number", "depth: string"))),
      ),
    ).toEqual([
      {
        report: "demo.api.md",
        name: "Inner (referenced)",
        kind: "changed",
        before: "interface Inner {\n    depth: number;\n    options: Options;\n}",
        after: "export interface Inner {\n    depth: string;\n    options: Options;\n}",
      },
    ]);
    expect(ApiReportDiff.breaks(before, await generate(exportingInner("sub/index.ts", hidden)))).toEqual([]);
    expect(
      ApiReportDiff.breaks(
        before,
        await generate(exportingInner("sub/index.ts", hidden.replace("depth: number", "depth: string"))),
      ).map(({ report, name, kind }) => `${kind} ${name} (${report})`),
    ).toEqual(["changed Inner (referenced) (demo.api.md)"]);
  });

  test("compares a referenced type that a second one of its name moves to a module key", async () => {
    const hidden = fixture["hidden.ts"] ?? "";
    const withOtherInner = (source: string) => ({
      "index.ts": `import { makeExtra } from "./extra";\n${fixture["index.ts"] ?? ""}export const extra = makeExtra();\n`,
      "extra.ts": `interface Inner {
  size: number;
}
export interface Extra {
  inner: Inner;
}
export const makeExtra = (): Extra => ({ inner: { size: 0 } });
`,
      "hidden.ts": source,
    });
    const before = await generate();
    expect(ApiReportDiff.breaks(before, await generate(withOtherInner(hidden)))).toEqual([]);
    expect(
      ApiReportDiff.breaks(
        before,
        await generate(withOtherInner(hidden.replace("depth: number", "depth: string"))),
      ).map(({ name, kind }) => `${kind} ${name}`),
    ).toEqual(["changed Inner (referenced)"]);
  });

  test("shows a removed wildcard subpath as a break, and not an added one", async () => {
    const before = await generate();
    const after = await generate({
      "package.json": (fixture["package.json"] ?? "").replace('"./parts/*":"./parts/*"', '"./more/*":"./more/*"'),
    });
    expect(after.get("demo.wildcards.api.md")).toContain("- `./more/*`");
    expect(ApiReportDiff.breaks(before, after)).toEqual([
      { report: "demo.wildcards.api.md", name: "./parts/*", kind: "removed", before: "- `./parts/*`" },
    ]);
  });

  test("gives the same text on a second run", async () => {
    expect(await generate()).toEqual(await generate());
  });
});

describe("ApiReportDiff", () => {
  const reportOf = (blocks: string[], referenced: string[] = []) =>
    `# \`demo\`\n\n\`\`\`ts\n${blocks.join("\n\n")}\n\`\`\`\n${
      referenced.length ? `\n${ApiReport.referencedHeading}\n\n\`\`\`ts\n${referenced.join("\n\n")}\n\`\`\`\n` : ""
    }`;

  test("keys each block by its export name, and a referenced one apart", () => {
    const blocks = ApiReportDiff.blocksOf(
      reportOf(
        [
          "/** @deprecated */\nexport declare const legacy: number;",
          'export { Clock as Timer } from "thirdparty";',
          'export * as tools from "thirdparty";',
          "export declare function pick(value: string): string;\nexport declare function pick(value: number): number;",
          "export declare abstract class Base {\n}",
          "export default function main(): void;",
        ],
        ["declare const Base_base: {\n};", "// a\ninterface Options {\n}", "// b\ninterface Options {\n}"],
      ),
    );
    expect([...blocks.keys()]).toEqual([
      "legacy",
      "Timer",
      "tools",
      "pick",
      "Base",
      "default",
      "Base_base (referenced)",
      "Options (referenced, a)",
      "Options (referenced, b)",
    ]);
  });

  test("names the files that drifted", () => {
    const committed = new Map([
      ["a.api.md", "1"],
      ["b.api.md", "2"],
      ["gone.api.md", "3"],
    ]);
    const generated = new Map([
      ["a.api.md", "1"],
      ["b.api.md", "changed"],
      ["new.api.md", "4"],
    ]);
    expect(ApiReportDiff.drift(committed, generated)).toEqual({
      changed: ["b.api.md"],
      added: ["new.api.md"],
      removed: ["gone.api.md"],
    });
    expect(ApiReportDiff.hasDrift(ApiReportDiff.drift(committed, committed))).toBe(false);
  });

  test("reports a removed or changed export with both texts, not an added one or a new tag", () => {
    const before = new Map([
      [
        "demo.api.md",
        reportOf(
          ["export declare const a: number;", "export declare const b: number;", "export declare const d: number;"],
          ["declare const Gone_base: {\n};", "interface Kept {\n    x: string;\n}"],
        ),
      ],
      ["demo.old.api.md", reportOf(["export type Old = string;"])],
    ]);
    const after = new Map([
      [
        "demo.api.md",
        reportOf(
          [
            "export declare const a: string;",
            "export declare const c: number;",
            "/** @deprecated */\nexport declare const d: number;",
          ],
          ["interface Kept {\n    x: number;\n}"],
        ),
      ],
    ]);
    expect(ApiReportDiff.breaks(before, after)).toEqual([
      {
        report: "demo.api.md",
        name: "a",
        kind: "changed",
        before: "export declare const a: number;",
        after: "export declare const a: string;",
      },
      { report: "demo.api.md", name: "b", kind: "removed", before: "export declare const b: number;" },
      {
        report: "demo.api.md",
        name: "Kept (referenced)",
        kind: "changed",
        before: "interface Kept {\n    x: string;\n}",
        after: "interface Kept {\n    x: number;\n}",
      },
      { report: "demo.old.api.md", name: "Old", kind: "removed", before: "export type Old = string;" },
    ]);
  });
});

describe("ChangesetBump", () => {
  test("reads one package's bump from the frontmatter, quoted or not", () => {
    const changeset = `---\n"@akanjs/cli": patch\n'akanjs': minor\n@akanjs/devkit: major\n---\n\nUpgrade note.\n`;
    expect(ChangesetBump.of(changeset, "akanjs")).toBe("minor");
    expect(ChangesetBump.of(changeset, "@akanjs/cli")).toBe("patch");
    expect(ChangesetBump.of(changeset, "@akanjs/devkit")).toBe("major");
    expect(ChangesetBump.of(changeset, "@akanjs/language")).toBeNull();
    expect(ChangesetBump.of("no frontmatter", "akanjs")).toBeNull();
  });

  test("reads past a byte-order mark and a trailing comment", () => {
    expect(ChangesetBump.of(`﻿---\nakanjs: minor\n---\n`, "akanjs")).toBe("minor");
    expect(ChangesetBump.of(`---\n"akanjs": minor # drops Err.legacy\n---\n`, "akanjs")).toBe("minor");
    expect(ChangesetBump.of(`---\r\n"akanjs": major\r\n---\r\n`, "akanjs")).toBe("major");
  });

  test("ranks a bump against a floor", () => {
    expect(ChangesetBump.atLeast("major", "minor")).toBe(true);
    expect(ChangesetBump.atLeast("minor", "minor")).toBe(true);
    expect(ChangesetBump.atLeast("patch", "minor")).toBe(false);
    expect(ChangesetBump.atLeast(null, "minor")).toBe(false);
  });
});

describe("ApiReportPolicy", () => {
  const reportOf = (...blocks: string[]) => `# \`demo\`\n\n\`\`\`ts\n${blocks.join("\n\n")}\n\`\`\`\n`;
  const git = (root: string, ...args: string[]) => {
    const result = Bun.spawnSync(
      [
        "git",
        "-c",
        "user.name=Akan Test",
        "-c",
        "user.email=test@akanjs.com",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        ...args,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  };
  const changeset = (bump: string) => `---\n"akanjs": ${bump}\n---\n\nNote.\n`;
  const makeRepo = async (baseReports: Record<string, string>, baseFiles: Record<string, string> = {}) => {
    const root = await makeTempRoot();
    git(root, "init", "-q", "-b", "main");
    for (const [file, content] of Object.entries({ ".changeset/README.md": "changesets\n", ...baseFiles }))
      await writeText(path.join(root, file), content);
    for (const [file, content] of Object.entries(baseReports))
      await writeText(path.join(root, "api-report/demo", file), content);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "feature");
    return { root, policy: new ApiReportPolicy(root, path.join("api-report", "demo"), "akanjs") };
  };

  test("finds no break when the base had no reports", async () => {
    const { root, policy } = await makeRepo({});
    await writeText(path.join(root, "api-report/demo/demo.api.md"), reportOf("export declare const a: number;"));
    expect(await policy.check("main")).toEqual({ breaks: [], bumped: false });
  });

  test("compares with the merge base, not the base branch's tip", async () => {
    const { root, policy } = await makeRepo({ "demo.api.md": reportOf("export declare const a: number;") });
    git(root, "checkout", "-q", "main");
    await writeText(path.join(root, "api-report/demo/demo.api.md"), reportOf("export declare const z: number;"));
    git(root, "commit", "-q", "-am", "main moves on");
    git(root, "checkout", "-q", "feature");
    expect(await policy.check("main")).toEqual({ breaks: [], bumped: false });
  });

  test("asks for a minor changeset added on the branch, committed or not", async () => {
    const { root, policy } = await makeRepo(
      { "demo.api.md": reportOf("export declare const a: number;", "export declare const b: number;") },
      { ".changeset/older.md": changeset("major") },
    );
    await writeText(path.join(root, "api-report/demo/demo.api.md"), reportOf("export declare const a: number;"));
    expect(await policy.check("main")).toMatchObject({ breaks: [{ name: "b", kind: "removed" }], bumped: false });
    await writeText(path.join(root, ".changeset/patch.md"), changeset("patch"));
    expect((await policy.check("main"))?.bumped).toBe(false);
    await writeText(path.join(root, ".changeset/untracked.md"), changeset("minor"));
    expect((await policy.check("main"))?.bumped).toBe(true);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "drop b");
    expect((await policy.check("main"))?.bumped).toBe(true);
    await rm(path.join(root, ".changeset/untracked.md"));
    expect((await policy.check("main"))?.bumped).toBe(false);
  });

  test("counts a changeset added in place of a similar one from the base", async () => {
    const note = "Every app's client declaration names the Err type instead of spelling out its class.\n".repeat(4);
    const { root, policy } = await makeRepo(
      { "demo.api.md": reportOf("export declare const a: number;", "export declare const b: number;") },
      { ".changeset/older.md": `---\n"akanjs": patch\n---\n\n${note}` },
    );
    await writeText(path.join(root, "api-report/demo/demo.api.md"), reportOf("export declare const a: number;"));
    await rm(path.join(root, ".changeset/older.md"));
    await writeText(path.join(root, ".changeset/newer.md"), `---\n"akanjs": minor\n---\n\n${note}`);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "drop b");
    expect((await policy.check("main"))?.bumped).toBe(true);
  });

  test("answers null for a ref that names no commit", async () => {
    const { policy } = await makeRepo({});
    expect(await policy.check("origin/missing")).toBeNull();
  });
});
