"use client";
import type { cnst } from "@libs/util/client";
import { GeoJson, type PigeonProps } from "pigeon-maps";
import { type CSSProperties, useContext } from "react";

import { PigeonMapPropsContext } from "./context";
import { createArcGeometry } from "./util";

interface PigeonArcProps extends PigeonProps {
  className?: string;
  center: cnst.Coordinate;
  minRadius: number;
  maxRadius: number;
  direction: number;
  angle: number;
  styleCallback?: any;
  hover?: any;
  feature?: any;
  style?: CSSProperties;
  onClick?: () => void;
}

export default function PigeonArc({
  className,
  center,
  minRadius,
  maxRadius,
  direction,
  angle,
  ...props
}: PigeonArcProps) {
  const contextProps = useContext(PigeonMapPropsContext);

  const arcCoordinates = createArcGeometry(center, minRadius, maxRadius, direction, angle);

  return (
    <GeoJson
      className={className}
      {...contextProps}
      {...props}
      data={{
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: arcCoordinates },
          },
        ],
      }}
      styleCallback={() => {
        return props.style;
      }}
    />
  );
}
