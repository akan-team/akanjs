export type SchemaNodeKind = "database" | "scalar" | "external";

export interface SchemaGraphNode {
  id: string;
  refName: string;
  title: string;
  subtitle: string;
  kind: SchemaNodeKind;
}

export interface SchemaGraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface PlacedNode extends SchemaGraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
  titleText: string;
  subtitleText: string;
}

export interface PlacedEdge extends SchemaGraphEdge {
  path: string;
  labelX: number;
  labelY: number;
}

const NODE_HEIGHT = 52;
const COLUMN_GAP = 104;
const ROW_GAP = 22;
const PAD = 16;
const SELF_LOOP_RISE = 44;
const BACK_EDGE_SAG = 46;
const TITLE_CHAR = 7.4;
const SUBTITLE_CHAR = 6.2;
const TEXT_LEFT = 32;
const TEXT_RIGHT = 16;

/**
 * Layered left-to-right placement (longest-path layering + barycenter ordering), the same shape a `flowchart LR`
 * produces without the renderer. Pure geometry so it is unit-testable and runs identically on the server.
 */
export class SchemaGraphLayout {
  readonly nodes: PlacedNode[];
  readonly edges: PlacedEdge[];
  readonly width: number;
  readonly height: number;

  constructor(nodes: SchemaGraphNode[], edges: SchemaGraphEdge[]) {
    const ids = new Set(nodes.map((node) => node.id));
    const links = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    const layers = this.#assignLayers(nodes, this.#feedForward(nodes, links));
    const columns = this.#orderColumns(nodes, links, layers);
    this.nodes = this.#place(columns, links);
    const byId = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = links.flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      return from && to ? [{ ...edge, ...this.#route(from, to) }] : [];
    });
    this.width = this.nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0) + PAD;
    const bottom = this.nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
    this.height = bottom + PAD + (links.some((edge) => this.#isBack(byId, edge)) ? BACK_EDGE_SAG + 24 : 0);
  }

  /**
   * Depth-first feedback-arc removal. A schema legally holds reference cycles (`user.org` / `org.owner`), and
   * layering one directly pushes both ends apart once per pass — the graph came out with a dozen empty columns
   * between them. The cycle's edges are still drawn, just not allowed to decide a column.
   */
  #feedForward(nodes: SchemaGraphNode[], links: SchemaGraphEdge[]) {
    const outgoing = new Map<string, SchemaGraphEdge[]>();
    for (const edge of links) {
      if (edge.from === edge.to) continue;
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    }
    const state = new Map<string, "open" | "done">();
    const back = new Set<SchemaGraphEdge>();
    const walk = (id: string) => {
      state.set(id, "open");
      for (const edge of outgoing.get(id) ?? []) {
        const seen = state.get(edge.to);
        if (seen === "open") back.add(edge);
        else if (!seen) walk(edge.to);
      }
      state.set(id, "done");
    };
    for (const node of nodes) {
      if (!state.has(node.id)) walk(node.id);
    }
    return links.filter((edge) => edge.from !== edge.to && !back.has(edge));
  }

