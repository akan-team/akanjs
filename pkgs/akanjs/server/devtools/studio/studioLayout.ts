import type {
  AkanChangedFile,
  AkanGraph,
  AkanGraphChange,
  AkanGraphEdge,
  AkanGraphField,
  AkanGraphLocation,
  AkanGraphNode,
  AkanGraphNodeKind,
} from "akanjs/common";

export type StudioView = "erd" | "signals" | "changes";

export interface StudioRow {
  text: string;
  hint: string;
  y: number;
  at: AkanGraphLocation | null;
  change?: AkanGraphChange;
}

export interface StudioBox {
  node: AkanGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: StudioRow[];
}

export interface StudioLink {
  edge: AkanGraphEdge;
  path: string;
}

export interface StudioColumn {
  label: string;
  x: number;
}

export interface StudioScene {
  boxes: StudioBox[];
  links: StudioLink[];
  columns: StudioColumn[];
  width: number;
  height: number;
}

const columnGap = 112;
const boxGap = 16;
const headerHeight = 28;
const rowHeight = 18;
const padding = 24;
const columnTop = 40;
const maxColumnHeight = 1800;
const typeKinds = new Set<AkanGraphNodeKind>(["model", "scalar", "enum"]);
const flowColumns: { label: string; kinds: AkanGraphNodeKind[] }[] = [
  { label: "Pages & components", kinds: ["route", "layout", "component"] },
  { label: "Store actions", kinds: ["action"] },
  { label: "Endpoints & slices", kinds: ["endpoint", "slice"] },
  { label: "Service methods", kinds: ["method"] },
  { label: "Queries & models", kinds: ["query", "model"] },
];
const changeColumns: { label: string; kinds: AkanGraphNodeKind[] }[] = [
  ...flowColumns,
  { label: "Scalars, enums & guards", kinds: ["scalar", "enum", "guard"] },
];
const columnsOf = (columns: { kinds: AkanGraphNodeKind[] }[]) =>
  new Map(columns.flatMap(({ kinds }, idx) => kinds.map((kind) => [kind, idx] as const)));
const flowColumnOf = columnsOf(flowColumns);
const changeColumnOf = columnsOf(changeColumns);
const flowEdgeKinds = new Set(["calls", "fetches", "uses"]);

export class StudioLayout {
  static modulesOf(graph: AkanGraph): string[] {
    const modules = new Set<string>();
    //? A scalar's module is its own name and an enum under `lib/__scalar/` reads `__scalar`; neither has signals.
    for (const node of graph.nodes)
      if (node.module && node.kind !== "component" && flowColumnOf.has(node.kind)) modules.add(node.module);
    return [...modules].sort();
  }

  static erd(graph: AkanGraph, module: string | null): StudioScene {
    const types = graph.nodes.filter((node) => typeKinds.has(node.kind));
    const fieldEdges = graph.edges.filter((edge) => edge.kind === "field");
    const { nodes, edges } = StudioLayout.#around(types, fieldEdges, module);
    const ranks = StudioLayout.#ranks(nodes, edges);
    const groups = [...new Set(ranks.values())]
      .sort((a, b) => a - b)
      .map((rank) => nodes.filter((node) => ranks.get(node.id) === rank));
    return StudioLayout.#place(groups, edges, { width: 248, labels: null, rowsOf: StudioLayout.#typeRows });
  }

