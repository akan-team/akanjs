import { describe, expect, test } from "bun:test";
import path from "node:path";
import ts from "typescript";
import { RuntimeImports } from "./runtimeImports";

const files = [
  "apps/demo/ui/Card.tsx",
  "apps/demo/lib/memo/Memo.Zone.tsx",
  "apps/demo/lib/st/inner.ts",
  "libs/kit/ui/deep/inner/Panel.tsx",
];
const targets = [
  "apps/demo/client",
  "apps/demo/lib/useClient",
  "apps/demo/lib/usePage",
  "apps/demo/lib/st",
  "apps/demo/lib/sig",
  "apps/demo/lib/__client/memo.st",
  "libs/kit/client",
  "libs/kit/lib/useClient",
];
const tails = ["", ".ts", ".tsx", ".js", ".jsx", "/index", "/index.ts", "/index.js"];
const frameworks = ["akanjs/store", "akanjs/client", "akanjs/./store", "akanjs/client/index", "akanjs/store/baseSt"];

const spellingsOf = (file: string, target: string) => {
  const [root = "", scope = "", ...rest] = target.split("/");
  const relative = path.posix.relative(path.posix.dirname(file), target);
  const dotted = relative.startsWith(".") ? relative : `./${relative}`;
  return [
    ...tails.flatMap((tail) => [
      `@${target}${tail}`,
      `@${root}/${scope}//${rest.join("/")}${tail}`,
      `@${root}/${scope}/./${rest.join("/")}${tail}`,
      `${dotted}${tail}`,
      `${dotted.replace(/\//g, "//")}${tail}`,
      `${dotted}/../${path.posix.basename(target)}${tail}`,
      `./ /..${dotted.slice(1)}${tail}`,
    ]),
    ".",
    "..",
    "./",
    "../.",
  ];
};

const escapedOf = (spelling: string) => {
  const at = spelling.search(/[a-z](?=[^/]*$)/);
  if (at < 0) return [spelling];
  const code = spelling.charCodeAt(at);
  const swap = (escape: string) => `${spelling.slice(0, at)}${escape}${spelling.slice(at + 1)}`;
  return [
    spelling,
    swap(`\\u${code.toString(16).padStart(4, "0")}`),
    swap(`\\u{${code.toString(16)}}`),
    swap(`\\x${code.toString(16)}`),
    swap(`\\\n${spelling[at]}`),
    swap(`\\\r\n${spelling[at]}`),
  ];
};

const statementsOf = (literal: string) => [
  `import { st } from ${literal};\n`,
  `export * from ${literal};\n`,
  `import client = require(${literal});\n`,
  `const client = require(${literal});\n`,
  `export const load = () => import(${literal});\n`,
  `import ${literal};\n`,
];

