export type AkanGraphNodeKind =
  | "model"
  | "scalar"
  | "enum"
  | "query"
  | "slice"
  | "endpoint"
  | "guard"
  | "method"
  | "action"
  | "component";

export type AkanGraphEdgeKind = "field" | "guard" | "calls" | "fetches" | "uses";

export type AkanGraphChange = "added" | "removed" | "changed";

export interface AkanGraphLocation {
  file: string;
  line: number;
  column: number;
}

export interface AkanGraphField {
  name: string;
  type: string | null;
  array: boolean;
  optional: boolean;
  ref: string | null;
  declaredIn: string;
  at: AkanGraphLocation;
  digest?: string;
  change?: AkanGraphChange;
}

export interface AkanGraphNode {
  id: string;
  kind: AkanGraphNodeKind;
  name: string;
  label: string;
  owner: string | null;
  module: string | null;
  detail: string[];
  at: AkanGraphLocation | null;
  fields?: AkanGraphField[];
  values?: string[];
  doc?: string;
  digest?: string;
  change?: AkanGraphChange;
}

export interface AkanGraphEdge {
  from: string;
  to: string;
  kind: AkanGraphEdgeKind;
  label: string | null;
  count: number;
  at: AkanGraphLocation | null;
  change?: Exclude<AkanGraphChange, "changed">;
}

export interface AkanGraph {
  version: 1;
  nodes: AkanGraphNode[];
  edges: AkanGraphEdge[];
}

export interface AkanChangedFile {
  file: string;
  change: AkanGraphChange;
}

export interface AkanChangeMap extends AkanGraph {
  since: string;
  summary: { [change in AkanGraphChange]: number };
  unmapped: AkanChangedFile[];
}
