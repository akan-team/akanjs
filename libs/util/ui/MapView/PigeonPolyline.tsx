"use client";
import { cnst } from "@util/client";
import { GeoJson } from "pigeon-maps";
import { memo, useContext, useMemo } from "react";

import { MapView } from ".";
import { PigeonMapPropsContext } from "./context";

interface PigeonPolylineProps {
  className?: string;
  coordinates: cnst.Coordinate[];
  style?: { strokeWidth: string; stroke: string };
  showArrows?: boolean;
  arrowPixelDistance?: number; // 화살표 간 거리 (픽셀 단위)
}
export default memo(
  ({ className, coordinates, style, showArrows = false, arrowPixelDistance = 40 }: PigeonPolylineProps) => {
    const contextProps = useContext(PigeonMapPropsContext);

    const polyline = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: coordinates.map((coordinate) => coordinate.coordinates),
          },
        },
      ],
    };

    const arrows = useMemo(() => {
      if (!showArrows || coordinates.length < 2) return [];

      const result: { position: [number, number]; angle: number }[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        const start = coordinates[i];
        const end = coordinates[i + 1];

        // 방향 계산 (각도)
        const angle = cnst.Coordinate.getNedBearing(start, end);

        let arrowCount = 1;

        // 픽셀 기준으로 화살표 개수 계산
        const startAnchor: [number, number] = [start.coordinates[1], start.coordinates[0]];
        const endAnchor: [number, number] = [end.coordinates[1], end.coordinates[0]];

        const [startX, startY] = contextProps.latLngToPixel?.(startAnchor) ?? [0, 0];
        const [endX, endY] = contextProps.latLngToPixel?.(endAnchor) ?? [0, 0];

        const pixelDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        arrowCount = Math.max(1, Math.floor(pixelDistance / arrowPixelDistance));

        // 화살표 위치 계산
        const points = Array.from({ length: arrowCount }, (_, j) => {
          const t = (j + 1) / (arrowCount + 1); // 균등하게 분배
          const lat = start.coordinates[1] + (end.coordinates[1] - start.coordinates[1]) * t;
          const lng = start.coordinates[0] + (end.coordinates[0] - start.coordinates[0]) * t;
          return { position: [lng, lat] as [number, number], angle: angle };
        });

        result.push(...points);
      }

      return result;
    }, [coordinates, showArrows, arrowPixelDistance, contextProps.latLngToPixel]);

    return (
      <>
        <GeoJson
          className={className}
          {...contextProps}
          data={polyline}
          styleCallback={(feature: typeof polyline) => {
            return { strokeWidth: style?.strokeWidth ?? "1", stroke: style?.stroke ?? "black" };
          }}
        />
        {/* 화살표 마커들 */}
        {arrows.map((arrow, index) => (
          <MapView.PigeonMarker
            key={index}
            coordinate={{
              coordinates: arrow.position,
              type: "Point",
              altitude: 0,
            }}
          >
            <div
              style={{
                transform: `rotate(${arrow.angle}deg)`,
                transformOrigin: "center",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M6 0 L12 12 L6 1 L0 12 Z" fill="pink" stroke="black" strokeWidth="2" />
              </svg>
            </div>
          </MapView.PigeonMarker>
        ))}
      </>
    );
  }
);
