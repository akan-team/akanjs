import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { formatSsrBalance, SSR_SERVER_SHARE_TARGET, SsrScanner } from "./ssrScanner";

//? Each rule gets a positive and a negative: one that stops firing lets the share rot, one that over-reports is ignored
const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
});

const rulesOf = (...files: SourceFileInfo[]) => new SsrScanner().scan(files).warnings.map((warning) => warning.rule);

const scanOne = (file: string, content: string) => rulesOf(fileOf(file, content));

const UI = "apps/demo/ui/Thing.tsx";

describe("akan.ssr.unnecessary-use-client", () => {
  test("flags a directive with no client-only capability behind it", () => {
    expect(scanOne(UI, `"use client";\nexport const Thing = () => <div />;\n`)).toContain(
      "akan.ssr.unnecessary-use-client",
    );
  });

  test("a hook, a handler, a store read and a browser global each justify the directive", () => {
    const justified = [
      `export const Thing = () => { const [open] = useState(false); return <div>{open}</div>; };`,
      `export const Thing = () => <button onClick={save} />;`,
      `export const Thing = () => <div>{st.use.task()}</div>;`,
      `export const Thing = () => <div>{window.innerWidth}</div>;`,
    ];
    for (const body of justified)
      expect(scanOne(UI, `"use client";\n${body}\n`)).not.toContain("akan.ssr.unnecessary-use-client");
  });

  test("a third-party import is a reason the AST cannot rule out", () => {
    expect(scanOne(UI, `"use client";\nimport Chart from "recharts";\nexport const Thing = () => <div />;\n`)).toEqual(
      [],
    );
  });

  // `usePage`/`getSelf` read request-scoped server context, so they must not read as client evidence.
  test("a server-safe call is not client evidence", () => {
    expect(
      scanOne(
        UI,
        `"use client";\nexport const Thing = () => { const { l } = usePage(); return <div>{l("a")}</div>; };\n`,
      ),
    ).toContain("akan.ssr.unnecessary-use-client");
  });

  test("importing st or fetch justifies the directive on its own", () => {
    expect(
      scanOne(UI, `"use client";\nimport { st } from "../lib/st";\nexport const Thing = () => <div />;\n`),
    ).toEqual([]);
  });

  // Zone/Template/Util and the lazy() boundary carry the directive by role, not by accident.
  test("every convention client file is exempt", () => {
    const body = `"use client";\nexport const Card = () => <div />;\n`;
    const exempt = [
      "apps/demo/lib/task/Task.Zone.tsx",
      "apps/demo/lib/task/Task.Template.tsx",
      "apps/demo/lib/task/Task.Util.tsx",
      "apps/demo/ui/Chart/index_.tsx",
    ];
    for (const file of exempt) expect(scanOne(file, body)).toEqual([]);
  });

  test("a Unit or View in the same module is not exempt", () => {
    const body = `"use client";\nexport const Card = () => <div />;\n`;
    expect(scanOne("apps/demo/lib/task/Task.Unit.tsx", body)).toContain("akan.ssr.unnecessary-use-client");
    expect(scanOne("apps/demo/lib/task/Task.View.tsx", body)).toContain("akan.ssr.unnecessary-use-client");
  });

  test("a Zone outside a module folder is not exempt", () => {
    expect(scanOne("apps/demo/ui/Task.Zone.tsx", `"use client";\nexport const Zone = () => <div />;\n`)).toContain(
      "akan.ssr.unnecessary-use-client",
    );
  });

  test("the directive has to be the first statement to count as one", () => {
    expect(
      scanOne(UI, `import { cn } from "akanjs/client";\n"use client";\nexport const Thing = () => <div />;\n`),
    ).toEqual([]);
  });
});

describe("akan.ssr.client-static-component", () => {
  const four = "<div><span /><span /><span /></div>";

  test("flags a static component once its subtree is worth moving", () => {
    expect(
      scanOne(UI, `"use client";\nimport { st } from "../lib/st";\nexport const Card = () => ${four};\n`),
    ).toContain("akan.ssr.client-static-component");
  });

  test("stays quiet below the mass floor", () => {
    expect(
      scanOne(UI, `"use client";\nimport { st } from "../lib/st";\nexport const Card = () => <div><span /></div>;\n`),
    ).toEqual([]);
  });

  test("a component with any client touch is not static", () => {
    expect(
      scanOne(UI, `"use client";\nexport const Card = () => <div onClick={save}><span /><span /><span /></div>;\n`),
    ).not.toContain("akan.ssr.client-static-component");
  });

  // A vendor component's own tags may be client-only, so its subtree is not server-renderable markup.
  test("a subtree rendering a vendor tag is exempt", () => {
    expect(
      scanOne(
        UI,
        `"use client";\nimport Chart from "recharts";\nexport const Card = () => <div><Chart /><span /><span /></div>;\n`,
      ),
    ).toEqual([]);
  });

  test("a lowercase binding is not a component", () => {
    expect(scanOne(UI, `"use client";\nimport { st } from "../lib/st";\nexport const card = () => ${four};\n`)).toEqual(
      [],
    );
  });
});

