import type {
  AkanGraph,
  AkanGraphChange,
  AkanGraphEdge,
  AkanGraphField,
  AkanGraphNode,
} from "akanjs/common/akanGraph.ts";

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
  static between(base: AkanGraph, head: AkanGraph): AkanGraphChanges {
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
