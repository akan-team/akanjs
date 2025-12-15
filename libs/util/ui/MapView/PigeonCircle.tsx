"use client";
import { clsx } from "@akanjs/client";
import { cnst } from "@util/client";
import { useContext } from "react";

import { PigeonMapPropsContext } from "./context";
import PigeonMarker from "./PigeonMarker";

interface Props {
  className?: string;
  center: cnst.Coordinate;
  point: cnst.Coordinate;
  onClick?: () => void;
}
export default function PigeonCircle({ className, center, point, onClick }: Props) {
  const contextProps = useContext(PigeonMapPropsContext);

  const centerAnchor: [number, number] = [center.coordinates[1], center.coordinates[0]];
  const pointAnchor: [number, number] = [point.coordinates[1], point.coordinates[0]];

  const [centerX, centerY] = contextProps.latLngToPixel?.(centerAnchor) ?? [0, 0];
  const [pointX, pointY] = contextProps.latLngToPixel?.(pointAnchor) ?? [0, 0];

  const radiusInPixel = Math.sqrt(Math.pow(centerX - pointX, 2) + Math.pow(centerY - pointY, 2));

  return (
    <PigeonMarker coordinate={center}>
      <div
        className={clsx(className, "rounded-full border-2", {
          "cursor-pointer": onClick !== undefined,
        })}
        style={{ width: radiusInPixel * 2, height: radiusInPixel * 2 }}
        onClick={onClick}
      />
    </PigeonMarker>
  );
}
