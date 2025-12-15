import { scalarDictionary } from "@akanjs/dictionary";

import type { Coordinate, CoordinateType } from "./coordinate.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Coordinate", "좌표"]).desc(["Geographic coordinate information", "지리적 좌표 정보"]))
  .model<Coordinate>((t) => ({
    type: t(["Type", "타입"]).desc(["Coordinate type", "좌표 타입"]),
    coordinates: t(["Coordinates", "좌표"]).desc(["Longitude and latitude values", "경도와 위도 값"]),
    altitude: t(["Altitude", "고도"]).desc(["Altitude in meters", "미터 단위 고도"]),
  }))
  .enum<CoordinateType>("coordinateType", (t) => ({
    Point: t(["Point", "포인트"]).desc(["Point coordinate type", "포인트 좌표 타입"]),
  }));
