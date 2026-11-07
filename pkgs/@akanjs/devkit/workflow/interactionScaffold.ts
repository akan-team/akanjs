import { capitalize, lowerlize } from "akanjs/common";
import type { Sys } from "../commandDecorators";
import type { ScaffoldFile, WorkflowDiagnostic } from "./types";

export class InteractionScaffold {
  readonly name: string;
  readonly className: string;
  readonly hookName: string;
  readonly #commonSpecifier: string;

  constructor(sys: Sys, name: string) {
    this.name = name;
    this.className = capitalize(name);
    this.hookName = `use${this.className}`;
    this.#commonSpecifier = `@${sys.type}s/${sys.name}/common`;
  }

  static nameOf(raw: string) {
    const name = lowerlize(raw.replace(/^use(?=[A-Z])/, ""));
    return /^[a-z][A-Za-z0-9]*$/.test(name) ? name : null;
  }

  static async build(sys: Sys, raw: string | null) {
    const diagnostics: WorkflowDiagnostic[] = [];
    const name = raw ? InteractionScaffold.nameOf(raw) : null;
    if (!name) {
      diagnostics.push({
        severity: "error",
        code: "create-interaction-name-invalid",
        input: "interaction",
        message: `Interaction name "${raw ?? ""}" must be camelCase (boardKeys), optionally prefixed with use.`,
      });
      return { diagnostics, files: [] as ScaffoldFile[] };
    }
    const scaffold = new InteractionScaffold(sys, name);
    const files = scaffold.files;
    const taken = (
      await Promise.all(
        scaffold.claimedPaths.map(async (path) =>
          (await sys.exists(path)) ? `${sys.type}s/${sys.name}/${path}` : null,
        ),
      )
    ).filter((path): path is string => !!path);
    if (taken.length)
      diagnostics.push({
        severity: "error",
        code: "create-interaction-exists",
        input: "interaction",
        message: `${taken.join(", ")} already exists; pick another interaction name or extend the existing files.`,
      });
    return { diagnostics, files: taken.length ? [] : files };
  }

  get claimedPaths() {
    const { name, hookName } = this;
    return [
      `common/${name}.ts`,
      `common/${name}.tsx`,
      `common/${name}.test.ts`,
      `webkit/${hookName}.tsx`,
      `webkit/${hookName}.ts`,
    ];
  }

  get files(): ScaffoldFile[] {
    return [
      {
        path: `common/${this.name}.ts`,
        content: this.logicSource,
        action: "create",
        reason: "Pure interaction logic.",
      },
      {
        path: `common/${this.name}.test.ts`,
        content: this.testSource,
        action: "create",
        reason: "Test of the pure interaction logic.",
      },
      { path: `webkit/${this.hookName}.tsx`, content: this.hookSource, action: "create", reason: "Client hook." },
    ];
  }

  get logicSource() {
    return [
      `export class ${this.className} {`,
      "  static next<State extends object>(state: State, input: Partial<State>) {",
      "    return { ...state, ...input };",
      "  }",
      "}",
      "",
    ].join("\n");
  }

  get testSource() {
    return [
      'import { describe, expect, it } from "bun:test";',
      `import { ${this.className} } from "./${this.name}";`,
      "",
      `describe(${JSON.stringify(this.className)}, () => {`,
      '  it("applies an input over the state it is handed", () => {',
      `    expect(${this.className}.next({ idx: 0, isOpen: false }, { idx: 1 })).toEqual({ idx: 1, isOpen: false });`,
      "  });",
      "});",
      "",
    ].join("\n");
  }

  get hookSource() {
    return [
      '"use client";',
      `import { ${this.className} } from "${this.#commonSpecifier}";`,
      "",
      `export const ${this.hookName} = <State extends object>(state: State, commit: (next: State) => void) => {`,
      "  const change = async (input: Partial<State>) => {",
      `    commit(${this.className}.next(state, input));`,
      "  };",
      "  return { change };",
      "};",
      "",
    ].join("\n");
  }
}
