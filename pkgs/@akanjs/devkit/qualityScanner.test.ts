import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AbstractDoc } from "./abstractDoc";
import { AkanQualityScanner, type QualityScanResult } from "./qualityScanner";
import { tempDirs, writeText } from "./testHelpers";

const makeTempRoot = tempDirs("akan-quality-scanner-");

const makeWorkspace = async (files: Record<string, string>) => {
  const root = await makeTempRoot();
  for (const [filePath, content] of Object.entries({ ".gitignore": "node_modules\n", ...files }))
    await writeText(path.join(root, filePath), content);
  return root;
};

const abstractOf = (lineNum: number) =>
  ["# post Abstract", ...Array.from({ length: lineNum - 1 }, (_, idx) => `- rule ${idx}`)].join("\n");

describe("AkanQualityScanner abstract rule", () => {
  test("warns on an abstract over the line limit and says how to trim it", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/post/post.abstract.md": abstractOf(AbstractDoc.maxLines + 1),
      "apps/demo/lib/post/post.constant.ts": "export class Post {}\n",
      "libs/shared/lib/user/user.abstract.md": abstractOf(AbstractDoc.maxLines),
      "libs/shared/lib/user/user.constant.ts": "export class User {}\n",
    });

    const result = await new AkanQualityScanner().scan(root);
    const warnings = result.warnings.filter((warning) => warning.rule === "akan.file.abstract-max-lines");

    expect(result.scannedFiles).toBe(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe("apps/demo/lib/post/post.abstract.md");
    expect(warnings[0]?.message).toContain(`${AbstractDoc.maxLines + 1} lines`);
    expect(warnings[0]?.fix).toContain("## Rules");
    expect(warnings[0]?.fix).not.toContain("akan compact");
  });
});

const staticMarkup = (elementNum: number) =>
  Array.from({ length: elementNum }, (_, idx) => `      <p className="text-sm">row ${idx}</p>`).join("\n");

const rulesOf = (result: QualityScanResult, rule: string) => result.warnings.filter((warning) => warning.rule === rule);

describe("AkanQualityScanner ssr rules", () => {
  test("flags a client file that uses no client-only capability", async () => {
    const root = await makeWorkspace({
      "apps/demo/ui/Plain.tsx": `"use client";\nexport const Plain = () => <div>plain</div>;\n`,
      "apps/demo/ui/Interactive.tsx": `"use client";\nexport const Interactive = () => <button onClick={() => null}>go</button>;\n`,
      "apps/demo/ui/Hooked.tsx": `"use client";\nimport { useState } from "react";\nexport const Hooked = () => {\n  const [open] = useState(false);\n  return <div>{open ? "y" : "n"}</div>;\n};\n`,
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.ssr.unnecessary-use-client");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe("apps/demo/ui/Plain.tsx");
  });

  test("keeps the directive on a third-party wrapper and on an index_ boundary", async () => {
    const root = await makeWorkspace({
      "apps/demo/ui/Chart.tsx": `"use client";\nimport { Bar } from "react-chartjs-2";\nexport const Chart = () => <Bar data={{}} />;\n`,
      "apps/demo/ui/Lazy/index_.tsx": `"use client";\nexport { Inner } from "./Inner";\n`,
    });

    expect(rulesOf(await new AkanQualityScanner().scan(root), "akan.ssr.unnecessary-use-client")).toHaveLength(0);
  });

  test("flags a static component and a mostly-static component inside a client file", async () => {
    const root = await makeWorkspace({
      "apps/demo/ui/Panels.tsx": [
        `"use client";`,
        `import { useState } from "react";`,
        `export const StaticPanel = () => (`,
        `  <section>`,
        staticMarkup(5),
        `  </section>`,
        `);`,
        `export const MixedPanel = () => {`,
        `  const [open, setOpen] = useState(false);`,
        `  return (`,
        `    <section>`,
        staticMarkup(12),
        `      <span>{open ? "open" : "shut"}</span>`,
        `    </section>`,
        `  );`,
        `};`,
        "",
      ].join("\n"),
    });

    const result = await new AkanQualityScanner().scan(root);
    const staticWarnings = rulesOf(result, "akan.ssr.client-static-component");
    const mixedWarnings = rulesOf(result, "akan.ssr.client-static-markup");

    expect(staticWarnings).toHaveLength(1);
    expect(staticWarnings[0]?.message).toContain("StaticPanel");
    expect(staticWarnings[0]?.fix).toContain("server file");
    expect(mixedWarnings).toHaveLength(1);
    expect(mixedWarnings[0]?.message).toContain("MixedPanel");
  });

  test("flags a mount-only load but not a reactive one", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/post/Post.Zone.tsx": [
        `"use client";`,
        `import { useEffect } from "react";`,
        `export const List = ({ tag }: { tag: string }) => {`,
        `  useEffect(() => {`,
        `    void st.do.initPostInPublic();`,
        `  }, []);`,
        `  useEffect(() => {`,
        `    void st.do.getPostListInTag(tag);`,
        `  }, [tag]);`,
        `  return <div>{tag}</div>;`,
        `};`,
        "",
      ].join("\n"),
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.ssr.client-mount-load");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("st.do.initPostInPublic");
    expect(warnings[0]?.fix).toContain("init/view");
  });

  test("flags useState in a Template", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/post/Post.Template.tsx": `"use client";\nimport { useState } from "react";\nexport const General = () => {\n  const [draft, setDraft] = useState("");\n  return <input value={draft} onChange={(e) => setDraft(e.target.value)} />;\n};\n`,
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.ssr.template-client-state");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fix).toContain("st.do.setFieldOnX");
  });

  test("flags a module that renders only from client files", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/post/Post.Zone.tsx": [
        `"use client";`,
        `import { useState } from "react";`,
        `export const Card = () => {`,
        `  const [open] = useState(false);`,
        `  return (`,
        `    <section>`,
        staticMarkup(14),
        `      <span>{open ? "open" : "shut"}</span>`,
        `    </section>`,
        `  );`,
        `};`,
        "",
      ].join("\n"),
      "libs/shared/lib/user/User.Zone.tsx": `"use client";\nimport { st } from "@libs/shared/client";\nexport const Self = () => <User.View.General user={st.use.self()} />;\n`,
      "libs/shared/lib/user/User.View.tsx": `export const General = ({ name }: { name: string }) => <div>{name}</div>;\n`,
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.ssr.module-missing-server-view");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("apps/demo/lib/post");
  });

  test("measures the server render share per scope and for the workspace", async () => {
    const root = await makeWorkspace({
      "apps/demo/ui/Server.tsx": `export const Server = () => (\n  <section>\n    <p>a</p>\n    <p>b</p>\n  </section>\n);\n`,
      "libs/shared/ui/Client.tsx": `"use client";\nexport const Client = () => <button onClick={() => null}>go</button>;\n`,
    });

    const { ssrBalance } = await new AkanQualityScanner().scan(root);

    expect(ssrBalance.map((entry) => entry.scope)).toEqual(["apps/demo", "libs/shared", "workspace"]);
    expect(ssrBalance[0]).toMatchObject({ serverMass: 3, clientMass: 0, serverShare: 1 });
    expect(ssrBalance[1]).toMatchObject({ serverMass: 0, clientMass: 1 });
    expect(ssrBalance[2]).toMatchObject({ scope: "workspace", serverMass: 3, clientMass: 1 });
  });
});

