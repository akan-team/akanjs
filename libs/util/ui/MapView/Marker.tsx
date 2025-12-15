"use client";
import { OVERLAY_MOUSE_TARGET, OverlayViewF } from "@react-google-maps/api";
import type { cnst } from "@util/client";

interface MarkerProps {
  coordinate: cnst.Coordinate;
  zIndex?: number;
  children?: any;
}
export default function Marker({ coordinate, zIndex, children }: MarkerProps) {
  const [lng, lat] = coordinate.coordinates;
  return (
    <OverlayViewF
      zIndex={zIndex}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      // mapPaneName={MARKER_LAYER}
      position={{ lat, lng }}
    >
      <div className="relative flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">{children}</div>
    </OverlayViewF>
  );
}
