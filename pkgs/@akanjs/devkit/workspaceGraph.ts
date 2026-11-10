import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type AkanChangeMap,
  type AkanGraph,
  AkanGraphDiff,
  type AkanGraphEdge,
  type AkanGraphNode,
  AkanIndex,
} from "@akanjs/language";
import ts from "typescript";
import type { Workspace } from "./commandDecorators";
import { GitRevision } from "./gitRevision";

export interface GraphScope {
  app?: string | null;
  module?: string | null;
}

//? `env/` holds each environment's secrets in plain TypeScript; the graph never needs to read it.
const indexedPath = /^(apps|libs)\/(?!(?:.*\/)?(?:node_modules|dist|\.akan|env)\/).*\.tsx?$/;
const hiddenPath = /(?:^|\/)(?:node_modules|dist|\.akan|env)\//;
const unscopedNodeLimit = 600;
const pageKinds = new Set<AkanGraphNode["kind"]>(["route", "layout"]);
const cachedBaseLimit = 4;
const slashed = (fileName: string) => fileName.replace(/\\/g, "/");

export class WorkspaceGraph {
  static readonly #bases = new Map<string, Promise<AkanGraph>>();

  static async build(workspace: Workspace, { digests = false } = {}): Promise<AkanGraph> {
    const root = workspace.workspaceRoot;
    const files = (await workspace.getAllFiles("{apps,libs}/**/*.{ts,tsx}"))
      .map(slashed)
      .filter((file) => indexedPath.test(file));
    return WorkspaceGraph.#graphOf(root, await WorkspaceGraph.#textsOf(root, files), digests);
  }

