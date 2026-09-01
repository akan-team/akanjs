import { cn } from "akanjs/client";
import { useMemo } from "react";

const TILE_SIZE = 256;
const EARTH_CIRCUMFERENCE = 40075016.686;
const MAX_BAR_WIDTH = 100;
const NICE_DISTANCES = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000,
];

function computeScale(zoom: number, lat: number) {
  const metersPerPixel = (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom);
  const maxMeters = metersPerPixel * MAX_BAR_WIDTH;

  let distance = NICE_DISTANCES[0];
  for (const d of NICE_DISTANCES) {
    if (d <= maxMeters) distance = d;
    else break;
  }

  const barWidthPx = Math.round(distance / metersPerPixel);
  const label = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;
  return { barWidthPx, label };
}

interface ScaleBarProps {
  className?: string;
  zoom: number;
  lat: number;
}
export default function ScaleBar({ className, zoom, lat }: ScaleBarProps) {
  const { barWidthPx, label } = useMemo(() => computeScale(zoom, lat), [zoom, lat]);

  return (
    <div className={cn("pointer-events-none flex flex-col items-end drop-shadow-[0_1px_2px_black]", className)}>
      <span className="mb-0.5 font-medium text-white text-xs leading-none">{label}</span>
      <div className="border-white border-r-2 border-b-2 border-l-2" style={{ width: barWidthPx, height: 6 }} />
    </div>
  );
}
