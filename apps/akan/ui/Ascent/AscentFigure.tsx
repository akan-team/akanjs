import { cn } from "akanjs/client";
import { Extrusion, type Vec4 } from "./extrusion.util";

interface AscentFigureProps {
  className?: string;
  dim: number;
  copies?: number;
}
export const AscentFigure = ({ className, dim, copies = 0 }: AscentFigureProps) => {
  const tilt = Extrusion.tilt(dim);
  const camera = { yaw: -0.58 * tilt, pitch: 0.36 * tilt, xw: 0, zw: 0 };
  const scales = Extrusion.scales(dim);
  const center = Extrusion.center(dim, camera);
  const unit = 46 / Extrusion.reach(dim);
  const toView = (vertex: Vec4) => {
    const projected = Extrusion.project(vertex, camera);
    return [(projected.x - center.x) * unit, (center.y - projected.y) * unit] as const;
  };
  const points = Extrusion.vertices.map((vertex) => toView(Extrusion.place(vertex, scales)));
  const newest = Math.max(0, Math.ceil(dim) - 1);
  const ghostAxis = dim >= 2 && dim < 4 ? Math.round(dim) - 1 : 0;
  const ghosts = Array.from({ length: ghostAxis ? Math.max(0, copies - 2) : 0 }, (_, idx) =>
    Extrusion.ghostEdges(ghostAxis).map(([from, to]) => {
      const offset = -1 + (2 * (idx + 1)) / (copies - 1);
      const vertices = [from, to].map((vertexIdx) =>
        toView(Extrusion.ghost(Extrusion.vertices[vertexIdx], ghostAxis, offset, scales)),
      );
      return { key: `${idx}-${from}-${to}`, vertices };
    }),
  ).flat();
  return (
    <svg viewBox="-50 -50 100 100" fill="none" aria-hidden="true" className={cn("overflow-visible", className)}>
      <g stroke="currentColor" strokeDasharray="2 5" className="text-foreground/35">
        {ghosts.map(({ key, vertices: [[x1, y1], [x2, y2]] }) => (
          <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {Extrusion.edges
        .filter(([, to]) => Extrusion.presence(to, scales) > 0.5)
        .map(([from, to, axis]) => (
          <line
            key={`${from}-${to}`}
            x1={points[from][0]}
            y1={points[from][1]}
            x2={points[to][0]}
            y2={points[to][1]}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={axis === newest ? 1.6 : 1.1}
            vectorEffect="non-scaling-stroke"
            className={axis === newest ? "text-primary" : "text-foreground/45"}
          />
        ))}
      {points.map(([cx, cy], idx) =>
        Extrusion.presence(idx, scales) > 0.5 ? (
          <circle key={idx} cx={cx} cy={cy} r={1.2} className="fill-primary" />
        ) : null,
      )}
    </svg>
  );
};