describe("akan.ssr.client-static-markup", () => {
  const ten = `<div><p /><p /><p /><p /><p /><p /><p /><p /><button onClick={save} /></div>`;

  test("flags a large subtree wrapping one interactive touch", () => {
    expect(scanOne(UI, `"use client";\nexport const Panel = () => ${ten};\n`)).toContain(
      "akan.ssr.client-static-markup",
    );
  });

  test("stays quiet when the subtree is small enough that splitting buys nothing", () => {
    expect(scanOne(UI, `"use client";\nexport const Panel = () => <div><button onClick={save} /></div>;\n`)).toEqual(
      [],
    );
  });

  test("stays quiet once the component is interactive throughout", () => {
    const busy = `<div><button onClick={a} /><button onClick={b} /><button onClick={c} /><p /><p /><p /><p /><p /><p /></div>`;
    expect(scanOne(UI, `"use client";\nexport const Panel = () => ${busy};\n`)).not.toContain(
      "akan.ssr.client-static-markup",
    );
  });
});

describe("akan.ssr.client-mount-load", () => {
  const mount = (body: string) =>
    `"use client";\nexport const Thing = () => { useEffect(() => { ${body} }, []); return <div />; };\n`;

  test("flags a fetch and a generated store load fired from a mount-only effect", () => {
    expect(scanOne(UI, mount("void fetch.initTaskInOrg(orgId);"))).toContain("akan.ssr.client-mount-load");
    expect(scanOne(UI, mount("void st.do.initTaskInOrg();"))).toContain("akan.ssr.client-mount-load");
  });

  test("useLayoutEffect is the same finding", () => {
    const body = `"use client";\nexport const Thing = () => { useLayoutEffect(() => { void fetch.viewTask(id); }, []); return <div />; };\n`;
    expect(scanOne(UI, body)).toContain("akan.ssr.client-mount-load");
  });

  // A reactive effect responds to client state and has no server-side equivalent.
  test("a non-empty dependency array is not a mount load", () => {
    const body = `"use client";\nexport const Thing = () => { useEffect(() => { void fetch.viewTask(id); }, [id]); return <div />; };\n`;
    expect(scanOne(UI, body)).not.toContain("akan.ssr.client-mount-load");
  });

  test("a mount effect that loads nothing is not a finding", () => {
    expect(scanOne(UI, mount("subscribe();"))).not.toContain("akan.ssr.client-mount-load");
  });

  test("a store action that is not a load is not a finding", () => {
    expect(scanOne(UI, mount("void st.do.openModal();"))).not.toContain("akan.ssr.client-mount-load");
  });

  test("never sends a mutation to the route", () => {
    const signal = fileOf(
      "apps/demo/lib/task/task.signal.ts",
      `export class TaskEndpoint extends endpoint(srv.task, ({ mutation }) => ({ markTaskSeen: mutation(Boolean, {}).exec(() => true) })) {}`,
    );
    const [load, write] = new SsrScanner().scan([
      signal,
      fileOf(UI, mount("void fetch.viewTask(id); void fetch.markTaskSeen(id);")),
    ]).warnings;
    expect(load?.message).toContain("The route can fetch this");
    expect(load?.fix).toBeUndefined();
    expect(write?.rule).toBe("akan.ssr.client-mount-load");
    expect(write?.message).toContain("sends the mutation fetch.markTaskSeen()");
    expect(write?.fix).toContain("explicit user action");
    expect(write?.fix).not.toContain("init/view");
  });
});

describe("akan.ssr.render-mutation", () => {
  test("is reported for a route file beside the component rules", () => {
    const signal = fileOf(
      "apps/demo/lib/task/task.signal.ts",
      `export class TaskEndpoint extends endpoint(srv.task, ({ mutation }) => ({ approveTask: mutation(Boolean, {}).exec(() => true) })) {}`,
    );
    const route = fileOf(
      "apps/demo/page/task/_index.tsx",
      `import { fetch } from "@apps/demo/client";\nexport default page().render(async () => { await fetch.approveTask("x"); return null; });\n`,
    );
    expect(rulesOf(signal, route)).toEqual(["akan.ssr.render-mutation"]);
  });
});

describe("akan.ssr.template-client-state", () => {
  const template = "apps/demo/lib/task/Task.Template.tsx";

  test("flags useState in a Template", () => {
    const body = `"use client";\nexport const General = () => { const [draft, setDraft] = useState(""); return <input value={draft} />; };\n`;
    expect(scanOne(template, body)).toContain("akan.ssr.template-client-state");
  });

  test("the same useState in a Zone is not a finding", () => {
    const body = `"use client";\nexport const Card = () => { const [open, setOpen] = useState(false); return <div>{open}</div>; };\n`;
    expect(scanOne("apps/demo/lib/task/Task.Zone.tsx", body)).not.toContain("akan.ssr.template-client-state");
  });

  test("a store-driven Template is clean", () => {
    const body = `"use client";\nexport const General = () => <input value={st.use.taskForm().name} onChange={st.do.setNameOnTask} />;\n`;
    expect(scanOne(template, body)).toEqual([]);
  });
});