  static signals(graph: AkanGraph, module: string | null): StudioScene {
    const flowNodes = graph.nodes.filter((node) => flowColumnOf.has(node.kind));
    const flowEdges = graph.edges.filter((edge) => flowEdgeKinds.has(edge.kind));
    const { nodes, edges } = StudioLayout.#around(flowNodes, flowEdges, module);
    const groups = flowColumns.map((_, idx) => nodes.filter((node) => flowColumnOf.get(node.kind) === idx));
    return StudioLayout.#place(groups, edges, {
      width: 264,
      labels: flowColumns.map(({ label }) => label),
      rowsOf: StudioLayout.#chipRows,
    });
  }

  static changes(graph: AkanGraph, module: string | null): StudioScene {
    const { nodes, edges } = StudioLayout.#around(graph.nodes, graph.edges, module);
    const groups = changeColumns.map((_, idx) => nodes.filter((node) => changeColumnOf.get(node.kind) === idx));
    return StudioLayout.#place(groups, edges, {
      width: 264,
      labels: changeColumns.map(({ label }) => label),
      rowsOf: StudioLayout.#changeRows,
    });
  }

  static unmappedIn(files: AkanChangedFile[], module: string | null): AkanChangedFile[] {
    if (!module) return files;
    return files.filter(({ file }) => file.includes(`/lib/${module}/`) || file.includes(`/lib/_${module}/`));
  }

  static #around(nodes: AkanGraphNode[], edges: AkanGraphEdge[], module: string | null) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const linked = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
    if (!module) return { nodes, edges: linked };
    const seeds = new Set(nodes.filter((node) => node.module === module).map((node) => node.id));
    const kept = linked.filter((edge) => seeds.has(edge.from) || seeds.has(edge.to));
    const ids = new Set([...seeds, ...kept.flatMap((edge) => [edge.from, edge.to])]);
    return { nodes: nodes.filter((node) => ids.has(node.id)), edges: kept };
  }

  static #ranks(nodes: AkanGraphNode[], edges: AkanGraphEdge[]) {
    const out = new Map<string, string[]>();
    for (const edge of edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
    const state = new Map<string, "open" | "done">();
    const order: string[] = [];
    const visit = (id: string) => {
      if (state.has(id)) return;
      state.set(id, "open");
      for (const to of out.get(id) ?? []) if (state.get(to) !== "open") visit(to);
      state.set(id, "done");
      order.push(id);
    };
    for (const node of nodes) visit(node.id);
    order.reverse();
    const position = new Map(order.map((id, idx) => [id, idx]));
    const ranks = new Map(nodes.map((node) => [node.id, 0]));
    for (const id of order)
      for (const to of out.get(id) ?? [])
        if ((position.get(to) ?? 0) > (position.get(id) ?? 0))
          ranks.set(to, Math.max(ranks.get(to) ?? 0, (ranks.get(id) ?? 0) + 1));
    return ranks;
  }

  static #typeRows(node: AkanGraphNode): Omit<StudioRow, "y">[] {
    if (node.values) return node.values.map((value) => ({ text: value, hint: "", at: null }));
    return (node.fields ?? []).map(StudioLayout.#fieldRow);
  }

  static #fieldRow(field: AkanGraphField): Omit<StudioRow, "y"> {
    return {
      text: field.name,
      hint: `${field.type ?? "?"}${field.array ? "[]" : ""}${field.optional ? "?" : ""}`,
      at: field.at,
    };
  }

  static #changeRows(node: AkanGraphNode): Omit<StudioRow, "y">[] {
    if (node.fields)
      return node.fields.flatMap(({ change, ...field }) =>
        change ? [{ ...StudioLayout.#fieldRow(field), at: change === "removed" ? null : field.at, change }] : [],
      );
    if (node.values) return node.change ? StudioLayout.#typeRows(node) : [];
    return StudioLayout.#chipRows(node);
  }

  static #chipRows(node: AkanGraphNode): Omit<StudioRow, "y">[] {
    return node.detail.length ? [{ text: node.detail.join(" · "), hint: "", at: null }] : [];
  }

  static #place(
    groups: AkanGraphNode[][],
    edges: AkanGraphEdge[],
    {
      width,
      labels,
      rowsOf,
    }: { width: number; labels: string[] | null; rowsOf: (node: AkanGraphNode) => Omit<StudioRow, "y">[] },
  ): StudioScene {
    const ordered = StudioLayout.#order(groups, edges);
    const boxes: StudioBox[] = [];
    const columns: StudioColumn[] = [];
    let x = padding;
    let height = 0;
    ordered.forEach((group, idx) => {
      if (labels && !group.length) return;
      columns.push({ label: labels?.[idx] ?? "", x });
      let y = columnTop;
      for (const node of group) {
        const rows = rowsOf(node);
        const boxHeight = headerHeight + rows.length * rowHeight + (rows.length ? 6 : 0);
        if (y > columnTop && y + boxHeight > maxColumnHeight) {
          x += width + boxGap * 2;
          y = columnTop;
        }
        const placed = rows.map((row, rowIdx) => ({
          ...row,
          y: y + headerHeight + rowIdx * rowHeight + rowHeight / 2,
        }));
        boxes.push({ node, x, y, width, height: boxHeight, rows: placed });
        y += boxHeight + boxGap;
        height = Math.max(height, y);
      }
      x += width + columnGap;
    });
    const boxOf = new Map(boxes.map((box) => [box.node.id, box]));
    const links = edges.flatMap((edge) => {
      const from = boxOf.get(edge.from);
      const to = boxOf.get(edge.to);
      return from && to ? [{ edge, path: StudioLayout.#path(from, to, edge) }] : [];
    });
    return { boxes, links, columns, width: x - columnGap + padding, height: height + padding };
  }

  static #order(groups: AkanGraphNode[][], edges: AkanGraphEdge[]): AkanGraphNode[][] {
    const byLabel = (a: AkanGraphNode, b: AkanGraphNode) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    const ordered = groups.map((group) => [...group].sort(byLabel));
    const neighbors = new Map<string, string[]>();
    for (const { from, to } of edges) {
      neighbors.set(from, [...(neighbors.get(from) ?? []), to]);
      neighbors.set(to, [...(neighbors.get(to) ?? []), from]);
    }
    const sweep = (indices: number[]) => {
      const position = new Map(ordered.flatMap((group) => group.map((node, idx) => [node.id, idx] as const)));
      for (const idx of indices) {
        const center = (node: AkanGraphNode) => {
          const around = (neighbors.get(node.id) ?? []).flatMap((id) => {
            const at = position.get(id);
            return at === undefined ? [] : [at];
          });
          return around.length ? around.reduce((sum, at) => sum + at, 0) / around.length : (position.get(node.id) ?? 0);
        };
        const centers = new Map(ordered[idx].map((node) => [node.id, center(node)]));
        ordered[idx].sort((a, b) => (centers.get(a.id) ?? 0) - (centers.get(b.id) ?? 0));
        for (const [at, node] of ordered[idx].entries()) position.set(node.id, at);
      }
    };
    const forward = ordered.map((_, idx) => idx).slice(1);
    sweep(forward);
    sweep([...forward].reverse().map((idx) => idx - 1));
    return ordered;
  }

  static #path(from: StudioBox, to: StudioBox, edge: AkanGraphEdge): string {
    const row =
      edge.kind === "field"
        ? from.rows.find(({ text }) => edge.label === text || edge.label === `${text}[]`)
        : undefined;
    const y1 = row?.y ?? from.y + headerHeight / 2;
    const y2 = to.y + headerHeight / 2;
    const x1 = from.x + from.width;
    if (to.x > from.x + from.width) {
      const bend = Math.max(40, (to.x - x1) / 2);
      return `M${x1},${y1} C${x1 + bend},${y1} ${to.x - bend},${y2} ${to.x},${y2}`;
    }
    const x2 = to.x + to.width;
    const loop = Math.max(x1, x2) + 48;
    return `M${x1},${y1} C${loop},${y1} ${loop},${y2} ${x2},${y2}`;
  }
}
