"use client";
import type { cnst } from "@libs/util/client";
import { type CSSProperties, type ReactNode, useContext, useEffect, useState } from "react";

import { PigeonMapPropsContext } from "./context";

interface PigeonFixedOverlayProps {
  open: boolean;
  coordinate: cnst.Coordinate;
  offset?: [number, number];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export default function PigeonFixedOverlay({
  open,
  coordinate,
  offset = [0, 0],
  className,
  style,
  children,
}: PigeonFixedOverlayProps) {
  const contextProps = useContext(PigeonMapPropsContext);
  const [pixelAnchor, setPixelAnchor] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!open) {
      setPixelAnchor(null);
      return;
    }
    if (pixelAnchor) return;

    const anchor: [number, number] = [coordinate.coordinates[1], coordinate.coordinates[0]];
    setPixelAnchor(contextProps.latLngToPixel?.(anchor) ?? [0, 0]);
  }, [contextProps.latLngToPixel, coordinate, open, pixelAnchor]);

  if (!open || !pixelAnchor) return null;

  return (
    <div
      className={className}
      style={{
        ...style,
        position: "absolute",
        left: pixelAnchor[0] + offset[0],
        top: pixelAnchor[1] + offset[1],
      }}
    >
      {children}
    </div>
  );
}
