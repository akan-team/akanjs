"use client";
import type { cnst } from "@libs/util/client";
import { GeoJson, type PigeonProps } from "pigeon-maps";
import { type CSSProperties, useContext } from "react";

import { PigeonMapPropsContext } from "./context";
import { pigeonSvgAttributes } from "./pigeonSvg.util";

interface PigeonPolygonProps extends PigeonProps {
  className?: string;
  coordinates: cnst.Coordinate[];
  style?: CSSProperties;
  onClick?: () => void;
}
export default function PigeonPolygon({ className, coordinates, ...props }: PigeonPolygonProps) {
  const contextProps = useContext(PigeonMapPropsContext);
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
            geometry: { type: "Polygon", coordinates: [coordinates.map((coordinate) => coordinate.coordinates)] },
          },
        ],
      }}
      styleCallback={() => {
        return pigeonSvgAttributes(props.style);
      }}
    />
  );
}
