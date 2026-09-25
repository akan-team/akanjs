"use client";
import { cn } from "akanjs/client";
import { Overlay } from "pigeon-maps";
import { useContext } from "react";

import { PigeonMapPropsContext } from "./context";

interface Props {
  className?: string;
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
  children?: any;
  onClick?: () => void;
}

export default function PigeonOverlay({ className, bounds, children, onClick }: Props) {
  const contextProps = useContext(PigeonMapPropsContext);

  const centerLng = (bounds.west + bounds.east) / 2;
  const centerLat = (bounds.north + bounds.south) / 2;

  const [centerX, centerY] = contextProps.latLngToPixel?.([centerLat, centerLng]) ?? [0, 0];
  const [westX] = contextProps.latLngToPixel?.([bounds.south, bounds.west]) ?? [0, 0];
  const [eastX] = contextProps.latLngToPixel?.([bounds.north, bounds.east]) ?? [0, 0];
  const [, northY] = contextProps.latLngToPixel?.([bounds.north, bounds.west]) ?? [0, 0];
  const [, southY] = contextProps.latLngToPixel?.([bounds.south, bounds.east]) ?? [0, 0];

  const width = Math.abs(eastX - westX);
  const height = Math.abs(northY - southY);

  return (
    <Overlay {...contextProps} left={centerX} top={centerY}>
      <div
        className={cn(className, "itsme absolute -translate-x-1/2 -translate-y-1/2", onClick ? "cursor-pointer" : null)}
        style={{ width, height }}
        onClick={onClick}
      >
        {children}
      </div>
    </Overlay>
  );
}
