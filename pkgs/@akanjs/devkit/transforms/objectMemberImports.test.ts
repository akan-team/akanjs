import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { printedInOwnProcess, tempDirs, writeText as write } from "../test/testHelpers";
import { ObjectMemberImports } from "./objectMemberImports";

const makeTempRoot = tempDirs("akan-object-member-imports-");

const writeObjects = async () => {
  const root = await realpath(await makeTempRoot());
  const files: Record<string, string> = {
    "lib/memo/index.ts": [
      'import * as Template from "./Memo.Template";',
      'import * as Util from "./Memo.Util";',
      'import * as Zone from "./Memo.Zone";',
      "export const Memo = { Template, Util, Zone };",
    ].join("\n"),
    "lib/memo/Memo.Template.tsx": '"use client";\nexport const General = () => null;\n',
    "lib/memo/Memo.Util.tsx":
      '"use client";\nexport const Remove = () => null;\nexport const AttachImage = () => null;\n',
    "lib/memo/Memo.Zone.tsx": '"use client";\nexport const View = () => null;\n',
    "ui/Field/index.tsx": 'import { Text } from "./Text";\nexport const Field = { Text };\n',
    "ui/Field/Text.tsx": "export const Text = () => null;\n",
    "ui/Constant/index.ts": 'import { Zone } from "./Doc";\nexport const Constant = { Doc: { Zone } };\n',
    "ui/Constant/Doc.tsx": "export const Zone = () => null;\n",
    "ui/Scroll/index.tsx": [
      'import { Render } from "./Render";',
      "export const Scroll = () => null;",
      "Scroll.Render = Render;",
    ].join("\n"),
    "ui/Scroll/Render.tsx": "export const Render = () => null;\n",
    "ui/Boundary/index.tsx": '"use client";\nimport { Part } from "./Part";\nexport const Boundary = { Part };\n',
    "ui/Boundary/Part.tsx": "export const Part = () => null;\n",
    "ui/Memoed/index.tsx": [
      'import { memo } from "react";',
      'import { A } from "./A";',
      'import { B } from "./B";',
      "export const Memoed = { A: memo(A), B };",
    ].join("\n"),
    "ui/Memoed/A.tsx": "export const A = () => null;\n",
    "ui/Memoed/B.tsx": "export const B = () => null;\n",
    "ui/settings.ts": "export const settings = { columns: 2 };\n",
  };
  for (const [file, content] of Object.entries(files)) await write(path.join(root, file), content);
  const objects = new ObjectMemberImports({ resolve: ObjectMemberImports.resolverOf(async () => null) });
  const importer = path.join(root, "page/_index.tsx");
  const fileOf = (file: string) => path.join(root, file);
  const rewrite = (lines: string[]) => objects.rewrite(lines.join("\n"), importer);
  return { root, fileOf, rewrite };
};

