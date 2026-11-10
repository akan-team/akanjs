import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AkanChangeMap, AkanGraphEdge, AkanGraphNode } from "@akanjs/language";
import type { Workspace } from "./commandDecorators";
import { WorkspaceGraph } from "./workspaceGraph";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const node = (id: string, owner: string | null, change?: AkanGraphNode["change"]): AkanGraphNode => ({
  id,
  kind: id.split(":")[0] as AkanGraphNode["kind"],
  name: id,
  label: id,
  owner,
  module: null,
  detail: [],
  at: null,
  ...(change ? { change } : {}),
});
const edge = (
  from: string,
  to: string,
  change?: AkanGraphEdge["change"],
  kind: AkanGraphEdge["kind"] = "calls",
): AkanGraphEdge => ({
  from,
  to,
  kind,
  label: null,
  count: 1,
  at: null,
  ...(change ? { change } : {}),
});

describe("WorkspaceGraph.changesVisibleTo", () => {
  it("keeps the app's and the libs' changes, and an unchanged neighbour only while an edge still reaches it", () => {
    const changes: AkanChangeMap = {
      version: 1,
      nodes: [
        node("endpoint:apps/demo:memo.pin", "apps/demo", "added"),
        node("method:libs/shared:file.touch", "libs/shared"),
        node("method:libs/shared:file.open", "libs/shared"),
        node("component:apps/admin/page/a.tsx#default", "apps/admin", "changed"),
        node("guard:Owner", null, "added"),
      ],
      edges: [
        edge("endpoint:apps/demo:memo.pin", "method:libs/shared:file.touch", "added"),
        edge("component:apps/admin/page/a.tsx#default", "method:libs/shared:file.open"),
      ],
      since: "0123456789ab",
      summary: { added: 2, removed: 0, changed: 1 },
      unmapped: [
        { file: "apps/admin/page/b.tsx", change: "added" },
        { file: "apps/demo/lib/memo/memo.dictionary.ts", change: "changed" },
        { file: "libs/shared/lib/file/file.md", change: "removed" },
      ],
    };
    const visible = WorkspaceGraph.changesVisibleTo(changes, "demo");
    expect(visible.nodes.map(({ id }) => id)).toEqual([
      "endpoint:apps/demo:memo.pin",
      "method:libs/shared:file.touch",
      "guard:Owner",
    ]);
    expect(visible.edges).toHaveLength(1);
    expect(visible.summary).toEqual({ added: 2, removed: 0, changed: 0 });
    expect(visible.unmapped.map(({ file }) => file)).toEqual([
      "apps/demo/lib/memo/memo.dictionary.ts",
      "libs/shared/lib/file/file.md",
    ]);
    expect(visible.since).toBe("0123456789ab");
  });
});

describe("WorkspaceGraph.answer", () => {
  it("answers a small graph whole, and drops untouched pages and their route-only guards from one past the limit", () => {
    const fillers = Array.from({ length: 597 }, (_, idx) => node(`method:apps/demo:memo.m${idx}`, "apps/demo"));
    const guard = { ...node("guard:libs/shared:signedIn", "libs/shared"), detail: ["route"] };
    const graph = {
      version: 1 as const,
      nodes: [
        node("layout:apps/demo:/", "apps/demo"),
        node("route:apps/demo:/memo", "apps/demo"),
        node("route:apps/demo:/peek", "apps/demo"),
        node("endpoint:apps/demo:memo.pin", "apps/demo", "changed"),
        guard,
        ...fillers,
      ],
      edges: [
        edge("layout:apps/demo:/", "route:apps/demo:/memo"),
        edge("layout:apps/demo:/", "route:apps/demo:/peek"),
        edge("layout:apps/demo:/", "guard:libs/shared:signedIn"),
        edge("route:apps/demo:/peek", "endpoint:apps/demo:memo.pin"),
      ],
    };
    const small = WorkspaceGraph.answer({ ...graph, nodes: graph.nodes.slice(0, 5) }, {});
    if ("diagnostics" in small) throw new Error("expected an answer");
    expect(small.nodes).toHaveLength(5);
    const unscoped = WorkspaceGraph.answer(graph, {});
    if ("diagnostics" in unscoped) throw new Error("expected an answer");
    expect(unscoped.nodes.slice(0, 2).map(({ id }) => id)).toEqual([
      "route:apps/demo:/peek",
      "endpoint:apps/demo:memo.pin",
    ]);
    expect(unscoped.nodes).toHaveLength(599);
    expect(unscoped.edges.map(({ from, to }) => `${from} -> ${to}`)).toEqual([
      "route:apps/demo:/peek -> endpoint:apps/demo:memo.pin",
    ]);
    const scoped = WorkspaceGraph.answer(graph, { app: "demo" });
    if ("diagnostics" in scoped) throw new Error("expected an answer");
    expect(scoped.nodes).toHaveLength(602);
  });
});