const specifierOf = (file: string, text: string) => {
  let found: string | null = null;
  const visit = (node: ts.Node) => {
    if (found === null && ts.isStringLiteralLike(node)) found = node.text;
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return found as string | null;
};

describe("RuntimeImports", () => {
  test("never skips a file whose specifier, in any spelling, the specifier reader resolves", () => {
    let resolved = 0;
    const skipped: string[] = [];
    for (const file of files)
      for (const spelling of [...targets.flatMap((target) => spellingsOf(file, target)), ...frameworks])
        for (const escaped of escapedOf(spelling))
          for (const quote of ['"', "'", "`"])
            for (const text of statementsOf(`${quote}${escaped}${quote}`)) {
              const specifier = specifierOf(file, `// a \`note\`, it's\n${text}`);
              if (specifier === null || !RuntimeImports.targetOf(specifier, file)) continue;
              resolved++;
              if (!RuntimeImports.mayUseRuntime(`// a \`note\`, it's\n${text}`, file)) skipped.push(`${file}: ${text}`);
            }
    expect(skipped).toEqual([]);
    expect(resolved).toBeGreaterThan(20000);
  });

  test("reads a specifier through its extension, index, doubled slashes and dot segments", () => {
    const file = "apps/demo/lib/memo/Memo.Zone.tsx";
    expect(
      [
        "@apps/demo/client.js",
        "@apps/demo//client",
        "@apps/demo/./lib/../client/index.tsx",
        "../useClient.js",
        "../__client/memo.st",
        "../__client/_base.fetch",
        "../__client/_st",
        "../__client/_useClient.ts",
        "akanjs/./store",
        "akanjs/store/baseSt",
        "akanjs/client/native/haptics",
        "akanjs/fetch",
        "@apps/demo/lib/cnst",
      ].map((specifier) => RuntimeImports.targetOf(specifier, file)?.kind ?? null),
    ).toEqual([
      "client",
      "client",
      "client",
      "useClient",
      "piece",
      "piece",
      "_st",
      "_useClient",
      "framework-store",
      "framework-deep",
      null,
      "framework-fetch",
      null,
    ]);
  });

  test("names the agent entry apart, and lists as its screen exports the files that import no store or fetch", async () => {
    const kindOf = (specifier: string) => RuntimeImports.targetOf(specifier, "apps/demo/ui/Card.tsx")?.kind ?? null;
    expect(
      [
        "akanjs/store/agent",
        "akanjs/store/agent/index.ts",
        "akanjs/store/agent/ScreenSettle",
        "akanjs/client/agent",
      ].map(kindOf),
    ).toEqual(["framework-agent", "framework-agent", "framework-deep", "framework-deep"]);
    const use = (name: string) => RuntimeImports.useOf({ scope: "apps/demo", kind: "framework-agent" }, name, false);
    expect([use("ScreenSettle"), use("AgentBridge"), use("somethingNew")]).toEqual([
      null,
      { reason: "whole-runtime-import", why: "a framework internal may hand out the whole runtime" },
      { reason: "whole-runtime-import", why: "a framework internal may hand out the whole runtime" },
    ]);

    const dir = path.join(import.meta.dir, "../../../akanjs/store/agent");
    const index = await Bun.file(path.join(dir, "index.ts")).text();
    const files = new Map<string, { imports: string[]; exports: string[]; text: string }>();
    for (const [, name = ""] of index.matchAll(/export \* from "\.\/(\w+)";/g)) {
      const text = await Bun.file(path.join(dir, `${name}.ts`)).text();
      const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest);
      const imports = source.statements.flatMap((statement) => {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
        const clause = statement.importClause;
        const named =
          clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
        const values = named.filter((element) => !element.isTypeOnly).map((element) => element.name.text);
        if (clause?.isTypeOnly || (clause && !clause.name && named.length && !values.length)) return [];
        const specifier = statement.moduleSpecifier.text;
        return specifier === "akanjs/client" && values.join() === "router" ? [] : [specifier];
      });
      const exports = source.statements.flatMap((statement) => {
        const exported =
          ts.canHaveModifiers(statement) &&
          ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported) return [];
        if (ts.isVariableStatement(statement))
          return statement.declarationList.declarations.map((declaration) => declaration.name.getText(source));
        return [(statement as ts.DeclarationStatement).name?.text ?? "default"];
      });
      files.set(name, { imports, exports, text });
    }
    expect(files.size).toBe(12);
    const outside = new Set(["akanjs/base", "use-agentic"]);
    for (let size = -1; size !== files.size; ) {
      size = files.size;
      for (const [name, { imports }] of files)
        if (!imports.every((specifier) => outside.has(specifier) || files.has(specifier.replace(/^\.\//, ""))))
          files.delete(name);
    }
    expect([...files.values()].filter(({ text }) => /globalThis|Symbol\.for\(|import\(/.test(text))).toEqual([]);
    expect([...files.values()].flatMap(({ exports }) => exports).sort()).toEqual(
      [...RuntimeImports.agentScreenNames].sort(),
    );
  });
});
