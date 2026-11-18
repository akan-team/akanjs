import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { printedInOwnProcess, tempDirs, writeText as write } from "../test/testHelpers";
import { BarrelAnalyzer } from "./barrelAnalyzer";
import { createBarrelImportsPlugin } from "./barrelImportsPlugin";
import { type ObjectKeepReason, ObjectMemberImports } from "./objectMemberImports";
import { resolveModuleFile } from "./objectModuleAnalyzer";

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
    "ui/Observed/index.tsx": [
      'import { observer } from "./observer";',
      'import { A } from "./A";',
      'import { B } from "./B";',
      "export const Observed = { A: observer(A), B };",
    ].join("\n"),
    "ui/Observed/A.tsx": "export const A = () => null;\n",
    "ui/Observed/B.tsx": "export const B = () => null;\n",
    "ui/Observed/observer.ts": "export const observer = <T,>(value: T) => value;\n",
    "ui/settings.ts": "export const settings = { columns: 2 };\n",
    "ui/Runner/index.ts": [
      'import { run } from "./run";',
      'import { arrow, lexical, picked, plain } from "./free";',
      'export const Runner = { run, arrow, lexical, picked, plain, label: "runner" };',
    ].join("\n"),
    "ui/Runner/run.ts": "export function run(this: { label: string }) {\n  return this.label;\n}\n",
    "ui/Runner/free.ts": [
      "export const arrow = () => 1;",
      "export function plain() {",
      "  return [1].map(function (this: unknown) { return this; });",
      "}",
      "export function lexical() {",
      "  return () => this;",
      "}",
      "export const picked = [() => 1][0];",
    ].join("\n"),
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
    const memoKept = (reason: ObjectKeepReason, line = 2) => [
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
    expect(await keptFor('import { Observed } from "../ui/Observed";', "<Observed.B />")).toEqual([
      { object: "Observed", file: fileOf("ui/Observed/index.tsx"), line: 1, reason: "call" },
    ]);
  });

  test("keeps the whole object for a member called through it, unless the member's declaration reads no `this`", async () => {
    const { fileOf, rewrite } = await writeObjects();
    const runner = 'import { Runner } from "../ui/Runner";';
    const reasonsOf = async (use: string) =>
      (await rewrite([runner, `export const value = ${use};`]))?.kept.map(({ reason }) => reason);

    for (const use of [
      "Runner.run()",
      "Runner.run`x`",
      "(Runner.run)()",
      "Runner.run!()",
      "Runner.run?.()",
      "Runner.lexical()",
      "Runner.picked()",
    ])
      expect(await reasonsOf(use)).toEqual(["method-call"]);

    const result = await rewrite([
      runner,
      'import { Memo } from "../lib/memo";',
      'export const value = [Runner.arrow(), Runner.plain(), Runner.run, <Runner.run />, Runner.run.call({ label: "" })];',
      "export const removed = Memo.Util.Remove();",
    ]);
    expect(result?.kept).toEqual([]);
    expect(result?.narrowed.map(({ members }) => members)).toEqual([
      ["arrow()", "plain()", "run", "run.call()"],
      ["Util.Remove()"],
    ]);
    expect(result?.contents).toContain(
      '[Runner$arrow(), Runner$plain(), Runner$run, <Runner$run />, Runner$run.call({ label: "" })]',
    );
    expect(result?.contents).toContain(
      `import { run as Runner$run } from ${JSON.stringify(fileOf("ui/Runner/run.ts"))};`,
    );
  });

  test("keeps the whole object for a member written through it, by a loop or a destructuring assignment too", async () => {
    const { rewrite } = await writeObjects();
    const reasonsOf = async (body: string) =>
      (
        await rewrite([
          'import { Memo } from "../lib/memo";',
          "export const View = Memo.Zone.View;",
          `export const run = () => ${body};`,
        ])
      )?.kept.map(({ reason }) => reason);

    for (const body of [
      "{ for (Memo.Zone of [null]); }",
      "{ for (Memo.Zone in {}); }",
      "([Memo.Zone] = [null])",
      "([, ...Memo.Zone] = [])",
      "({ zone: Memo.Zone } = { zone: null })",
      "({ zone: [Memo.Zone = null] } = { zone: [] })",
      "({ ...Memo.Zone } = {})",
      "((Memo.Zone as unknown) = null)",
      "(Memo.Zone += 1)",
      "Memo.Zone++",
      "delete Memo.Zone",
    ])
      expect(await reasonsOf(body)).toEqual(["written"]);
    expect(
      await reasonsOf("{ for (const zone of [Memo.Zone]) return [[Memo.Zone.View], { zone: Memo.Zone }, zone]; }"),
    ).toEqual([]);
  });

  test("keeps the import of an object destructured into no names, which still reads it", async () => {
    const { fileOf, rewrite } = await writeObjects();

    const result = await rewrite([
      'import { Memo } from "../lib/memo";',
      "const {} = Memo;",
      "export const z = Memo.Zone;",
    ]);

    expect(result?.contents ?? null).toBeNull();
    expect(result?.kept).toEqual([{ object: "Memo", file: fileOf("lib/memo/index.ts"), line: 2, reason: "passed-on" }]);
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

const writeWrappers = async () => {
  const root = await realpath(await makeTempRoot());
  const client = (name: string) => `"use client";\nexport const ${name} = () => null;\n`;
  const plain = (name: string) => `export const ${name} = () => null;\n`;
  const copying = (name: string, from: string[], members = "{}") =>
    [
      ...from.map((source) => `import { ${source} } from "./${source}";`),
      `export const ${name} = Object.assign({}, ${[...from, members].join(", ")});`,
    ].join("\n");
  const files: Record<string, string> = {
    "ui/index.ts": 'export * from "./Field";\nexport * as Parts from "./Parts";\n',
    "ui/Parts.ts": plain("Text"),
    "ui/Field/index.tsx": [
      '"use client";',
      'import { Label } from "./Label";',
      'import { Text } from "./Text";',
      'import { Zone } from "./Zone";',
      "const FieldSection = () => null;",
      "export const Field = Object.assign(FieldSection, { Label, Text, Doc: { Zone } });",
    ].join("\n"),
    "ui/Field/Label.tsx": client("Label"),
    "ui/Field/Text.tsx": client("Text"),
    "ui/Field/TextNext.tsx": client("Text"),
    "ui/Field/Zone.tsx": client("Zone"),
    "ui/FieldNext/index.tsx": 'import { Text } from "./Text";\nexport const Field = { Text };\n',
    "ui/FieldNext/Text.tsx": plain("Text"),
    "wrap/Field.tsx": [
      '"use client";',
      'import { memo } from "react";',
      'import { Field as BaseField } from "../ui/Field";',
      'import { Editor } from "./Editor";',
      'import { Label } from "./Label";',
      'import { Upload } from "./Upload";',
      "const Rich = memo(() => <Editor />);",
      "const Section = () => <BaseField />;",
      "export const Field = Object.assign(Section, { Upload }, BaseField, { Rich, Label });",
    ].join("\n"),
    "wrap/Editor.tsx": client("Editor"),
    "wrap/Label.tsx": client("Label"),
    "wrap/Upload.tsx": client("Upload"),
    "barrel/Field.tsx": [
      'import { Field as BaseField } from "@demo/ui";',
      'import { Label } from "../wrap/Label";',
      "export const Field = Object.assign(() => null, BaseField, { Label });",
    ].join("\n"),
    "barrel/Parts.ts": [
      'import { Parts as BaseParts } from "@demo/ui";',
      'import { Label } from "../wrap/Label";',
      "export const Parts = Object.assign({}, BaseParts, { Label });",
    ].join("\n"),
    "copies/A.ts": plain("A"),
    "copies/B.ts": plain("B"),
    "copies/Shared.ts": plain("Shared"),
    "copies/SharedNext.ts": plain("Shared"),
    "copies/rest.ts": plain("Rest"),
    "copies/First.ts":
      'import { A } from "./A";\nimport { Shared } from "./Shared";\nexport const First = { A, Shared };\n',
    "copies/Second.ts":
      'import { B } from "./B";\nimport { Shared } from "./SharedNext";\nexport const Second = { B, Shared };\n',
    "copies/Both.ts": copying("Both", ["First", "Second"]),
    "copies/Failing.ts": 'import { A } from "./A";\nexport const Failing = { A };\nregister(Failing);\n',
    "copies/OverFailing.ts": `import { B } from "./B";\n${copying("OverFailing", ["Failing"], "{ B }")}`,
    "copies/Open.ts":
      'import { A } from "./A";\nimport * as rest from "./rest";\nexport const Open = { ...rest, A };\n',
    "copies/OverOpen.ts": copying("OverOpen", ["Open"]),
    "copies/Plain.ts": plain("Plain"),
    "copies/OverPlain.ts": `import { B } from "./B";\n${copying("OverPlain", ["Plain"], "{ B }")}`,
    "copies/Left.ts": `import { A } from "./A";\n${copying("Left", ["Right"], "{ A }")}`,
    "copies/Right.ts": `import { B } from "./B";\n${copying("Right", ["Left"], "{ B }")}`,
    "copies/Deep5.ts": 'import { A } from "./A";\nexport const Deep5 = { A };\n',
    ...Object.fromEntries(
      [1, 2, 3, 4].map((depth) => [`copies/Deep${depth}.ts`, copying(`Deep${depth}`, [`Deep${depth + 1}`])]),
    ),
    "copies/Deep0.ts": `import { B } from "./B";\n${copying("Deep0", ["Deep1"], "{ B }")}`,
    "copies/Values.ts": "export const Values = { columns: 2 };\n",
    "copies/OverValues.ts": copying("OverValues", ["Values"], "{ rows: 3 }"),
    "boundary/Server.ts": 'import { Part } from "./Part";\nexport const Server = { Part };\n',
    "boundary/Client.ts": '"use client";\nimport { Part } from "./Part";\nexport const Client = { Part };\n',
    "boundary/Part.tsx": plain("Part"),
    "boundary/ClientOverServer.ts": `"use client";\n${copying("ClientOverServer", ["Server"])}`,
    "boundary/ServerOverClient.ts": copying("ServerOverClient", ["Client"]),
  };
  for (const [file, content] of Object.entries(files)) await write(path.join(root, file), content);
  const fileOf = (file: string) => path.join(root, file);
  const resolvePackage = async (pkgName: string) => {
    if (pkgName !== "@demo/ui" && !pkgName.startsWith("@demo/ui/")) return null;
    const entryFile = await resolveModuleFile(fileOf("x"), `./ui${pkgName.slice("@demo/ui".length)}`);
    return entryFile ? { pkgName, entryFile, pkgDir: fileOf("ui") } : null;
  };
  const objectsOf = ({ barrels = ["@demo/ui"] }: { barrels?: string[] } = {}) =>
    new ObjectMemberImports({
      resolve: ObjectMemberImports.resolverOf(resolvePackage),
      barrels: { names: barrels, analyzer: new BarrelAnalyzer({ resolvePackage }) },
    });
  const rewrite = (lines: string[], objects = objectsOf()) =>
    objects.rewrite(lines.join("\n"), fileOf("page/_index.tsx"));
  const answerOf = async (
    object: string,
    member: string,
    { dir = "copies", head = "" } = {},
  ): Promise<string | null> => {
    const result = await rewrite([
      `${head}import { ${object} } from "../${dir}/${object}";`,
      `export const value = ${object}.${member};`,
    ]);
    const [kept] = result?.kept ?? [];
    const narrowedTo = result?.contents?.match(/ from "([^"]+)";/)?.[1];
    return kept?.reason ?? (narrowedTo ? path.relative(root, narrowedTo) : null);
  };
  return { root, fileOf, objectsOf, rewrite, answerOf };
};

describe("ObjectMemberImports on an object that copies an imported one in", () => {
  test("imports a member of the copied object from that object's part file, and a member the wrapper lists after the copy from the wrapper's", async () => {
    const { root, fileOf, rewrite } = await writeWrappers();

    const result = await rewrite([
      'import { Field } from "../wrap/Field";',
      "export const Page = () => <Field.Text><Field.Label /><Field.Doc.Zone /></Field.Text>;",
    ]);

    expect(result?.contents?.split("\n")).toEqual([
      `import { Text as Field$Text } from ${JSON.stringify(fileOf("ui/Field/Text.tsx"))};`,
      `import { Label as Field$Label } from ${JSON.stringify(fileOf("wrap/Label.tsx"))};`,
      `import { Zone as Field$Doc$Zone } from ${JSON.stringify(fileOf("ui/Field/Zone.tsx"))};`,
      "export const Page = () => <Field$Text><Field$Label /><Field$Doc$Zone /></Field$Text>;",
    ]);
    expect(result?.narrowed).toEqual([
      { object: "Field", file: fileOf("wrap/Field.tsx"), members: ["Doc.Zone", "Label", "Text"] },
    ]);
    expect(result?.read.map((file) => path.relative(root, file)).sort()).toEqual([
      "ui/Field/Text.tsx",
      "ui/Field/Zone.tsx",
      "ui/Field/index.tsx",
      "wrap/Field.tsx",
      "wrap/Label.tsx",
    ]);
  });

  test("keeps the whole wrapper for a member declared in its own file, one it lists before the copy, and one no object holds", async () => {
    const { answerOf } = await writeWrappers();

    for (const member of ["Rich", "Upload", "Missing", "Doc.Missing"])
      expect(await answerOf("Field", member, { dir: "wrap" })).toBe("unresolved-member");
  });

  test("reads two copied objects last one first, as `Object.assign` lets the later source win", async () => {
    const { answerOf } = await writeWrappers();

    expect(await answerOf("Both", "A")).toBe("copies/A.ts");
    expect(await answerOf("Both", "B")).toBe("copies/B.ts");
    expect(await answerOf("Both", "Shared")).toBe("copies/SharedNext.ts");
    expect(await answerOf("Both", "Missing")).toBe("unresolved-member");
  });

  test("keeps the whole wrapper for a member of a copied object whose module fails the rule, lists no such member, or is no object module", async () => {
    const { answerOf } = await writeWrappers();

    expect(await answerOf("OverFailing", "A")).toBe("effect-statement");
    expect(await answerOf("OverFailing", "B")).toBe("copies/B.ts");
    expect(await answerOf("OverOpen", "A")).toBe("copies/A.ts");
    expect(await answerOf("OverOpen", "Rest")).toBe("unresolved-member");
    expect(await answerOf("OverPlain", "B")).toBe("copies/B.ts");
    expect(await answerOf("OverPlain", "displayName")).toBe("unresolved-member");
  });

  test("stops at an object that copies itself in through another, and four copies down", async () => {
    const { answerOf } = await writeWrappers();

    expect(await answerOf("Left", "A")).toBe("copies/A.ts");
    expect(await answerOf("Left", "B")).toBe("copies/B.ts");
    expect(await answerOf("Left", "Missing")).toBe("unresolved-member");
    expect(await answerOf("Deep1", "A")).toBe("copies/A.ts");
    expect(await answerOf("Deep0", "A")).toBe("unresolved-member");
    expect(await answerOf("Deep0", "B")).toBe("copies/B.ts");
  });

  test("leaves a wrapper alone when neither it nor an object it copies in points a member at a file", async () => {
    const { rewrite } = await writeWrappers();

    expect(
      await rewrite(['import { OverValues } from "../copies/OverValues";', "export const n = OverValues.columns;"]),
    ).toBeNull();
  });

  test("finds an object copied in from a barrel at the file the barrel declares it in, as an importer's own barrel import is", async () => {
    const { fileOf, objectsOf, rewrite } = await writeWrappers();
    const lines = ['import { Field } from "../barrel/Field";', "export const Page = () => <Field.Text />;"];

    const narrowed = await rewrite(lines);
    const unlisted = await rewrite(lines, objectsOf({ barrels: [] }));
    const namespace = await rewrite(['import { Parts } from "../barrel/Parts";', "export const text = Parts.Text;"]);

    expect(narrowed?.contents).toContain(
      `import { Text as Field$Text } from ${JSON.stringify(fileOf("ui/Field/Text.tsx"))};`,
    );
    expect(narrowed?.barrels).toEqual(["@demo/ui"]);
    expect(unlisted?.kept.map(({ reason }) => reason)).toEqual(["unresolved-member"]);
    expect(unlisted?.barrels).toEqual([]);
    expect(namespace?.kept.map(({ reason }) => reason)).toEqual(["unresolved-member"]);
  });

  test('narrows past a "use client" module anywhere between a server importer and the member only to a client file', async () => {
    const { answerOf } = await writeWrappers();
    const client = { dir: "boundary", head: '"use client";\n' };

    expect(await answerOf("Field", "Text", { dir: "wrap" })).toBe("ui/Field/Text.tsx");
    expect(await answerOf("ClientOverServer", "Part", { dir: "boundary" })).toBe("server-boundary");
    expect(await answerOf("ServerOverClient", "Part", { dir: "boundary" })).toBe("server-boundary");
    expect(await answerOf("ClientOverServer", "Part", client)).toBe("boundary/Part.tsx");
    expect(await answerOf("ServerOverClient", "Part", client)).toBe("boundary/Part.tsx");
  });

  test("counts the copied object's module, its part files and the barrel among a wrapper's files, so a part moved there moves the wrapper's digest and fingerprint", async () => {
    const { root, fileOf, objectsOf } = await writeWrappers();
    const wrapper = fileOf("barrel/Field.tsx");
    const stateOf = async () => {
      const objects = objectsOf();
      return [await objects.digest(wrapper), await objects.fingerprint(wrapper, "Field", ["Text"], true)];
    };

    const files = await objectsOf().filesOf(wrapper);
    expect(new Set(files.map((file) => path.relative(root, file)))).toEqual(
      new Set([
        "barrel/Field.tsx",
        "ui/Field/Label.tsx",
        "ui/Field/Text.tsx",
        "ui/Field/Zone.tsx",
        "ui/Field/index.tsx",
        "ui/index.ts",
        "wrap/Label.tsx",
      ]),
    );
    const before = await stateOf();
    await write(fileOf("ui/Field/Text.tsx"), '"use client";\nexport const Text = () => "saved";\n');
    expect(await stateOf()).toEqual(before);

    const index = await Bun.file(fileOf("ui/Field/index.tsx")).text();
    await write(fileOf("ui/Field/index.tsx"), index.replace("./Text", "./TextNext"));
    const moved = await stateOf();
    expect(moved[0]).not.toBe(before[0]);
    expect(moved[1]).not.toBe(before[1]);

    await write(fileOf("ui/index.ts"), 'export * from "./FieldNext";\n');
    const redeclared = await stateOf();
    expect(redeclared[0]).not.toBe(moved[0]);
    expect(redeclared[1]).not.toBe(moved[1]);
  });

  test("a bundle built with the barrel plugin holds the parts a page names through such a wrapper, and neither the wrapper nor the copied object", async () => {
    const { root, fileOf } = await writeWrappers();
    await write(
      fileOf("page/_index.tsx"),
      'import { Field } from "../barrel/Field";\nexport const parts = [Field.Text, Field.Label];\n',
    );
    const app = {
      name: "demo",
      cwdPath: root,
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ barrelImports: ["@demo/ui"] }),
      getTsConfig: async () => ({
        compilerOptions: { paths: { "@demo/ui": ["./ui/index.ts"], "@demo/ui/*": ["./ui/*"] } },
      }),
    };

    const built = await Bun.build({
      entrypoints: [fileOf("page/_index.tsx")],
      target: "browser",
      metafile: true,
      throw: true,
      plugins: [await createBarrelImportsPlugin(app as never)],
    });

    const inputs = Object.keys(built.metafile?.inputs ?? {}).map((input) => path.relative(root, path.resolve(input)));
    expect(inputs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      "page/_index.tsx",
      "ui/Field/Text.tsx",
      "wrap/Label.tsx",
    ]);
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
  getConfig: async () => ({ barrelImports: [], optimizeImports: [] }),
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
