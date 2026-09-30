"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { FlightPilot } from "./flightPilot.util";

interface FlightMountProps {
  labels: string[];
  children: ReactNode;
}
export const FlightMount = ({ labels, children }: FlightMountProps) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = mountRef.current?.querySelector<SVGSVGElement>("svg[data-tesseract-flight]");
    if (!svg) return;
    const pilot = new FlightPilot(svg, labels);
    pilot.start();
    return () => pilot.stop();
  }, [labels]);

  return (
    <div ref={mountRef} className="contents">
      {children}
    </div>
  );
};