describe("WorkspaceGraph.answer past the node limit", () => {
  const changeMapOf = (nodes: AkanGraphNode[], edges: AkanGraphEdge[]): AkanChangeMap => ({
    version: 1,
    nodes,
    edges,
    since: "0123456789ab",
    summary: { added: 0, removed: 0, changed: nodes.filter((item) => item.change).length },
    unmapped: [],
  });

  it("drops the layout that only wraps a changed route, and keeps the route", () => {
    const fillers = Array.from({ length: 599 }, (_, idx) => node(`method:apps/demo:memo.m${idx}`, "apps/demo"));
    const answer = WorkspaceGraph.answer(
      {
        version: 1,
        nodes: [
          node("layout:apps/demo:/", "apps/demo"),
          node("route:apps/demo:/memo", "apps/demo", "changed"),
          ...fillers,
        ],
        edges: [edge("layout:apps/demo:/", "route:apps/demo:/memo", undefined, "wraps")],
      },
      {},
    );
    if ("diagnostics" in answer) throw new Error("expected an answer");
    expect(answer.nodes.filter((item) => item.kind !== "method").map(({ id }) => id)).toEqual([
      "route:apps/demo:/memo",
    ]);
    expect(answer.edges).toEqual([]);
  });

  it("answers a Change Map whole once its unchanged pages are set aside", () => {
    const routes = Array.from({ length: 10 }, (_, idx) => node(`route:apps/demo:/r${idx}`, "apps/demo"));
    const changed = Array.from({ length: 595 }, (_, idx) =>
      node(`method:apps/demo:memo.m${idx}`, "apps/demo", "changed"),
    );
    const answer = WorkspaceGraph.answerChanges(changeMapOf([...routes, ...changed], []), {});
    if ("diagnostics" in answer) throw new Error("expected an answer");
    expect(answer.nodes).toHaveLength(595);
    expect(answer.summary).toEqual({ added: 0, removed: 0, changed: 595 });
  });

  it("counts the changed pages it keeps when it names the owners to scope to", () => {
    const routes = Array.from({ length: 650 }, (_, idx) => node(`route:apps/demo:/r${idx}`, "apps/demo", "changed"));
    const answer = WorkspaceGraph.answerChanges(
      changeMapOf([...routes, node("method:libs/shared:file.touch", "libs/shared", "changed")], []),
      {},
    );
    if (!("owners" in answer)) throw new Error("expected a scope request");
    expect(answer.diagnostics.map(({ message }) => message).join("\n")).toContain("651 nodes");
    expect(answer.owners).toEqual({ "apps/demo": 650, "libs/shared": 1 });
  });
});

