import type { AkanGraph, AkanGraphChange, AkanGraphEdge, AkanGraphField, AkanGraphNode } from "akanjs/common";

export interface AkanGraphChanges extends AkanGraph {
  summary: { [change in AkanGraphChange]: number };
}

const edgeKeyOf = ({ from, to, kind, label }: AkanGraphEdge) => `${from}\n${to}\n${kind}\n${label ?? ""}`;
const shapeOf = ({ type, array, optional, declaredIn }: AkanGraphField) =>
  `${type ?? ""}${array ? "[]" : ""}${optional ? "?" : ""} ${declaredIn}`;
const isEdited = (before: { digest?: string }, after: { digest?: string }) =>
  before.digest !== undefined && after.digest !== undefined && before.digest !== after.digest;
const byId = (a: AkanGraphNode, b: AkanGraphNode) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class AkanGraphDiff {
  static between(given: AkanGraph, head: AkanGraph): AkanGraphChanges {
    const base = AkanGraphDiff.#renamed(given, head);
    const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
    const headNodes = new Map(head.nodes.map((node) => [node.id, node]));
    const marked = new Map<string, AkanGraphNode>();
    for (const node of head.nodes) {
      const before = baseNodes.get(node.id);
      const next = before ? AkanGraphDiff.#compare(before, node) : AkanGraphDiff.#mark(node, "added");
      if (next) marked.set(node.id, next);
    }
    for (const node of base.nodes)
      if (!headNodes.has(node.id)) marked.set(node.id, AkanGraphDiff.#mark(node, "removed"));

    const baseKeys = new Set(base.edges.map(edgeKeyOf));
    const headKeys = new Set(head.edges.map(edgeKeyOf));
    const edges: AkanGraphEdge[] = [
      ...head.edges.flatMap((edge): AkanGraphEdge[] =>
        !baseKeys.has(edgeKeyOf(edge))
          ? [{ ...edge, change: "added" }]
          : marked.has(edge.from) || marked.has(edge.to)
            ? [edge]
            : [],
      ),
      ...base.edges
        .filter((edge) => !headKeys.has(edgeKeyOf(edge)))
        .map((edge) => ({ ...edge, change: "removed" as const })),
    ];
    const shown = new Set([...marked.keys(), ...edges.flatMap((edge) => [edge.from, edge.to])]);
    const listed = new Set(edges.map(edgeKeyOf));
    //? A role runs as whichever binding of it applies to an app, so a shown role brings every binding it has.
    edges.push(
      ...head.edges.filter((edge) => edge.kind === "binds" && shown.has(edge.from) && !listed.has(edgeKeyOf(edge))),
    );
    const context = edges
      .flatMap((edge) => [edge.from, edge.to])
      .filter((id) => !marked.has(id))
      .flatMap((id) => {
        const node = headNodes.get(id) ?? baseNodes.get(id);
        return node ? [node] : [];
      });
    const nodes = [...new Map([...marked.values(), ...context].map((node) => [node.id, node])).values()]
      .map(AkanGraphDiff.#withoutDigest)
      .sort(byId);
    const summary = { added: 0, removed: 0, changed: 0 };
    for (const node of marked.values()) if (node.change) summary[node.change] += 1;
    return { version: 1, nodes, edges, summary };
  }

  //? A name is keyed by file only while its owner declares it twice, so adding or removing one re-keys the other.
  static #renamed(base: AkanGraph, head: AkanGraph): AkanGraph {
    const baseIds = new Set(base.nodes.map((node) => node.id));
    const headIds = new Set(head.nodes.map((node) => node.id));
    const pairKeyOf = ({ kind, owner, name, at }: AkanGraphNode) =>
      at ? `${kind}\n${owner ?? ""}\n${name}\n${at.file}` : null;
    const shortIdOf = ({ kind, owner, name }: AkanGraphNode) => `${kind}:${owner ?? ""}:${name}`;
    const isFileKeyed = (node: AkanGraphNode) =>
      node.id !== shortIdOf(node) &&
      node.id.startsWith(`${node.kind}:${node.owner ?? ""}:`) &&
      node.id.endsWith(`#${node.name}`);
    const fromBase = new Map(
      base.nodes.flatMap((node) => {
        const key = headIds.has(node.id) ? null : pairKeyOf(node);
        return key ? [[key, node] as const] : [];
      }),
    );
    const renames = new Map<string, string>();
    for (const node of head.nodes) {
      if (baseIds.has(node.id)) continue;
      const key = pairKeyOf(node);
      const before = key ? fromBase.get(key) : undefined;
      if (!before) continue;
      const isPair = isFileKeyed(node)
        ? before.id === shortIdOf(node)
        : isFileKeyed(before) && node.id === shortIdOf(before);
      if (isPair) renames.set(before.id, node.id);
    }
    if (!renames.size) return base;
    const rename = (id: string) => renames.get(id) ?? id;
    return {
      ...base,
      nodes: base.nodes.map((node) => (renames.has(node.id) ? { ...node, id: rename(node.id) } : node)),
      edges: base.edges.map((edge) => ({ ...edge, from: rename(edge.from), to: rename(edge.to) })),
    };
  }

  static #mark(node: AkanGraphNode, change: AkanGraphChange): AkanGraphNode {
    return node.fields
      ? { ...node, change, fields: node.fields.map((field) => ({ ...field, change })) }
      : { ...node, change };
  }

  static #compare(before: AkanGraphNode, after: AkanGraphNode): AkanGraphNode | null {
    const fields = AkanGraphDiff.#fieldsBetween(before.fields, after.fields);
    const isChanged =
      isEdited(before, after) ||
      before.label !== after.label ||
      before.detail.join("\n") !== after.detail.join("\n") ||
      (before.values ?? []).join("\n") !== (after.values ?? []).join("\n") ||
      !!fields?.some((field) => field.change);
    if (!isChanged) return null;
    return fields ? { ...after, change: "changed", fields } : { ...after, change: "changed" };
  }

  static #fieldsBetween(before: AkanGraphField[] | undefined, after: AkanGraphField[] | undefined) {
    if (!before && !after) return undefined;
    const previous = new Map((before ?? []).map((field) => [field.name, field]));
    const names = new Set((after ?? []).map((field) => field.name));
    return [
      ...(after ?? []).map((field): AkanGraphField => {
        const old = previous.get(field.name);
        if (!old) return { ...field, change: "added" };
        return shapeOf(old) === shapeOf(field) && !isEdited(old, field) ? field : { ...field, change: "changed" };
      }),
      ...(before ?? [])
        .filter((field) => !names.has(field.name))
        .map((field) => ({ ...field, change: "removed" as const })),
    ];
  }

  static #withoutDigest({ digest: _digest, ...node }: AkanGraphNode): AkanGraphNode {
    return node.fields ? { ...node, fields: node.fields.map(({ digest: _field, ...field }) => field) } : node;
  }
}