  #assignLayers(nodes: SchemaGraphNode[], forward: SchemaGraphEdge[]) {
    const layers = new Map(nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < nodes.length; pass += 1) {
      let moved = false;
      for (const edge of forward) {
        const next = (layers.get(edge.from) ?? 0) + 1;
        if (next <= (layers.get(edge.to) ?? 0)) continue;
        layers.set(edge.to, next);
        moved = true;
      }
      if (!moved) break;
    }
    return layers;
  }

  #orderColumns(nodes: SchemaGraphNode[], links: SchemaGraphEdge[], layers: Map<string, number>) {
    const depth = Math.max(...nodes.map((node) => layers.get(node.id) ?? 0)) + 1;
    const columns = Array.from({ length: depth }, (_, index) =>
      nodes.filter((node) => (layers.get(node.id) ?? 0) === index),
    );
    const indexOf = new Map<string, number>();
    columns.forEach((column) => {
      column.forEach((node, index) => {
        indexOf.set(node.id, index);
      });
    });
    const barycenter = (id: string, neighbours: string[]) =>
      neighbours.length
        ? neighbours.reduce((sum, other) => sum + (indexOf.get(other) ?? 0), 0) / neighbours.length
        : (indexOf.get(id) ?? 0);
    for (let sweep = 0; sweep < 2; sweep += 1) {
      columns.forEach((column, index) => {
        if (index === 0) return;
        const sorted = [...column].sort(
          (a, b) =>
            barycenter(
              a.id,
              links.filter((edge) => edge.to === a.id).map((edge) => edge.from),
            ) -
            barycenter(
              b.id,
              links.filter((edge) => edge.to === b.id).map((edge) => edge.from),
            ),
        );
        columns[index] = sorted;
        sorted.forEach((node, position) => {
          indexOf.set(node.id, position);
        });
      });
    }
    return columns;
  }

  #place(columns: SchemaGraphNode[][], links: SchemaGraphEdge[]) {
    const widths = columns.map((column) => column.reduce((max, node) => Math.max(max, this.#widthOf(node)), 0));
    const tallest = columns.reduce(
      (max, column) => Math.max(max, column.length * NODE_HEIGHT + Math.max(0, column.length - 1) * ROW_GAP),
      0,
    );
    const top = PAD + (links.some((edge) => edge.from === edge.to) ? SELF_LOOP_RISE : 0);
    let x = PAD;
    const placed: PlacedNode[] = [];
    columns.forEach((column, index) => {
      const width = widths[index] ?? 0;
      const columnHeight = column.length * NODE_HEIGHT + Math.max(0, column.length - 1) * ROW_GAP;
      const offset = top + (tallest - columnHeight) / 2;
      column.forEach((node, row) => {
        placed.push({
          ...node,
          x,
          y: offset + row * (NODE_HEIGHT + ROW_GAP),
          width,
          height: NODE_HEIGHT,
          textX: x + TEXT_LEFT,
          titleText: this.#fit(node.title, width - TEXT_LEFT - TEXT_RIGHT, TITLE_CHAR),
          subtitleText: this.#fit(node.subtitle, width - TEXT_LEFT - TEXT_RIGHT, SUBTITLE_CHAR),
        });
      });
      x += width + COLUMN_GAP;
    });
    return placed;
  }

  #widthOf(node: SchemaGraphNode) {
    const text = Math.max(node.title.length * TITLE_CHAR, node.subtitle.length * SUBTITLE_CHAR);
    return Math.min(248, Math.max(148, Math.round(text) + TEXT_LEFT + TEXT_RIGHT));
  }

  #fit(text: string, width: number, charWidth: number) {
    const max = Math.floor(width / charWidth);
    return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
  }

  #isBack(byId: Map<string, PlacedNode>, edge: SchemaGraphEdge) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return !!from && !!to && from.id !== to.id && to.x <= from.x;
  }

  #route(from: PlacedNode, to: PlacedNode) {
    if (from.id === to.id) {
      const cx = from.x + from.width / 2;
      const top = from.y;
      const rise = top - SELF_LOOP_RISE;
      return {
        path: `M ${cx - 20} ${top} C ${cx - 30} ${rise}, ${cx + 30} ${rise}, ${cx + 20} ${top}`,
        labelX: cx,
        labelY: rise + 4,
      };
    }
    if (to.x > from.x) {
      const sx = from.x + from.width;
      const sy = from.y + from.height / 2;
      const tx = to.x;
      const ty = to.y + to.height / 2;
      const bow = Math.max(36, (tx - sx) * 0.55);
      return {
        path: `M ${sx} ${sy} C ${sx + bow} ${sy}, ${tx - bow} ${ty}, ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: (sy + ty) / 2 - 9,
      };
    }
    const sx = from.x + from.width / 2;
    const sy = from.y + from.height;
    const tx = to.x + to.width / 2;
    const ty = to.y + to.height;
    const sag = Math.max(sy, ty) + BACK_EDGE_SAG;
    return {
      path: `M ${sx} ${sy} C ${sx} ${sag}, ${tx} ${sag}, ${tx} ${ty}`,
      labelX: (sx + tx) / 2,
      labelY: sag - 6,
    };
  }
}
