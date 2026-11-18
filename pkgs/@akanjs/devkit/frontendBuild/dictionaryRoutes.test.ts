import { describe, expect, test } from "bun:test";
import path from "node:path";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
import { tempDirs, writeText } from "../test/testHelpers";
import { RouteRuntime } from "../transforms/routeRuntime";
import type { ClientModuleImport } from "./clientBuildTypes";
import { DictionaryAssetBuilder } from "./dictionaryAssetBuilder";
import { DictionaryConstants } from "./dictionaryConstants";
import { type DictionaryPiecesOf, DictionaryRoutes } from "./dictionaryRoutes";
import { RouteHandoffs } from "./routeHandoffs";

const makeRoot = tempDirs("akan-devkit-dict-routes-");

const constantsOf = () => {
  const constants = new DictionaryConstants();
  constants.add(
    "apps/demo/lib/memo/memo.constant.ts",
    `export class MemoStatus extends enumOf("memoStatus", ["draft", "done"] as const) {}
export class MemoInput extends via((field) => ({ status: field(MemoStatus), place: field(Address), author: field(User) })) {}
export class Memo extends via(MemoInput, (field) => ({})) {}
`,
  );
  constants.add(
    "apps/demo/lib/user/user.constant.ts",
    `export class UserRole extends enumOf("userRole", ["admin", "member"] as const) {}
export class UserInput extends via((field) => ({ role: field(UserRole), team: field(Team) })) {}
export class User extends via(UserInput, (field) => ({})) {}
`,
  );
  constants.add(
    "apps/demo/lib/team/team.constant.ts",
    `export class Team extends via((field) => ({ name: field(String) })) {}`,
  );
  constants.add(
    "apps/demo/lib/__scalar/address/address.constant.ts",
    `export class Address extends via((field) => ({ city: field(String) })) {}`,
  );
  constants.add(
    "apps/demo/lib/runnerBot/runnerBot.constant.ts",
    `export class RunnerBot extends via((field) => ({ name: field(String) })) {
  static readonly labelKeyOf = { reviewer: "runnerBot.reviewer", fixer: "task.fixer" } as const;
  static stageKeys = ["project.stage.open", "project.stage.done"] as const satisfies readonly string[];
  static loose = { reviewer: "runnerBot.reviewer" };
  static typed: Record<string, string> = { reviewer: "runnerBot.reviewer" } as const;
  static called = { reviewer: "runnerBot.reviewer", fixer: keyOf("fixer") } as const;
  static computed = { reviewer: "runnerBot.reviewer", [fixer]: "runnerBot.fixer" } as const;
  static spread = [...RunnerBotRole.values, "runnerBot.fixer"] as const;
  static nested = { reviewer: { label: "runnerBot.reviewer" } } as const;
  static get made() { return { reviewer: "runnerBot.reviewer" } as const; }
  held = { reviewer: "runnerBot.reviewer" } as const;
}
`,
  );
  return constants;
};

const workspace = async (files: Record<string, string>) => {
  const root = await makeRoot();
  for (const [rel, text] of Object.entries(files)) await writeText(path.join(root, rel), text);
  const abs = (rel: string) => path.join(root, rel);
  return { root, abs };
};

const reader = (root: string, imports: Record<string, string[]>, piecesOf?: DictionaryPiecesOf): DictionaryRoutes => {
  const importsByModule = new Map<string, ClientModuleImport[]>(
    Object.entries(imports).map(([from, to]) => [
      path.join(root, from),
      to.map((rel) => ({ path: path.join(root, rel), lazy: false })),
    ]),
  );
  return new DictionaryRoutes(root, { importsByModule, constants: constantsOf(), ...(piecesOf ? { piecesOf } : {}) });
};

