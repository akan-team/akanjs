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
}

export interface AkanGraphEdge {
  from: string;
  to: string;
  kind: AkanGraphEdgeKind;
  label: string | null;
  count: number;
  at: AkanGraphLocation | null;
}

export interface AkanGraph {
  version: 1;
  nodes: AkanGraphNode[];
  edges: AkanGraphEdge[];
}
