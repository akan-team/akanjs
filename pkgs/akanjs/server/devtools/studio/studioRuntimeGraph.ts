import type { DepNode, DepsData, DevtoolsApp, InternalNode, SignalData } from "../types";
import type { StudioEdge, StudioNode, StudioRow } from "./studioLayout";

export interface StudioRuntimePayload {
  app: DevtoolsApp;
  deps: DepsData | { error: string };
  signal: SignalData | { error: string };
}

export interface StudioRuntimeColumn {
  label: string;
  nodes: StudioNode[];
}

const everyUnits: [ms: number, unit: string][] = [
  [86_400_000, "d"],
  [3_600_000, "h"],
  [60_000, "min"],
  [1000, "s"],
];

export class StudioRuntimeGraph {
  readonly columns: StudioRuntimeColumn[];
  readonly edges: StudioEdge[];
  readonly modules: string[];
  readonly #jobs: Map<string, InternalNode[]>;

  constructor(deps: DepsData, signal: SignalData | null) {
    const implOf = new Map(deps.roles.map(({ role, impl }) => [`adaptor:${role}`, `adaptor:${impl}`]));
    const canonical = (id: string) => implOf.get(id) ?? id;
    const moduleOf = new Map<string, string>();
    for (const edge of deps.edges)
      if (edge.kind === "database") moduleOf.set(canonical(edge.to), edge.from.slice("service:".length));
    const services = deps.nodes.filter((node) => node.kind === "service");
    const adaptors = deps.nodes.filter((node) => node.kind === "adaptor" && !implOf.has(node.id));
    this.#jobs = StudioRuntimeGraph.#jobsOf(signal);
    const internals = [...this.#jobs.keys()].map((id) => StudioRuntimeGraph.#internalNode(id, signal));
    this.columns = [
      { label: "Jobs", nodes: internals },
      ...StudioRuntimeGraph.#byStage(services, deps.stages.service.length, "Services", (node) =>
        StudioRuntimeGraph.#node(node, node.refName, node.serviceType === "database" ? ["database"] : []),
      ),
      ...StudioRuntimeGraph.#byStage(adaptors, deps.stages.adaptor.length, "Adaptors", (node) =>
        StudioRuntimeGraph.#node(node, moduleOf.get(node.id) ?? null, node.role ? [node.role] : []),
      ),
    ];
    const drawn = new Set(this.columns.flatMap((column) => column.nodes.map((node) => node.id)));
    const edges = new Map<string, StudioEdge>();
    for (const { from, to: declared, kind, prop } of deps.edges) {
      const to = canonical(declared);
      if (!drawn.has(from) || !drawn.has(to)) continue;
      const key = `${from}\n${to}\n${kind}`;
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
        existing.label = `${existing.label}, ${prop}`;
      } else edges.set(key, { from, to, kind, label: prop, count: 1, at: null });
    }
    this.edges = [...edges.values()];
    this.modules = services.map((node) => node.refName).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  static of(payload: StudioRuntimePayload): StudioRuntimeGraph | null {
    if ("error" in payload.deps) return null;
    return new StudioRuntimeGraph(payload.deps, "error" in payload.signal ? null : payload.signal);
  }

  rowsOf(node: StudioNode): Omit<StudioRow, "y">[] {
    const jobs = this.#jobs.get(node.id);
    if (!jobs) return node.detail.length ? [{ text: node.detail.join(" · "), hint: "", at: null }] : [];
    return jobs.map((job) => {
      const text = `${job.type} ${job.key}`;
      const hint = StudioRuntimeGraph.#scheduleOf(job);
      return {
        text,
        hint,
        title: hint ? `${text} · ${hint}` : text,
        at: null,
        ...(job.scheduledHere ? {} : { skipped: job.skipReason ?? "not scheduled on this server" }),
      };
    });
  }

  static #jobsOf(signal: SignalData | null) {
    const jobs = new Map<string, InternalNode[]>();
    for (const { classNames, internal } of Object.values(signal?.signals ?? {})) {
      const list = Object.values(internal).filter((job) => job.type !== "resolveField");
      if (classNames.internal && list.length) jobs.set(`internal:${classNames.internal}`, list);
    }
    return jobs;
  }

  static #internalNode(id: string, signal: SignalData | null): StudioNode {
    const refName = Object.values(signal?.signals ?? {}).find(
      ({ classNames }) => `internal:${classNames.internal}` === id,
    )?.refName;
    const name = id.slice("internal:".length);
    return { id, kind: "internal", name, label: name, owner: null, module: refName ?? null, detail: [], at: null };
  }

  static #node(node: DepNode, module: string | null, detail: string[]): StudioNode {
    const kind = node.kind === "service" ? "service" : "adaptor";
    return { id: node.id, kind, name: node.refName, label: node.refName, owner: null, module, detail, at: null };
  }

  //? An injection always targets an earlier boot stage, so laying stages out latest-first keeps every arrow rightward.
  static #byStage(
    nodes: DepNode[],
    stageNum: number,
    label: string,
    toNode: (node: DepNode) => StudioNode,
  ): StudioRuntimeColumn[] {
    const columnNum = Math.max(stageNum, 1);
    return Array.from({ length: columnNum }, (_, idx) => {
      const stage = columnNum - 1 - idx;
      return {
        label: columnNum > 1 ? `${label} · stage ${stage + 1}` : label,
        nodes: nodes.filter((node) => Math.min(node.stage ?? 0, columnNum - 1) === stage).map(toNode),
      };
    });
  }

  static #scheduleOf({ type, schedule }: InternalNode) {
    if (schedule?.cron) return schedule.cron;
    const everyMs = schedule?.everyMs;
    if (everyMs === undefined) return "";
    const [size, unit] = everyUnits.find(([size]) => everyMs >= size && everyMs % size === 0) ?? [1, "ms"];
    return `${type === "timeout" ? "after" : "every"} ${everyMs / size} ${unit}`;
  }
}
