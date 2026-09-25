"use client";
import { cn } from "akanjs/client";
import { useId, useMemo } from "react";
import { docUi, Panel } from "../Reference";
import {
  type PlacedEdge,
  type SchemaGraphEdge,
  SchemaGraphLayout,
  type SchemaGraphNode,
  type SchemaNodeKind,
} from "./schemaGraph";

const kindDot: { [key in SchemaNodeKind]: string } = {
  database: "fill-primary",
  scalar: "fill-info",
  external: "fill-foreground/25",
};

export interface GraphProps {
  className?: string;
  title?: string;
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
  selectedId?: string | null;
  onSelect?: (nodeId: string) => void;
}

export const Graph = ({ className, title, nodes, edges, selectedId, onSelect }: GraphProps) => {
  const reactId = useId();
  const arrow = `arrow${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const layout = useMemo(() => new SchemaGraphLayout(nodes, edges), [nodes, edges]);
  if (!layout.nodes.length) return <div className={docUi.emptyPanel}>No model is registered.</div>;
  return (
    <Panel
      bodyClassName="max-h-none overflow-x-auto p-4"
      className={className}
      label={title}
      meta={<span className="text-foreground/40 text-xs">Click a node</span>}
    >
      <svg
        className="min-w-fit select-none"
        height={layout.height}
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
      >
        <defs>
          <marker id={arrow} markerHeight="7" markerWidth="8" orient="auto" refX="7" refY="3.5" viewBox="0 0 8 7">
            <path className="fill-border" d="M0 0 L8 3.5 L0 7 z" />
          </marker>
          <marker
            id={`${arrow}On`}
            markerHeight="7"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="3.5"
            viewBox="0 0 8 7"
          >
            <path className="fill-primary" d="M0 0 L8 3.5 L0 7 z" />
          </marker>
        </defs>
        {layout.edges.map((edge, idx) => {
          const active = !!selectedId && (edge.from === selectedId || edge.to === selectedId);
          return (
            <g key={idx}>
              <path
                className={cn("fill-none transition-colors", active ? "stroke-primary" : "stroke-border")}
                d={edge.path}
                markerEnd={`url(#${active ? `${arrow}On` : arrow})`}
                strokeWidth={active ? 1.75 : 1.25}
              >
                <title>{edge.label}</title>
              </path>
              {active ? <EdgeLabel edge={edge} /> : null}
            </g>
          );
        })}
        {layout.nodes.map((node) => {
          const selected = node.id === selectedId;
          return (
            <g
              className="cursor-pointer outline-none"
              key={node.id}
              onClick={() => onSelect?.(node.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                onSelect?.(node.id);
              }}
              role="button"
              tabIndex={0}
            >
              <title>{node.refName}</title>
              <rect
                className={cn(
                  "transition-colors",
                  selected ? "fill-primary/10 stroke-primary" : "fill-card stroke-border hover:stroke-primary/50",
                )}
                height={node.height}
                rx={12}
                strokeWidth={selected ? 2 : 1}
                width={node.width}
                x={node.x}
                y={node.y}
              />
              <circle className={kindDot[node.kind]} cx={node.x + 16} cy={node.y + node.height / 2} r={4} />
              <text
                className={cn("font-semibold text-[13px]", selected ? "fill-primary" : "fill-foreground")}
                x={node.textX}
                y={node.y + 22}
              >
                {node.titleText}
              </text>
              <text className="fill-foreground/45 text-[11px]" x={node.textX} y={node.y + 38}>
                {node.subtitleText}
              </text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
};

interface EdgeLabelProps {
  edge: PlacedEdge;
}
const EdgeLabel = ({ edge }: EdgeLabelProps) => {
  const width = edge.label.length * 5.9 + 14;
  return (
    <g>
      <rect
        className="fill-background stroke-primary/30"
        height={17}
        rx={8.5}
        width={width}
        x={edge.labelX - width / 2}
        y={edge.labelY - 12}
      />
      <text
        className="fill-primary text-[10px]"
        dominantBaseline="middle"
        textAnchor="middle"
        x={edge.labelX}
        y={edge.labelY - 3}
      >
        {edge.label}
      </text>
    </g>
  );
};