describe("ObjectMemberImports", () => {
  test("imports each part a page writes out from the part file, in JSX and in code", async () => {
    const { fileOf, rewrite } = await writeObjects();

    const result = await rewrite([
      'import { Memo } from "../lib/memo";',
      "export const Page = () => (",
      "  <Memo.Zone.View>",
      "    <Memo.Util.Remove />",
      "  </Memo.Zone.View>",
      ");",
      "export const parts = Memo.Util;",
    ]);

    expect(result?.contents).toBe(
      [
        `import { View as Memo$Zone$View } from ${JSON.stringify(fileOf("lib/memo/Memo.Zone.tsx"))};`,
        `import { Remove as Memo$Util$Remove } from ${JSON.stringify(fileOf("lib/memo/Memo.Util.tsx"))};`,
        `import * as Memo$Util from ${JSON.stringify(fileOf("lib/memo/Memo.Util.tsx"))};`,
        "export const Page = () => (",
        "  <Memo$Zone$View>",
        "    <Memo$Util$Remove />",
        "  </Memo$Zone$View>",
        ");",
        "export const parts = Memo$Util;",
      ].join("\n"),
    );
    expect(result?.narrowed).toEqual([
      { object: "Memo", file: fileOf("lib/memo/index.ts"), members: ["Util", "Util.Remove", "Zone.View"] },
    ]);
    expect(result?.contents).not.toContain("Memo.Template");
  });

  test("reads a destructured part, a framework member, a member one level down and a type use", async () => {
    const { fileOf, rewrite } = await writeObjects();

    const result = await rewrite([
      'import { Memo } from "../lib/memo";',
      'import { Field } from "../ui/Field";',
      'import { Constant } from "../ui/Constant";',
      "type Parts = typeof Memo;",
      "const { Util } = Memo;",
      "export const Page = () => <Field.Text><Constant.Doc.Zone /><Util.Remove /></Field.Text>;",
    ]);

    expect(result?.contents?.split("\n").slice(0, 5)).toEqual([
      'import type { Memo } from "../lib/memo";',
      `import * as Memo$Util from ${JSON.stringify(fileOf("lib/memo/Memo.Util.tsx"))};`,
      `import { Text as Field$Text } from ${JSON.stringify(fileOf("ui/Field/Text.tsx"))};`,
      `import { Zone as Constant$Doc$Zone } from ${JSON.stringify(fileOf("ui/Constant/Doc.tsx"))};`,
      "type Parts = typeof Memo;",
    ]);
    expect(result?.contents).toContain("const { Util } = { Util: Memo$Util };");
    expect(result?.contents).toContain("<Field$Text><Constant$Doc$Zone /><Util.Remove /></Field$Text>");
    expect(result?.kept).toEqual([]);
  });

  test("keeps the whole object for a use it cannot read ahead of time, and says why", async () => {
    const { fileOf, rewrite } = await writeObjects();
    const keptFor = async (imports: string, use: string) => {
      const result = await rewrite([imports, `export const run = (key: string) => ${use};`]);
      expect(result?.contents ?? null).toBeNull();
      return result?.kept.map(({ object, file, line, reason }) => ({ object, file, line, reason }));
    };
    const memo = 'import { Memo } from "../lib/memo";';
    const memoKept = (reason: string, line = 2) => [
      { object: "Memo", file: fileOf("lib/memo/index.ts"), line, reason },
    ];
    const withMember = (use: string) => `[Memo.Zone.View, ${use}]`;

    expect(await keptFor(memo, withMember("use(Memo)"))).toEqual(memoKept("passed-on"));
    expect(await keptFor(memo, "Memo?.Zone")).toEqual(memoKept("passed-on"));
    expect(await keptFor(memo, withMember("Memo[key]"))).toEqual(memoKept("computed-member"));
    expect(await keptFor(memo, withMember("({ ...Memo })"))).toEqual(memoKept("spread"));
    expect(await keptFor(memo, "(() => { const { Util, ...rest } = Memo; return rest; })()")).toEqual(
      memoKept("spread"),
    );
    expect(await keptFor(memo, "(Memo.Zone = null)")).toEqual(memoKept("written"));
    expect(await keptFor(memo, "Memo.Missing")).toEqual(memoKept("unresolved-member"));
    expect(await keptFor(memo, withMember("((Memo) => Memo.Zone)(null)"))).toEqual(memoKept("shadowed", 1));
    expect(await keptFor('import { Scroll } from "../ui/Scroll";', "<Scroll><Scroll.Render /></Scroll>")).toEqual([
      { object: "Scroll", file: fileOf("ui/Scroll/index.tsx"), line: 2, reason: "rendered-or-called" },
    ]);
    expect(await keptFor('import { Memoed } from "../ui/Memoed";', "<Memoed.B />")).toEqual([
      { object: "Memoed", file: fileOf("ui/Memoed/index.tsx"), line: 1, reason: "call" },
    ]);
  });

  test('narrows a member past a "use client" object only for a client importer, so a server page keeps its reference', async () => {
    const { fileOf, rewrite } = await writeObjects();
    const lines = ['import { Boundary } from "../ui/Boundary";', "export const Page = () => <Boundary.Part />;"];

    const server = await rewrite(lines);
    const client = await rewrite(['"use client";', ...lines]);

    expect(server?.contents ?? null).toBeNull();
    expect(server?.kept.map(({ reason }) => reason)).toEqual(["server-boundary"]);
    expect(client?.clientImporter).toBe(true);
    expect(client?.contents).toContain(
      `import { Part as Boundary$Part } from ${JSON.stringify(fileOf("ui/Boundary/Part.tsx"))};`,
    );
  });

  test("leaves an object of plain values alone, which has no file to point a member at", async () => {
    const { rewrite } = await writeObjects();

    expect(
      await rewrite(['import { settings } from "../ui/settings";', "export const n = settings.columns;"]),
    ).toBeNull();
  });
});