describe("WorkspaceGraph.scope", () => {
  it("keeps a lib's guard without pulling in every app endpoint that uses it", () => {
    const guard = "guard:libs/shared:Admin";
    const own = "endpoint:libs/shared:file.touch";
    const other = "endpoint:apps/demo:memo.pin";
    const scoped = WorkspaceGraph.scope(
      {
        version: 1,
        nodes: [node(guard, "libs/shared"), node(own, "libs/shared"), node(other, "apps/demo")],
        edges: [edge(own, guard), edge(other, guard)],
      },
      { app: "shared" },
    );
    expect(scoped.nodes.map(({ id }) => id)).toEqual([guard, own]);
    expect(scoped.edges).toEqual([edge(own, guard)]);
  });

  it("follows a role the scope's method calls to the implementation its app binds", () => {
    const role = "adaptor::LlmAdaptorRole";
    const binds = (to: string, label: string): AkanGraphEdge => ({ ...edge(role, to), kind: "binds", label });
    const graph = {
      version: 1 as const,
      nodes: [
        { ...node("method:apps/sceny:plan.draft", "apps/sceny"), module: "plan" },
        { ...node("method:apps/angelo:chat.reply", "apps/angelo"), module: "chat" },
        { ...node("method:libs/genai:prompt.run", "libs/genai"), module: "prompt" },
        node(role, null),
        node("adaptor::AnthropicLlm", null),
        node("adaptor:apps/angelo:ChatCompletionsLlm", "apps/angelo"),
        node("adaptor:libs/genai:GenaiLlm", "libs/genai"),
      ],
      edges: [
        edge("method:apps/sceny:plan.draft", role),
        edge("method:apps/angelo:chat.reply", role),
        edge("method:libs/genai:prompt.run", role),
        binds("adaptor::AnthropicLlm", "apps/sceny"),
        binds("adaptor:apps/angelo:ChatCompletionsLlm", "apps/angelo"),
        binds("adaptor:libs/genai:GenaiLlm", "libs/genai"),
      ],
    };
    const bound = (scope: { app?: string; module?: string }) =>
      WorkspaceGraph.scope(graph, scope)
        .edges.filter(({ kind }) => kind === "binds")
        .map(({ to, label }) => `${label} ${to}`);
    expect(bound({ app: "sceny" })).toEqual(["apps/sceny adaptor::AnthropicLlm"]);
    expect(WorkspaceGraph.scope(graph, { app: "sceny" }).nodes.map(({ id }) => id)).toContain("adaptor::AnthropicLlm");
    expect(bound({ app: "angelo" })).toEqual(["apps/angelo adaptor:apps/angelo:ChatCompletionsLlm"]);
    expect(bound({ app: "genai" })).toEqual([
      "apps/sceny adaptor::AnthropicLlm",
      "apps/angelo adaptor:apps/angelo:ChatCompletionsLlm",
      "libs/genai adaptor:libs/genai:GenaiLlm",
    ]);
    expect(bound({ module: "plan" })).toHaveLength(3);
    expect(
      WorkspaceGraph.visibleTo(graph, "sceny")
        .edges.filter(({ kind }) => kind === "binds")
        .map(({ label }) => label),
    ).toEqual(["apps/sceny", "libs/genai"]);
  });
});

describe("WorkspaceGraph.changesAt", () => {
  it("maps an edit to a factory in one lib onto the guards it makes in another, and lists no file as unmapped", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-graph-"));
    roots.push(root);
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(
        ["git", "-c", "user.name=akan", "-c", "user.email=akan@example.com", "-c", "commit.gpgsign=false", ...args],
        { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } },
      );
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    };
    const write = async (file: string, text: string) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    };
    const factory = (body: string) => `import type { Guard } from "akanjs/signal";
export const resourceGuard = (field: string) =>
  class implements Guard {
    canPass() {
      return ${body};
    }
  };
`;
    git("init", "-q", "-b", "main");
    await write("libs/util/srvkit/resource.ts", factory("!!field"));
    await write(
      "apps/demo/srvkit/guards.ts",
      `import { resourceGuard } from "@libs/util/srvkit";\nexport const Member = resourceGuard("member");\n`,
    );
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "base");
    await write("libs/util/srvkit/resource.ts", factory("field.length > 0"));
    const changes = await WorkspaceGraph.changesAt(
      { workspaceRoot: root } as unknown as Workspace,
      git("rev-parse", "HEAD"),
    );
    expect(changes.nodes.filter((node) => node.change).map(({ id, change }) => `${change} ${id}`)).toEqual([
      "changed guard:apps/demo:Member",
    ]);
    expect(changes.unmapped).toEqual([]);
    expect(changes.nodes.some((node) => "sources" in node)).toBe(false);
  });
});
