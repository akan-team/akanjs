import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { RenderMutationScanner } from "./renderMutationScanner";
import { SignalMutationIndex } from "./signalMutationIndex";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
});

const signal = fileOf(
  "apps/demo/lib/item/item.signal.ts",
  `
export class ItemSlice extends slice(srv.item, { guards: { root: Admin, get: Public, cru: User } }, () => ({})) {}
export class ItemEndpoint extends endpoint(srv.item, ({ query, mutation }) => ({
  approveItem: mutation(cnst.Item, { guards: [User] }).param("itemId", ID).exec(async function (itemId) {
    return await this.itemService.approve(itemId);
  }),
  itemCount: query(Int, { guards: [User] }).exec(async function () {
    return 0;
  }),
})) {}
`,
);

const PAGE = "apps/demo/page/item/[itemId].tsx";
const pageOf = (chain: string, file = PAGE) =>
  fileOf(
    file,
    `import { fetch, usePage } from "@apps/demo/client";\nimport { ID } from "akanjs/base";\nimport { page } from "akanjs/client";\n\nexport default ${chain};\n`,
  );

const scan = (...files: SourceFileInfo[]) =>
  new RenderMutationScanner(new SignalMutationIndex([signal, ...files])).scan(files);

describe("akan.ssr.render-mutation", () => {
  test("flags one diagnostic per mutation a render sends, awaited or not", () => {
    const warnings = scan(
      pageOf(`page()
  .param("itemId", ID)
  .render(async ({ itemId }) => {
    const [item] = await Promise.all([fetch.approveItem(itemId), fetch.itemCount()]);
    void fetch.updateItem(itemId, {});
    return <p>{item.id}</p>;
  })`),
    );
    expect(warnings.map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: "akan.ssr.render-mutation", line: 8 },
      { rule: "akan.ssr.render-mutation", line: 9 },
    ]);
    expect(warnings[0]?.message).toContain("fetch.approveItem()");
    expect(warnings[0]?.fix).toContain("{ duringRender: true }");
  });

  test("a query, a store action and a client loader are not findings", () => {
    const warnings = scan(
      pageOf(`page()
  .param("itemId", ID)
  .render(({ itemId }) => {
    const { itemInitInOrg } = fetch.initItemInOrg(itemId);
    return <Item.Zone.Card init={itemInitInOrg} count={fetch.itemCount()} />;
  })`),
    );
    expect(warnings).toEqual([]);
  });

  test("a JSX event handler runs on a user action, while a mapped call still runs in the render", () => {
    const warnings = scan(
      pageOf(`page()
  .param("itemId", ID)
  .render(({ itemId }) => {
    return (
      <form onSubmit={async () => { await fetch.approveItem(itemId); }}>
        {[itemId].map((id) => <p key={id}>{String(fetch.approveItem(id))}</p>)}
      </form>
    );
  })`),
    );
    expect(warnings.map(({ line }) => line)).toEqual([10]);
  });

  test("a call that opts in with { duringRender: true } is not a finding", () => {
    expect(
      scan(
        pageOf(
          `page().param("itemId", ID).render(async ({ itemId }) => { await fetch.approveItem(itemId, { duringRender: true }); return null; })`,
        ),
      ),
    ).toEqual([]);
    expect(
      scan(
        pageOf(`page().render(async () => { await fetch.approveItem("x", { duringRender: false }); return null; })`),
      ),
    ).toHaveLength(1);
  });

  test("reads the opt-in only from the slot the runtime reads, right after the declared arguments", () => {
    const renderOf = (call: string) =>
      scan(pageOf(`page().param("itemId", ID).render(async ({ itemId }) => { await ${call}; return null; })`)).length;
    expect(renderOf(`fetch.updateItem(itemId, { duringRender: true })`)).toBe(1);
    expect(renderOf(`fetch.updateItem(itemId, { title: "x", duringRender: true })`)).toBe(1);
    expect(renderOf(`fetch.updateItem(itemId, { title: "x" }, { duringRender: true })`)).toBe(0);
    expect(renderOf(`fetch.mergeItem(itemId, {}, { duringRender: true } as const)`)).toBe(0);
    expect(renderOf(`fetch.addItemFiles([], { duringRender: true })`)).toBe(1);
    expect(renderOf(`fetch.addItemFiles([], undefined, { duringRender: true })`)).toBe(0);
    expect(renderOf(`fetch.createItem({ duringRender: true })`)).toBe(1);
    expect(renderOf(`fetch.approveItem(itemId, { "duringRender": true })`)).toBe(0);
    expect(renderOf(`fetch.approveItem(itemId, { duringRender: undefined })`)).toBe(1);
  });

  test("takes a policy it cannot evaluate as an opt-in, and a value that cannot be one as none", () => {
    const renderOf = (call: string) =>
      scan(
        pageOf(
          `page().param("itemId", ID).render(async ({ itemId }) => { const warm = { duringRender: true }; await ${call}; return null; })`,
        ),
      ).length;
    for (const call of [
      "fetch.approveItem(itemId, warm)",
      "fetch.approveItem(itemId, { ...warm })",
      "fetch.approveItem(itemId, policyOf(itemId))",
      "fetch.approveItem(...[itemId, warm])",
    ])
      expect(renderOf(call)).toBe(0);
    for (const call of [
      "fetch.approveItem(itemId, undefined)",
      "fetch.approveItem(itemId, null)",
      'fetch.approveItem(itemId, "warm")',
      "fetch.updateItem(itemId, warm)",
    ])
      expect(renderOf(call)).toBe(1);
  });

  test("follows a same-file function the stage calls or renders, one level deep", () => {
    const file = fileOf(
      PAGE,
      `import { fetch } from "@apps/demo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

const approve = async (id: string) => await fetch.approveItem(id);
function Approval({ id }: { id: string }) {
  void fetch.removeItem(id);
  return null;
}
const unused = async () => await fetch.createItem({});
const onClickOnly = () => fetch.updateItem("x", {});

export default page()
  .param("itemId", ID)
  .render(async ({ itemId }) => {
    await approve(itemId);
    return <Approval id={itemId} onSelect={onClickOnly} />;
  });
`,
    );
    expect(scan(file).map(({ line }) => line)).toEqual([5, 7]);
  });

  test("reads a page exported by name, a stage given by name and a call by string key", () => {
    const legacy = fileOf(
      PAGE,
      `import { fetch } from "@apps/demo/client";\nconst Page = async () => {\n  await fetch.approveItem("x");\n  return null;\n};\nexport default Page;\n`,
    );
    expect(scan(legacy).map(({ line }) => line)).toEqual([3]);
    const named = fileOf(
      PAGE,
      `import { fetch } from "@apps/demo/client";\nimport { page } from "akanjs/client";\nconst render = async () => {\n  await fetch["approveItem"]("x");\n  return null;\n};\nexport default page().render(render);\n`,
    );
    expect(scan(named).map(({ line, message }) => [line, message.split("()")[0]])).toEqual([
      [4, 'fetch["approveItem"]'],
    ]);
  });

  test("reads the guard, the head and a layout's render too", () => {
    const guarded = pageOf(`page()
  .guard(async () => { await fetch.removeItem("x"); })
  .head(async () => { await fetch.approveItem("x"); return <title>x</title>; })
  .render(() => null)`);
    const wrapping = pageOf(
      `layout().render(async ({ children }) => { await fetch.createItem({}); return children; })`,
      "apps/demo/page/item/_layout.tsx",
    );
    expect(scan(guarded, wrapping).map(({ file, line }) => `${file}:${line}`)).toEqual([
      `${PAGE}:6`,
      `${PAGE}:7`,
      "apps/demo/page/item/_layout.tsx:5",
    ]);
  });

  test("reads a legacy default-exported page function", () => {
    expect(scan(pageOf(`async function Page() { await fetch.approveItem("x"); return null; }`))).toHaveLength(1);
  });

  test("an app load, a file outside page/ and a page with no fetch import are not read", () => {
    expect(
      scan(
        pageOf(
          `page().app("showItem", "Show the item.", async () => { await fetch.approveItem("x"); return null; }).render(() => null)`,
        ),
      ),
    ).toEqual([]);
    expect(
      scan(
        pageOf(`page().render(async () => { await fetch.approveItem("x"); return null; })`, "apps/demo/ui/Item.tsx"),
      ),
    ).toEqual([]);
    const global = fileOf(
      PAGE,
      `export default page().render(async () => { await fetch.approveItem("x"); return null; });`,
    );
    expect(scan(global)).toEqual([]);
  });
});
