"use client";
import { clsx } from "akanjs/client";
import { Overlay } from "pigeon-maps";
import { useContext } from "react";

import { PigeonMapPropsContext } from "./context";

interface PigeonOverlayProps {
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

export default function PigeonOverlay({ className, bounds, children, onClick }: PigeonOverlayProps) {
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
        className={clsx(className, "itsme absolute -translate-x-1/2 -translate-y-1/2", {
          "cursor-pointer": onClick !== undefined,
        })}
        style={{ width, height }}
        onClick={onClick}
      >
        {children}
      </div>
    </Overlay>
  );
}