describe("DictionaryRoutes", () => {
  test("a route shows the framework's own texts even when its client modules name no key", async () => {
    const { root, abs } = await workspace({ "apps/demo/page/Plain.tsx": `export const Plain = () => <div />;` });
    const read = reader(root, {}).read({ entries: [abs("apps/demo/page/Plain.tsx")] });

    expect(read).toEqual({ groups: ["base"], api: false, whole: null });
  });

  test("a route loading a module's client runtime shows its model, enums, scalars and the models it refers to", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Memo.tsx": `export const Page = () => <>{l("memo.modelName")}</>;`,
    });
    const read = reader(root, { "apps/demo/page/Memo.tsx": ["apps/demo/lib/__client/memo.st.ts"] }).read({
      entries: [abs("apps/demo/page/Memo.tsx")],
    });

    expect(read.whole).toBeNull();
    expect(read.groups).toEqual(["address", "base", "memo", "memoStatus", "user", "userRole"]);
  });

  test("a route naming an enum's class shows that enum's texts, through the files its entry imports", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Status.tsx": `export const Page = () => <Badge />;`,
      "apps/demo/ui/Badge.tsx": `export const Badge = () => <Select options={MemoStatus.values} label={l("shared.status")} />;`,
    });
    const read = reader(root, { "apps/demo/page/Status.tsx": ["apps/demo/ui/Badge.tsx"] }).read({
      entries: [abs("apps/demo/page/Status.tsx")],
    });

    expect(read.groups).toEqual(expect.arrayContaining(["base", "memoStatus", "shared"]));
    expect(read.groups).not.toContain("memo");
  });

  test("a route with a key the build cannot follow loads the whole dictionary, naming the file and line", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Any.tsx": `export const Page = () => <Label name="memo" />;`,
      "apps/demo/ui/Label.tsx": [
        `export const Label = ({ name }: { name: string }) => {`,
        `  const { l } = usePage();`,
        `  return <>{l(name)}</>;`,
        `};`,
      ].join("\n"),
    });
    const read = reader(root, { "apps/demo/page/Any.tsx": ["apps/demo/ui/Label.tsx"] }).read({
      entries: [abs("apps/demo/page/Any.tsx")],
    });

    expect(read.groups).toEqual([]);
    expect(read.whole).toEqual({
      file: "apps/demo/ui/Label.tsx",
      line: 3,
      why: "name is a parameter or prop whose type names no key",
    });
    expect(read.whole && DictionaryRoutes.pinned(read.whole)).toBe(
      "apps/demo/ui/Label.tsx:3 name is a parameter or prop whose type names no key",
    );
  });

  test("a route loading every module's client runtime loads the whole dictionary, unless the build tells it which", async () => {
    const files = {
      "apps/demo/page/Memo.tsx": `export const Page = () => <>{st.use.memo()}</>;`,
      "apps/demo/lib/memo/memo.store.ts": `export class MemoStore { label = "memo.title"; }`,
    };
    const { root, abs } = await workspace(files);
    const imports = { "apps/demo/page/Memo.tsx": ["apps/demo/lib/st.ts"] };
    const entries = [abs("apps/demo/page/Memo.tsx")];

    expect(reader(root, imports).read({ entries }).whole).toEqual({
      file: "apps/demo/lib/st.ts",
      why: "loads every module's client runtime",
    });
    const piecesOf: DictionaryPiecesOf = () => ({ perModule: true, pieces: ["apps/demo/lib/__client/memo.st"] });
    const read = reader(root, imports, piecesOf).read({ entries });
    expect(read.whole).toBeNull();
    expect(read.groups).toEqual(["address", "base", "memo", "memoStatus", "user", "userRole"]);
    const everyModule: DictionaryPiecesOf = () => ({ perModule: false, pieces: [] });
    expect(reader(root, imports, everyModule).read({ entries }).whole?.why).toBe("needs every module's client runtime");
  });

  test("a server module handing a client component a model's name adds that group, and a framework surface showing any module loads the whole dictionary", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Client.tsx": `export const Client = () => null;`,
      "apps/demo/page/Server.tsx": `export const Page = () => <Load.View modelName="team" />;`,
      "apps/demo/page/Explorer.tsx": `import { Signal } from "akanjs/ui";\nexport const Page = () => <Signal.Doc />;`,
    });
    const routes = reader(root, {});
    const entries = [abs("apps/demo/page/Client.tsx")];

    expect(routes.read({ entries, serverModules: [abs("apps/demo/page/Server.tsx")] }).groups).toEqual([
      "base",
      "team",
    ]);
    expect(routes.read({ entries, serverModules: [abs("apps/demo/page/Explorer.tsx")] }).whole).toEqual({
      file: "apps/demo/page/Explorer.tsx",
      why: "Signal from akanjs/ui shows the texts of any module its data names",
    });
  });

  test("a constant class's static table gives its written keys only when every entry is one", () => {
    const constants = constantsOf();
    expect(constants.staticKeysOf("RunnerBot", "labelKeyOf")).toEqual(["runnerBot.reviewer", "task.fixer"]);
    expect(constants.staticKeysOf("RunnerBot", "stageKeys")).toEqual(["project.stage.open", "project.stage.done"]);
    for (const member of ["loose", "typed", "called", "computed", "spread", "nested", "made", "held", "missing"])
      expect(constants.staticKeysOf("RunnerBot", member), member).toBeNull();
    expect(constants.staticKeysOf("Missing", "labelKeyOf")).toBeNull();

    constants.add(
      "libs/shared/lib/runnerBot/runnerBot.constant.ts",
      `export class RunnerBot {
  static readonly labelKeyOf = { planner: "runnerBot.planner", fixer: "task.fixer" } as const;
  static stageKeys = load();
}
`,
    );
    expect(constants.staticKeysOf("RunnerBot", "labelKeyOf")).toEqual([
      "runnerBot.reviewer",
      "task.fixer",
      "runnerBot.planner",
    ]);
    expect(constants.staticKeysOf("RunnerBot", "stageKeys")).toBeNull();

    constants.add("libs/util/lib/runnerBot/runnerBot.constant.ts", `export class RunnerBot extends BaseBot {}`);
    expect(constants.staticKeysOf("RunnerBot", "labelKeyOf")).toBeNull();
  });

  test("a route picking a key from a constant class's static table shows the groups its keys name", async () => {
    const page = (table: string) =>
      [
        `import { cnst } from "@apps/demo/client";`,
        `export const Page = ({ role }: { role: string }) => <>{l(cnst.RunnerBot.${table}[role])}</>;`,
      ].join("\n");
    const { root, abs } = await workspace({
      "apps/demo/page/Bots.tsx": page("labelKeyOf"),
      "apps/demo/page/Loose.tsx": page("loose"),
    });
    const routes = reader(root, {});

    const read = routes.read({ entries: [abs("apps/demo/page/Bots.tsx")] });
    expect(read.whole).toBeNull();
    expect(read.groups).toEqual(["base", "runnerBot", "task"]);
    expect(routes.read({ entries: [abs("apps/demo/page/Loose.tsx")] }).whole).toEqual({
      file: "apps/demo/page/Loose.tsx",
      line: 2,
      why: "cnst.RunnerBot.loose[role] is read from data at run time",
    });
  });

  test("a route naming an API description key says so, for the API description file", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Api.tsx": `export const Page = () => <>{l("memo.signal.getMemo.desc")}</>;`,
    });
    const read = reader(root, {}).read({ entries: [abs("apps/demo/page/Api.tsx")] });

    expect(read.api).toBe(true);
    expect(read.groups).toEqual([DictionaryAssetBuilder.apiGroup, "base", "memo"]);
  });

  test("a development route counts the model references its server modules hand over, not every one the root layout imports", async () => {
    const { root, abs } = await workspace({
      "apps/demo/page/Notes.tsx": `import { fetch } from "@apps/demo/client";\nexport const Page = (id: string) => fetch.viewNote(id);\n`,
      "apps/demo/ui/Plain.tsx": `"use client";\nexport const Plain = () => null;\n`,
    });
    const { demo } = await runtimeFixtureTables();
    const referenceOf = (model: string) => abs(`apps/demo/lib/__client/${model}.ref.ts`);
    const handoffs = new RouteHandoffs(
      root,
      new RouteRuntime(root, demo, new Set()),
      new Map(["memo", "note"].map((model) => [model, referenceOf(model)])),
    );
    const discovered = [abs("apps/demo/ui/Plain.tsx"), referenceOf("memo"), referenceOf("note")];
    const serverModules = [abs("apps/demo/page/Notes.tsx")];

    const entries = await DictionaryRoutes.handedEntries(discovered, serverModules, handoffs);
    expect(entries).toEqual([abs("apps/demo/ui/Plain.tsx"), referenceOf("note")]);
    expect(reader(root, {}).read({ entries }).groups).toEqual(["base", "note"]);
    expect(await DictionaryRoutes.handedEntries(discovered, serverModules, null)).toEqual(discovered);
  });
});
