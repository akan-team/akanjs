"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { AscentPilot } from "./ascentPilot.util";

interface AscentMountProps {
  children: ReactNode;
}
export const AscentMount = ({ children }: AscentMountProps) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = mountRef.current?.querySelector<SVGSVGElement>("svg[data-ascent-view]");
    if (!svg) return;
    const pilot = new AscentPilot(svg);
    pilot.start();
    return () => pilot.stop();
  }, []);

  return (
    <div ref={mountRef} className="contents">
      {children}
    </div>
  );
};
