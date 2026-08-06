import type { cnst } from "@libs/util/client";

export interface PigeonPolylineProps {
  className?: string;
  coordinates: cnst.Coordinate[];
  style?: { strokeWidth: string; stroke: string };
  showArrows?: boolean;
  arrowPixelDistance?: number; // 화살표 간 거리 (픽셀 단위)
}
