"use client";
import type { cnst } from "@libs/util/client";
import { st } from "@libs/util/client";

interface FocusProps {
  className?: string;
  coordinate?: cnst.Coordinate | null | (() => cnst.Coordinate | null | undefined);
  mapBounds?:
    | { minLat: number; maxLat: number; minLng: number; maxLng: number }
    | null
    | (() => { minLat: number; maxLat: number; minLng: number; maxLng: number } | null | undefined);
  children: any;
  stopPropagation?: boolean;
}
export const Focus = ({ className, coordinate, mapBounds, children, stopPropagation = true }: FocusProps) => {
  return (
    <a
      className={className}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        const coord = typeof coordinate === "function" ? coordinate() : coordinate;
        const bounds = typeof mapBounds === "function" ? mapBounds() : mapBounds;
        st.set({ ...(coord ? { mapCenter: coord } : {}), ...(bounds ? { mapBounds: bounds } : {}) });
      }}
    >
      {children}
    </a>
  );
};
