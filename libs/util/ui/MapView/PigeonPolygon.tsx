"use client";
import type { cnst } from "@util/client";
import { GeoJson, PigeonProps } from "pigeon-maps";
import { type CSSProperties, useContext } from "react";

import { PigeonMapPropsContext } from "./context";

interface PigeonPolygonProps extends PigeonProps {
  className?: string;
  coordinates: cnst.Coordinate[];
  styleCallback?: any;
  hover?: any;
  feature?: any;
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
        return props.style;
      }}
    />
  );
}
