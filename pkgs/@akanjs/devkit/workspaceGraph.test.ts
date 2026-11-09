import { describe, expect, it } from "bun:test";
import type { AkanChangeMap, AkanGraphEdge, AkanGraphNode } from "@akanjs/language";
import { WorkspaceGraph } from "./workspaceGraph";

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
const edge = (from: string, to: string, change?: AkanGraphEdge["change"]): AkanGraphEdge => ({
  from,
  to,
  kind: "calls",
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
