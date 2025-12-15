import { store } from "@akanjs/store";

import * as cnst from "../cnst";
import { RootStore } from "../st";

export class UtilStore extends store("util" as const, {
  notiPermission: "default" as NotificationPermission,
  mapCenter: { type: "Point", coordinates: [127.0016985, 37.5642135] } as cnst.Coordinate,
  mapZoom: 8,
  mapBounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 } as {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  },
  mapPanControl: true,
}) {
  fitToScreenByCoordinate(...coordinates: cnst.Coordinate[]) {
    (this as unknown as RootStore).set({ mapBounds: cnst.Coordinate.getBounds(...coordinates) });
  }
  fitToScreenThroughCenterAndZoom(locations: cnst.Coordinate[]) {
    const result = cnst.Coordinate.computeCenterAndZoomFromLocations(locations);
    if (!result) return;
    (this as unknown as RootStore).set({ mapCenter: result.center, mapZoom: result.zoom });
  }
}
