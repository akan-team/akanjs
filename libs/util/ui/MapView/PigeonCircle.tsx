"use client";
import { cnst } from "@libs/util/client";
import { clsx } from "akanjs/client";
import { useContext } from "react";

import { PigeonMapPropsContext } from "./context";
import PigeonMarker from "./PigeonMarker";

interface PigeonCircleProps {
  className?: string;
  center: cnst.Coordinate;
  point?: cnst.Coordinate;
  radius?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}
export default function PigeonCircle({ className, center, point, radius, onClick, children }: PigeonCircleProps) {
  const contextProps = useContext(PigeonMapPropsContext);

  const centerAnchor: [number, number] = [center.coordinates[1], center.coordinates[0]];
  const pointAnchor: [number, number] = point
    ? [point.coordinates[1], point.coordinates[0]]
    : radius
      ? [
          cnst.Coordinate.getTargetCoordinate(center, 0, radius).coordinates[1],
          cnst.Coordinate.getTargetCoordinate(center, 0, radius).coordinates[0],
        ]
      : [0, 0];

  const [centerX, centerY] = contextProps.latLngToPixel?.(centerAnchor) ?? [0, 0];
  const [pointX, pointY] = contextProps.latLngToPixel?.(pointAnchor) ?? [0, 0];

  const radiusInPixel = Math.sqrt((centerX - pointX) ** 2 + (centerY - pointY) ** 2);

  return (
    <PigeonMarker coordinate={center}>
      <div
        className={clsx(className, "rounded-full border-2", {
          "cursor-pointer": onClick !== undefined,
        })}
        style={{ width: radiusInPixel * 2, height: radiusInPixel * 2 }}
        onClick={onClick}
      >
        {children}
      </div>
    </PigeonMarker>
  );
}
