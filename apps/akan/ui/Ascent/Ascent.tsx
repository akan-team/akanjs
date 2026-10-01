import { cn } from "akanjs/client";
import { AscentMount } from "./AscentMount";
import { Extrusion } from "./extrusion.util";

interface AscentLabels {
  line: string;
  layers: string[];
  platforms: string[];
  audiences: string[];
  surfaces: string[];
}

interface AscentProps {
  className?: string;
  labels: AscentLabels;
}
export const Ascent = ({ className, labels }: AscentProps) => {
  const ghostCounts = [labels.layers.length, labels.platforms.length, Extrusion.sweepCopies].map(
    (copies, idx) => Math.max(0, copies - 2) * Extrusion.ghostEdges(idx + 1).length,
  );
  return (
    <AscentMount>
      <svg
        aria-hidden="true"
        data-ascent-view
        className={cn(
          "pointer-events-none fixed inset-0 z-0 size-full opacity-0 transition-opacity duration-1000 contain-strict data-live:opacity-100 print:hidden",
          className,
        )}
      >
        <g data-role="body">
          {ghostCounts.map((count, idx) => (
            <g
              key={idx}
              data-role={`ghost-${idx + 1}`}
              display="none"
              stroke="currentColor"
              strokeDasharray={idx === 2 ? undefined : "2 6"}
              strokeLinecap="round"
              className={idx === 2 ? "text-primary/40" : "text-foreground/45"}
            >
              {Array.from({ length: count }, (_, lineIdx) => (
                <line key={lineIdx} />
              ))}
            </g>
          ))}
          {(["base", "accent"] as const).map((role) => (
            <g
              key={role}
              data-role={role}
              stroke="currentColor"
              strokeLinecap="round"
              className={role === "base" ? "text-foreground" : "text-primary"}
            >
              {Extrusion.axisEdges.map((edges, axis) => (
                <g key={axis}>
                  {edges.map((_, idx) => (
                    <line key={idx} display="none" />
                  ))}
                </g>
              ))}
            </g>
          ))}
          <g data-role="dot" className="fill-primary">
            {Extrusion.vertices.map((_, idx) => (
              <circle key={idx} r={0} />
            ))}
          </g>
          <g className="stroke-4 stroke-background font-mono text-[11px] [paint-order:stroke] [stroke-linejoin:round]">
            <g data-set="line" display="none" textAnchor="middle" className="fill-foreground text-sm">
              <text>{labels.line}</text>
            </g>
            <g data-set="layers" display="none" className="fill-foreground/70">
              {labels.layers.map((label) => (
                <text key={label}>{label}</text>
              ))}
            </g>
            <g data-set="platforms" display="none" textAnchor="end" className="fill-foreground/80">
              {labels.platforms.map((label) => (
                <text key={label}>{label}</text>
              ))}
            </g>
            <g data-set="audiences" display="none" textAnchor="middle" className="fill-primary font-semibold text-xs">
              {labels.audiences.map((label) => (
                <text key={label}>{label}</text>
              ))}
            </g>
            <g data-set="surfaces" display="none" className="fill-foreground/90">
              {labels.surfaces.map((label) => (
                <text key={label}>{label}</text>
              ))}
            </g>
          </g>
          <text
            data-role="hud"
            textAnchor="middle"
            opacity={0}
            className="fill-foreground/45 font-mono text-[10px] tracking-[0.2em] max-sm:hidden"
          />
        </g>
      </svg>
    </AscentMount>
  );
};