  static async #textsOf(root: string, files: string[]) {
    const read = await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(root, file), "utf8").catch(() => null)] as const),
    );
    return new Map(read.filter((entry): entry is readonly [string, string] => entry[1] !== null));
  }

  static async changes(workspace: Workspace, since: string | null): Promise<AkanChangeMap | { error: string }> {
    const forkPoint = await new GitRevision(workspace.workspaceRoot).forkPointOf(since);
    if (forkPoint.error !== undefined) return { error: forkPoint.error };
    return await WorkspaceGraph.changesAt(workspace, forkPoint.sha);
  }

  static async changesAt(workspace: Workspace, sha: string): Promise<AkanChangeMap> {
    const root = workspace.workspaceRoot;
    const git = new GitRevision(root);
    const [before, after, files] = await Promise.all([
      WorkspaceGraph.#baseAt(root, sha),
      git
        .workingFiles()
        .then((working) =>
          WorkspaceGraph.#textsOf(
            root,
            working.filter((file) => indexedPath.test(file)),
          ),
        )
        .then((texts) => WorkspaceGraph.#graphOf(root, texts, true)),
      git.changedFilesSince(sha),
    ]);
    const changes = AkanGraphDiff.between(before, after);
    const mapped = new Set([
      ...changes.nodes
        .filter((node) => node.change)
        .flatMap((node) => [
          node.at?.file,
          ...(node.sources ?? []),
          ...(node.fields ?? []).filter((field) => field.change).map(({ at }) => at.file),
        ]),
      ...changes.edges.filter((edge) => edge.change).map((edge) => edge.at?.file),
    ]);
    const unmapped = files.filter(({ file }) => !mapped.has(file) && !hiddenPath.test(file));
    const nodes = changes.nodes.map(({ sources: _sources, ...node }) => node);
    return { ...changes, nodes, since: sha.slice(0, 12), unmapped };
  }

  static #baseAt(root: string, sha: string) {
    const key = `${root}\n${sha}`;
    const cached = WorkspaceGraph.#bases.get(key);
    if (cached) return cached;
    const graph = new GitRevision(root)
      .filesAt(sha, (file) => indexedPath.test(file))
      .then((texts) => WorkspaceGraph.#graphOf(root, texts, true));
    graph.catch(() => WorkspaceGraph.#bases.delete(key));
    WorkspaceGraph.#bases.set(key, graph);
    for (const old of [...WorkspaceGraph.#bases.keys()].slice(0, -cachedBaseLimit)) WorkspaceGraph.#bases.delete(old);
    return graph;
  }

  static #graphOf(root: string, texts: Map<string, string>, digests: boolean) {
    const index = new AkanIndex({ ts, root });
    const byFileName = new Map<string, string>();
    for (const [file, text] of texts) {
      const fileName = slashed(path.join(root, file));
      byFileName.set(fileName, text);
      index.setFile(fileName, text);
    }
    return index.graph((fileName) => byFileName.get(fileName), { digests });
  }

  static scope(graph: AkanGraph, { app, module }: GraphScope): AkanGraph {
    if (!app && !module) return graph;
    const owners = app ? new Set([`apps/${app}`, `libs/${app}`]) : null;
    const seeds = new Set(
      graph.nodes
        .filter((node) => (!owners || owners.has(node.owner ?? "")) && (!module || node.module === module))
        .map((node) => node.id),
    );
    //? A lib's guard is linked from every app's endpoints; through it, a scope would reach all of them.
    const guards = new Set(graph.nodes.filter((node) => node.kind === "guard").map((node) => node.id));
    const reaches = (id: string) => seeds.has(id) && !guards.has(id);
    const edges = graph.edges.filter((edge) => edge.kind !== "binds" && (reaches(edge.from) || reaches(edge.to)));
    const kept = new Set([...seeds, ...edges.flatMap((edge) => [edge.from, edge.to])]);
    const isLib =
      !!app &&
      graph.nodes.some((node) => node.owner === `libs/${app}`) &&
      !graph.nodes.some((node) => node.owner === `apps/${app}`);
    const applicable = WorkspaceGraph.#bindingsOf(graph, app && !isLib ? `apps/${app}` : null);
    const isOwn = (edge: AkanGraphEdge) => !module && !!owners?.has(edge.label ?? "");
    const roles = new Set(
      applicable.filter((edge) => isOwn(edge) || kept.has(edge.from) || reaches(edge.to)).map((edge) => edge.from),
    );
    const bindings = applicable.filter((edge) => roles.has(edge.from));
    const ids = new Set([...kept, ...bindings.flatMap((edge) => [edge.from, edge.to])]);
    return { version: 1, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: [...edges, ...bindings] };
  }

  //? An app runs a role as its own `applyAdaptor` binds it, else as a lib's does; a lib's code runs under every app's.
  static #bindingsOf(graph: AkanGraph, appOwner: string | null) {
    const binds = graph.edges.filter((edge) => edge.kind === "binds");
    if (!appOwner) return binds;
    const own = new Set(
      binds.filter((edge) => edge.label === appOwner && edge.change !== "removed").map((edge) => edge.from),
    );
    return binds.filter((edge) => edge.label === appOwner || (!edge.label?.startsWith("apps/") && !own.has(edge.from)));
  }

  //? Pages are many and most only wrap one another, so a graph too large to answer whole drops the pages that neither
  //? changed nor use a change first, and the route-only guards they leave unlinked.
  static #withoutPages(graph: AkanGraph): AkanGraph {
    const changed = new Set(graph.nodes.filter((node) => node.change).map((node) => node.id));
    const touching = new Set(
      graph.edges
        .filter((edge) => edge.kind !== "wraps" && (changed.has(edge.from) || changed.has(edge.to)))
        .flatMap((edge) => [edge.from, edge.to]),
    );
    const dropped = new Set(
      graph.nodes
        .filter((node) => pageKinds.has(node.kind) && !node.change && !touching.has(node.id))
        .map((node) => node.id),
    );
    const edges = graph.edges.filter((edge) => !dropped.has(edge.from) && !dropped.has(edge.to));
    const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    const isRouteOnly = (node: AkanGraphNode) =>
      node.kind === "guard" && node.detail.includes("route") && !node.change && !linked.has(node.id);
    const nodes = graph.nodes.filter((node) => !dropped.has(node.id) && !isRouteOnly(node));
    return { version: 1, nodes, edges };
  }

  static visibleTo(graph: AkanGraph, app: string): AkanGraph {
    const appOwner = `apps/${app}`;
    const isVisible = ({ owner }: AkanGraphNode) => !owner || owner === appOwner || owner.startsWith("libs/");
    const nodes = graph.nodes.filter(isVisible);
    const ids = new Set(nodes.map((node) => node.id));
    const bindings = new Set(WorkspaceGraph.#bindingsOf(graph, appOwner));
    return {
      version: 1,
      nodes,
      edges: graph.edges.filter(
        (edge) => ids.has(edge.from) && ids.has(edge.to) && (edge.kind !== "binds" || bindings.has(edge)),
      ),
    };
  }

  static changesVisibleTo(changes: AkanChangeMap, app: string): AkanChangeMap {
    const visible = WorkspaceGraph.visibleTo(changes, app);
    const linked = new Set(visible.edges.flatMap((edge) => [edge.from, edge.to]));
    const nodes = visible.nodes.filter((node) => node.change || linked.has(node.id));
    const appPath = `apps/${app}/`;
    return {
      ...changes,
      nodes,
      edges: visible.edges,
      summary: WorkspaceGraph.#summaryOf(nodes),
      unmapped: changes.unmapped.filter(({ file }) => file.startsWith(appPath) || file.startsWith("libs/")),
    };
  }

  static #summaryOf(nodes: AkanGraphNode[]) {
    const summary = { added: 0, removed: 0, changed: 0 };
    for (const { change } of nodes) if (change) summary[change] += 1;
    return summary;
  }

  static answerChanges(changes: AkanChangeMap | { error: string }, scope: GraphScope) {
    if ("error" in changes)
      return {
        diagnostics: [{ severity: "error", code: "graph-since-unknown", message: changes.error, input: "since" }],
      };
    const answer = WorkspaceGraph.answer(
      changes,
      scope,
      changes.nodes.filter((node) => node.change),
    );
    if ("diagnostics" in answer) return { since: changes.since, summary: changes.summary, ...answer };
    const summary = WorkspaceGraph.#summaryOf(answer.nodes);
    const owners = scope.app ? [`apps/${scope.app}/`, `libs/${scope.app}/`] : null;
    const modules = scope.module ? [`/lib/${scope.module}/`, `/lib/_${scope.module}/`] : null;
    const unmapped = changes.unmapped.filter(
      ({ file }) =>
        (!owners || owners.some((owner) => file.startsWith(owner))) &&
        (!modules || modules.some((segment) => file.includes(segment))),
    );
    return { since: changes.since, summary, ...answer, unmapped };
  }

  static answer(graph: AkanGraph, scope: GraphScope, counted = graph.nodes) {
    if (scope.app || scope.module || graph.nodes.length <= unscopedNodeLimit) return WorkspaceGraph.scope(graph, scope);
    const unscoped = WorkspaceGraph.#withoutPages(graph);
    if (unscoped.nodes.length <= unscopedNodeLimit) return unscoped;
    const kept = new Set(unscoped.nodes.map((node) => node.id));
    const owners = new Map<string, number>();
    for (const node of counted)
      if (node.owner && kept.has(node.id)) owners.set(node.owner, (owners.get(node.owner) ?? 0) + 1);
    return {
      diagnostics: [
        {
          severity: "error",
          code: "graph-scope-required",
          message: `The graph has ${unscoped.nodes.length} nodes once unchanged pages are set aside. Pass app, module or both to scope it.`,
          input: "app",
        },
      ],
      owners: Object.fromEntries([...owners].sort(([a], [b]) => (a < b ? -1 : 1))),
    };
  }
}
