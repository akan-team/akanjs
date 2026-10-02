import { cn } from "akanjs/client";
import { DiagramFrame } from "./DiagramFrame";
import { flowToneClass } from "./diagram.util";
import { FlowStack } from "./FlowStack";
import { type FlowDirection, type FlowEdge, FlowLayout, type FlowNodeInput } from "./flow.util";

interface FlowProps<K extends string> {
  className?: string;
  title?: string;
  nodes: Record<K, FlowNodeInput>;
  edges: FlowEdge<K>[];
  direction?: FlowDirection;
  emphasis?: K[];
}

export const Flow = <K extends string>({
  className,
  title,
  nodes,
  edges,
  direction = "LR",
  emphasis = [],
}: FlowProps<K>) => {
  const layout = new FlowLayout(nodes, edges, direction);
  const marked = new Set<string>(emphasis);

  return (
    <div
      className={cn(
        "@container studio-lift my-5 overflow-hidden rounded-2xl border border-foreground/8 bg-card/80",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-2 border-foreground/6 border-b bg-foreground/3 px-4 py-2.5 font-bold text-foreground/75 text-sm">
          <span aria-hidden className="jelly tint-primary size-2.5 shrink-0 rounded-full" />
          {title}
        </div>
      ) : null}
      <div className="@max-[520px]:hidden p-5">
        <DiagramFrame height={layout.height} label={title} width={layout.width}>
          <div className="relative" style={{ height: layout.height, width: layout.width }}>
            <svg aria-hidden="true" className="absolute inset-0" height={layout.height} width={layout.width}>
              {layout.edges.map((edge) => (
                <g key={edge.key}>
                  <path className="fill-none stroke-border" d={edge.path} strokeWidth={1.5} />
                  <path className="fill-border" d={edge.arrow} />
                  {edge.label ? (
                    <>
                      <rect
                        className="fill-card"
                        height={18}
                        rx={6}
                        width={edge.labelWidth}
                        x={edge.labelX - edge.labelWidth / 2}
                        y={edge.labelY - 9}
                      />
                      <text
                        className="fill-foreground/70"
                        dominantBaseline="middle"
                        fontSize={11}
                        textAnchor="middle"
                        x={edge.labelX}
                        y={edge.labelY}
                      >
                        {edge.label}
                      </text>
                    </>
                  ) : null}
                </g>
              ))}
            </svg>
            {layout.nodes.map((node) => (
              <div
                className={cn(
                  "absolute flex flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-center font-semibold text-xs leading-[17px]",
                  flowToneClass[node.tone],
                  marked.has(node.id) && "ring-2 ring-primary",
                )}
                key={node.id}
                style={{ height: node.height, left: node.x, top: node.y, width: node.width }}
              >
                <span>{node.label}</span>
                {node.lines.map((line) => (
                  <span className="text-foreground/60" key={line}>
                    {line}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </DiagramFrame>
      </div>
      <div className="@max-[520px]:block hidden p-5">
        <FlowStack edges={edges} emphasis={emphasis} nodes={nodes} />
      </div>
    </div>
  );
};