describe("AkanQualityScanner layout rules", () => {
  test("flags an unknown app root file but not a facet entrypoint", async () => {
    const root = await makeWorkspace({
      "apps/demo/client.ts": "export const client = 1;\n",
      "apps/demo/helper.ts": "export const helper = 1;\n",
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.layout.app-root-file");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe("apps/demo/helper.ts");
  });

  test("flags an unknown lib root file but not a facet entrypoint", async () => {
    const root = await makeWorkspace({
      "libs/demo/client.ts": "export const client = 1;\n",
      "libs/demo/helper.ts": "export const helper = 1;\n",
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.layout.lib-root-file");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe("libs/demo/helper.ts");
  });

  test("flags a root folder no facet owns, on both sides", async () => {
    const root = await makeWorkspace({
      "apps/demo/base/helper.ts": "export const helper = 1;\n",
      "apps/demo/common/helper.ts": "export const helper = 1;\n",
      "libs/demo/base/helper.ts": "export const helper = 1;\n",
      "libs/demo/common/helper.ts": "export const helper = 1;\n",
    });

    const result = await new AkanQualityScanner().scan(root);

    expect(rulesOf(result, "akan.layout.app-root-folder").map((warning) => warning.file)).toEqual([
      "apps/demo/base/helper.ts",
    ]);
    expect(rulesOf(result, "akan.layout.lib-root-folder").map((warning) => warning.file)).toEqual([
      "libs/demo/base/helper.ts",
    ]);
  });

  test("flags a hand-written facet index beside the generated barrel, but not a folder namespace", async () => {
    const root = await makeWorkspace({
      "libs/demo/ui/index.tsx": 'export { Chat } from "./Chat";\n',
      "libs/demo/ui/Chat.tsx": "export const Chat = () => null;\n",
      "libs/demo/ui/Page/index.tsx": 'export { Inner } from "./Inner";\n',
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.layout.facet-index-shadow");

    expect(warnings.map((warning) => warning.file)).toEqual(["libs/demo/ui/index.tsx"]);
    expect(warnings[0]?.message).toContain("index.tsx shadows the generated ui/index.ts");
    expect(warnings[0]?.fix).toContain("akan sync");
  });

  test("flags a test at the lib root and points it at its module folder or srvkit", async () => {
    const root = await makeWorkspace({
      "libs/demo/lib/cnst.ts": "export const cnst = 1;\n",
      "libs/demo/lib/user.signal.test.ts": "export const test = 1;\n",
      "libs/demo/lib/user/user.signal.test.ts": "export const test = 1;\n",
      "libs/demo/lib/helper.ts": "export const helper = 1;\n",
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.layout.lib-facet-file");

    expect(warnings.map((warning) => warning.file ?? "").sort((a, b) => a.localeCompare(b))).toEqual([
      "libs/demo/lib/helper.ts",
      "libs/demo/lib/user.signal.test.ts",
    ]);
    const rootTest = warnings.find((warning) => warning.file === "libs/demo/lib/user.signal.test.ts");
    expect(rootTest?.message).toContain("lib/<model>/<model>.signal.test.ts");
    expect(rootTest?.message).toContain("srvkit/");
  });
});

describe("AkanQualityScanner class export files", () => {
  test("allow a type only the class reads, and flag an exported type and any helper beside the class", async () => {
    const root = await makeWorkspace({
      "libs/demo/srvkit/vendorApi.ts": [
        "interface VendorUser {",
        "  id: string;",
        "}",
        "type VendorPage = { items: VendorUser[] };",
        "export interface VendorApiOptions {",
        "  key: string;",
        "}",
        "export interface VendorReceipt {",
        "  id: string;",
        "}",
        'export type VendorStatus = "ok" | "fail";',
        "enum VendorRegion {",
        "  Kr,",
        "}",
        "const pageSize = 100;",
        "const toUser = (page: VendorPage) => page.items[0];",
        "export class VendorApi {}",
        "",
      ].join("\n"),
    });

    const warnings = rulesOf(await new AkanQualityScanner().scan(root), "akan.file.class-export-global-declaration");

    expect(warnings.map((warning) => /"(\w+)"/.exec(warning.message)?.[1])).toEqual([
      "VendorReceipt",
      "VendorStatus",
      "VendorRegion",
      "pageSize",
      "toUser",
    ]);
  });
});

describe("bang comments in browser-reachable files", () => {
  const bangWarningsIn = async (files: Record<string, string>) => {
    const result = await new AkanQualityScanner().scan(await makeWorkspace(files));
    return rulesOf(result, "akan.file.bang-comment-in-client");
  };

  test("flags the first and last line, which the grit rule cannot reach", async () => {
    const warnings = await bangWarningsIn({
      "apps/demo/ui/First.tsx": "//! FIXME: broken\nexport const First = () => null;\n",
      "apps/demo/ui/Last.tsx": "export const Last = () => null;\n//! left behind\n",
    });

    expect(warnings.map((warning) => `${warning.file}:${warning.line}`).sort((a, b) => a.localeCompare(b))).toEqual([
      "apps/demo/ui/First.tsx:1",
      "apps/demo/ui/Last.tsx:2",
    ]);
    expect(warnings[0]?.fix).toContain("// FIXME:");
  });

  test("flags the block form and a marker trailing code", async () => {
    const warnings = await bangWarningsIn({
      "apps/demo/lib/task/Task.Zone.tsx": ["/*! keep me */", "export const Zone = () => null; //! and me", ""].join(
        "\n",
      ),
    });

    expect(warnings.map((warning) => warning.line)).toEqual([1, 2]);
  });

  test("ignores a double slash inside a string literal", async () => {
    expect(
      await bangWarningsIn({ "apps/demo/ui/Url.tsx": 'export const url = "https://host//!path";\n' }),
    ).toHaveLength(0);
  });

  test("stays out of server files and tests", async () => {
    const body = "//! server-only marker\nexport const value = 1;\n";
    expect(
      await bangWarningsIn({
        "apps/demo/srvkit/storage.ts": body,
        "apps/demo/lib/task/task.service.ts": body,
        "apps/demo/ui/Card.test.tsx": body,
        "apps/demo/lib/task/task.signal.spec.ts": body,
      }),
    ).toHaveLength(0);
  });

  test("covers every path role the grit rule is scoped to", async () => {
    const body = "//! marker\nexport const value = 1;\n";
    const files = [
      "apps/demo/ui/Card.tsx",
      "apps/demo/webkit/useThing.tsx",
      "apps/demo/common/format.ts",
      "apps/demo/page/task/_index.tsx",
      "apps/demo/lib/task/task.constant.ts",
      "apps/demo/lib/task/task.store.ts",
      "apps/demo/lib/task/Task.Unit.tsx",
    ];
    const warnings = await bangWarningsIn(Object.fromEntries(files.map((file) => [file, body])));

    expect(warnings.map((warning) => warning.file ?? "").sort((a, b) => a.localeCompare(b))).toEqual(
      [...files].sort((a, b) => a.localeCompare(b)),
    );
  });
});
