import type { cnst } from "@libs/util/client";

export function createArcGeometry(
  center: cnst.Coordinate,
  minRadius: number,
  maxRadius: number,
  direction: number,
  angle: number,
): number[][][] {
  const centerLat = center.coordinates[1];
  const centerLon = center.coordinates[0];

  const startAngle = direction - angle / 2;

  const earthRadius = 6371000;
  const points: number[][] = [];

  const numPoints = Math.max(16, Math.floor(angle / 5));

  for (let i = 0; i <= numPoints; i++) {
    const currentAngle = startAngle + (angle * i) / numPoints;
    const radians = (currentAngle * Math.PI) / 180;

    const maxLat = centerLat + (maxRadius / earthRadius) * (180 / Math.PI) * Math.cos(radians);
    const maxLon =
      centerLon +
      ((maxRadius / earthRadius) * (180 / Math.PI) * Math.sin(radians)) / Math.cos((centerLat * Math.PI) / 180);

    points.push([maxLon, maxLat]);
  }

  for (let i = numPoints; i >= 0; i--) {
    const currentAngle = startAngle + (angle * i) / numPoints;
    const radians = (currentAngle * Math.PI) / 180;

    const minLat = centerLat + (minRadius / earthRadius) * (180 / Math.PI) * Math.cos(radians);
    const minLon =
      centerLon +
      ((minRadius / earthRadius) * (180 / Math.PI) * Math.sin(radians)) / Math.cos((centerLat * Math.PI) / 180);

    points.push([minLon, minLat]);
  }

  points.push(points[0]);

  return [points];
}