describe("akan.ssr.module-missing-server-view", () => {
  const clientMass = `<div><p /><p /><p /><p /><p /><p /><p /><p /><p /><p /><p /></div>`;

  test("flags a module that renders only from client files", () => {
    const zone = fileOf(
      "apps/demo/lib/task/Task.Zone.tsx",
      `"use client";\nexport const Card = () => ${clientMass};\n`,
    );
    expect(rulesOf(zone)).toContain("akan.ssr.module-missing-server-view");
  });

  test("one Unit or View in the module answers it", () => {
    const zone = fileOf(
      "apps/demo/lib/task/Task.Zone.tsx",
      `"use client";\nexport const Card = () => ${clientMass};\n`,
    );
    const unit = fileOf("apps/demo/lib/task/Task.Unit.tsx", `export const Card = () => <div />;\n`);
    expect(rulesOf(zone, unit)).not.toContain("akan.ssr.module-missing-server-view");
  });

  test("a module too small to matter is not a finding", () => {
    const zone = fileOf(
      "apps/demo/lib/task/Task.Zone.tsx",
      `"use client";\nexport const Card = () => <div><p /></div>;\n`,
    );
    expect(rulesOf(zone)).not.toContain("akan.ssr.module-missing-server-view");
  });

  // `lib/_<service>` folders are service modules, which own no model to render server-side.
  test("a service module is not held to it", () => {
    const zone = fileOf(
      "apps/demo/lib/_upload/Upload.Zone.tsx",
      `"use client";\nexport const Card = () => ${clientMass};\n`,
    );
    expect(rulesOf(zone)).not.toContain("akan.ssr.module-missing-server-view");
  });
});

describe("scan scope", () => {
  test("only apps/libs ui and lib .tsx files are measured", () => {
    const outOfScope = [
      "apps/demo/page/task/_index.tsx",
      "apps/demo/webkit/useThing.tsx",
      "apps/demo/ui/Thing.test.tsx",
      "pkgs/akanjs/ui/Thing.tsx",
      "apps/demo/ui/thing.ts",
    ];
    for (const file of outOfScope)
      expect(new SsrScanner().scan([fileOf(file, `"use client";\nexport const Thing = () => <div />;\n`)])).toEqual({
        warnings: [],
        balance: [],
      });
  });
});

describe("balance", () => {
  test("measures the share in JSX elements and not in files", () => {
    const server = fileOf("apps/demo/ui/Server.tsx", `export const A = () => <div><p /><p /></div>;\n`);
    const client = fileOf("apps/demo/ui/Client.tsx", `"use client";\nexport const B = () => <div onClick={a} />;\n`);
    const [entry] = new SsrScanner().scan([server, client]).balance;
    expect(entry).toEqual({ scope: "apps/demo", serverMass: 3, clientMass: 1, serverShare: 0.75 });
  });

  test("adds a workspace row only once a second scope exists", () => {
    const demo = fileOf("apps/demo/ui/A.tsx", `export const A = () => <div />;\n`);
    const shared = fileOf("libs/shared/ui/B.tsx", `"use client";\nexport const B = () => <div onClick={a} />;\n`);
    expect(new SsrScanner().scan([demo]).balance.map((entry) => entry.scope)).toEqual(["apps/demo"]);
    expect(new SsrScanner().scan([demo, shared]).balance.map((entry) => entry.scope)).toEqual([
      "apps/demo",
      "libs/shared",
      "workspace",
    ]);
  });

  // An empty scope reads as fully server-rendered rather than as a division by zero.
  test("a scope with no JSX at all is 100% server", () => {
    const empty = fileOf("apps/demo/ui/Empty.tsx", `export const value = 1;\n`);
    expect(new SsrScanner().scan([empty]).balance[0].serverShare).toBe(1);
  });
});

describe("formatSsrBalance", () => {
  test("flags a scope under the target and leaves one above it unmarked", () => {
    const lines = formatSsrBalance([
      { scope: "apps/low", serverMass: 1, clientMass: 9, serverShare: 0.1 },
      { scope: "apps/high", serverMass: 9, clientMass: 1, serverShare: 0.9 },
    ]);
    expect(lines[0]).toContain("10% server");
    expect(lines[0]).toContain(`below the ${Math.round(SSR_SERVER_SHARE_TARGET * 100)}% target`);
    expect(lines[1]).toContain("90% server");
    expect(lines[1]).not.toContain("below the");
  });

  test("says so rather than printing an empty table", () => {
    expect(formatSsrBalance([])).toEqual(["No component files found."]);
  });
});