describe("ObjectMemberImports on a server-rendered page", () => {
  const repoRoot = path.resolve(import.meta.dir, "../../../..");

  test("a server page writing an object's part renders a client reference to the part's file, and its bundle holds no other part", async () => {
    const { root } = await writeObjects();
    await mkdir(path.join(root, "node_modules"));
    for (const name of ["react", "react-dom", "react-server-dom-webpack"])
      await symlink(path.join(repoRoot, "node_modules", name), path.join(root, "node_modules", name));
    await write(
      path.join(root, "lib/memo/Memo.Zone.tsx"),
      '"use client";\nexport const View = (props: { label: string }) => props.label;\n',
    );
    await write(
      path.join(root, "ui/Panel/index.tsx"),
      '"use client";\nimport { Body } from "./Body";\nexport const Panel = { Body };\n',
    );
    await write(path.join(root, "ui/Panel/Body.tsx"), '"use client";\nexport const Body = () => null;\n');
    await write(
      path.join(root, "page/_index.tsx"),
      [
        'import { Memo } from "../lib/memo";',
        'import { Panel } from "../ui/Panel";',
        'export const Page = () => <main><Memo.Zone.View label="zone" /><Panel.Body /></main>;',
      ].join("\n"),
    );
    await write(
      path.join(root, "render.tsx"),
      [
        'import { renderToReadableStream } from "react-server-dom-webpack/server.node";',
        'import { Page } from "./page/_index";',
        "export const render = (manifest: object, onError: (error: Error) => void) =>",
        "  renderToReadableStream(<Page />, manifest, { onError });",
      ].join("\n"),
    );

    const rendered = await printedInOwnProcess(
      `
const { createBarrelImportsPlugin } = await import(${JSON.stringify(path.join(import.meta.dir, "barrelImportsPlugin.ts"))});
const { transformUseClient } = await import(${JSON.stringify(path.join(import.meta.dir, "rscUseClientTransform.ts"))});
const root = ${JSON.stringify(root)};
const app = {
  name: "demo",
  cwdPath: root,
  workspace: { workspaceRoot: root },
  getConfig: async () => ({ barrelImports: [], optimizeImports: [], clientRuntime: "route" }),
  getTsConfig: async () => ({ compilerOptions: { paths: {} } }),
};
const reported = new Map();
const plugin = await createBarrelImportsPlugin(app, {
  pipeAfter: (source, args) =>
    transformUseClient(source, { path: args.path, workspaceRoot: root, onClientModule: (file, names) => reported.set(file, names) }),
});
const built = await Bun.build({
  entrypoints: [root + "/render.tsx"],
  outdir: root + "/dist",
  target: "bun",
  conditions: ["react-server"],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [plugin],
});
if (!built.success) throw new AggregateError(built.logs, "the server bundle failed");
const manifest = {};
for (const [file, names] of reported) {
  const reference = file.slice(root.length + 1);
  for (const name of names) manifest[reference + "#" + name] = { id: "/client/" + reference, chunks: [], name, async: true };
}
const errors = [];
const { render } = await import(built.outputs[0].path);
const flight = await new Response(render(manifest, (error) => errors.push(error.message))).text();
const rows = new Map(flight.split("\\n").filter(Boolean).map((row) => [row.slice(0, row.indexOf(":")), row.slice(row.indexOf(":") + 1)]));
const outlined = (value) => (/^\\$[0-9a-f]+$/.test(value) ? JSON.parse(rows.get(value.slice(1))) : value);
console.log(JSON.stringify({
  clientModules: Object.keys(manifest).sort(),
  references: [...rows.values()].filter((row) => row.startsWith("I[")).map((row) => outlined(JSON.parse(row.slice(1))[0])).sort(),
  errors,
  bundleNamesTemplate: (await built.outputs[0].text()).includes("Memo.Template"),
}));
`,
      root,
    );

    expect(rendered).toEqual({
      clientModules: ["lib/memo/Memo.Zone.tsx#View", "ui/Panel/Body.tsx#Body"],
      references: ["/client/lib/memo/Memo.Zone.tsx", "/client/ui/Panel/Body.tsx"],
      errors: [],
      bundleNamesTemplate: false,
    });
  }, 30_000);
});
