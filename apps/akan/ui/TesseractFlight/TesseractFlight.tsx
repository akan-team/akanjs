import { cn } from "akanjs/client";
import { FlightMount } from "./FlightMount";
import { Hypercube } from "./hypercube.util";

interface TesseractFlightProps {
  className?: string;
  labels?: string[];
}
export const TesseractFlight = ({ className, labels = [] }: TesseractFlightProps) => {
  return (
    <FlightMount labels={labels}>
      <svg
        aria-hidden="true"
        data-tesseract-flight
        className={cn(
          "pointer-events-none fixed inset-0 z-0 size-full text-primary opacity-0 transition-opacity duration-1000 contain-strict data-live:opacity-100 print:hidden",
          className,
        )}
      >
        <g data-role="body">
          <g data-role="halo" display="none" stroke="currentColor" strokeWidth={8} strokeLinecap="round" opacity={0.14}>
            {Hypercube.edges.map((_, idx) => (
              <line key={idx} />
            ))}
          </g>
          <g data-role="edge" stroke="currentColor" strokeLinecap="round">
            {Hypercube.edges.map((_, idx) => (
              <line key={idx} />
            ))}
          </g>
          <g data-role="glow" display="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            {Hypercube.edges.map((_, idx) => (
              <line key={idx} />
            ))}
          </g>
          <g data-role="dot" fill="currentColor">
            {Hypercube.vertices.map((_, idx) => (
              <circle key={idx} r={0} />
            ))}
          </g>
          <text data-role="label" textAnchor="middle" opacity={0} className="fill-foreground font-semibold text-sm">
            <tspan data-role="step" className="fill-primary font-mono text-xs" />
            <tspan data-role="name" dx={10} />
          </text>
        </g>
      </svg>
    </FlightMount>
  );
};
