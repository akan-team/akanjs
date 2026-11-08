import { readFile } from "node:fs/promises";
import path from "node:path";
import { type AkanGraph, type AkanGraphNode, AkanIndex } from "@akanjs/language";
import ts from "typescript";
import type { Workspace } from "./commandDecorators";

export interface GraphScope {
  app?: string | null;
  module?: string | null;
}

//? `env/` holds each environment's secrets in plain TypeScript; the graph never needs to read it.
const indexedPath = /^(apps|libs)\/(?!(?:.*\/)?(?:node_modules|dist|\.akan|env)\/).*\.tsx?$/;
const unscopedNodeLimit = 600;
const slashed = (fileName: string) => fileName.replace(/\\/g, "/");

export class WorkspaceGraph {
  static async build(workspace: Workspace): Promise<AkanGraph> {
    const root = workspace.workspaceRoot;
    const index = new AkanIndex({ ts, root });
    const texts = new Map<string, string>();
    const files = (await workspace.getAllFiles("{apps,libs}/**/*.{ts,tsx}"))
      .map(slashed)
      .filter((file) => indexedPath.test(file));
    await Promise.all(
      files.map(async (file) => {
        const fileName = slashed(path.join(root, file));
        const text = await readFile(fileName, "utf8");
        texts.set(fileName, text);
        index.setFile(fileName, text);
      }),
    );
    return index.graph((fileName) => texts.get(fileName));
  }

  static scope(graph: AkanGraph, { app, module }: GraphScope): AkanGraph {
    if (!app && !module) return graph;
    const owners = app ? new Set([`apps/${app}`, `libs/${app}`]) : null;
    const seeds = new Set(
      graph.nodes
        .filter((node) => (!owners || owners.has(node.owner ?? "")) && (!module || node.module === module))
        .map((node) => node.id),
    );
    const edges = graph.edges.filter((edge) => seeds.has(edge.from) || seeds.has(edge.to));
    const ids = new Set([...seeds, ...edges.flatMap((edge) => [edge.from, edge.to])]);
    return { version: 1, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges };
  }

  static visibleTo(graph: AkanGraph, app: string): AkanGraph {
    const appOwner = `apps/${app}`;
    const isVisible = ({ owner }: AkanGraphNode) => !owner || owner === appOwner || owner.startsWith("libs/");
    const nodes = graph.nodes.filter(isVisible);
    const ids = new Set(nodes.map((node) => node.id));
    return { version: 1, nodes, edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
  }

  static answer(graph: AkanGraph, scope: GraphScope) {
    if (scope.app || scope.module || graph.nodes.length <= unscopedNodeLimit) return WorkspaceGraph.scope(graph, scope);
    const owners = new Map<string, number>();
    for (const node of graph.nodes) if (node.owner) owners.set(node.owner, (owners.get(node.owner) ?? 0) + 1);
    return {
      diagnostics: [
        {
          severity: "error",
          code: "graph-scope-required",
          message: `The graph has ${graph.nodes.length} nodes. Pass app, module or both to scope it.`,
          input: "app",
        },
      ],
      owners: Object.fromEntries([...owners].sort(([a], [b]) => (a < b ? -1 : 1))),
    };
  }
}
