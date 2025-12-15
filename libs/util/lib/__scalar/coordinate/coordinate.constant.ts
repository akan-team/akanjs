import { enumOf, Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0], example: [127.114367, 37.497114] }),
  altitude: field(Float, { default: 0 }),
})) {
  static getTotalDistanceKm(...coords: Coordinate[]) {
    return coords.reduce((acc, cur, idx) => {
      if (idx === 0) return 0;
      return acc + this.getDistanceKm(coords[idx - 1], cur);
    }, 0);
  }
  static getDistanceKm(loc1: Coordinate, loc2: Coordinate) {
    const [lon1, lat1] = loc1.coordinates;
    const [lon2, lat2] = loc2.coordinates;
    const R = 6371; // Earth's radius in kilometers
    function toRadians(degrees: number): number {
      return (degrees * Math.PI) / 180;
    }
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }
  static getDistanceM(loc1: Coordinate, loc2: Coordinate) {
    const km = this.getDistanceKm(loc1, loc2);
    return km * 1000;
  }
  static get3DDistanceM(loc1: Coordinate, loc2: Coordinate) {
    const groundDistance = this.getDistanceM(loc1, loc2);
    const altitudeDistance = Math.abs(loc1.altitude - loc2.altitude);
    return Math.sqrt(groundDistance ** 2 + altitudeDistance ** 2);
  }
  static getTotal3DDistanceM(...coordinates: Coordinate[]) {
    return coordinates.reduce((acc, cur, idx) => {
      if (idx === 0) return 0;
      return acc + this.get3DDistanceM(coordinates[idx - 1], cur);
    }, 0);
  }
  static getBounds(...coordinates: Coordinate[]) {
    const lats = coordinates.map((c) => c.coordinates[1]);
    const lons = coordinates.map((c) => c.coordinates[0]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lons);
    const maxLng = Math.max(...lons);
    return { minLat, maxLat, minLng, maxLng };
  }
  static getAngleDegree(loc1: Coordinate, loc2: Coordinate) {
    const [lon1, lat1] = loc1.coordinates;
    const [lon2, lat2] = loc2.coordinates;
    const y = lat2 - lat1;
    const x = lon2 - lon1;
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    return angle;
  }
  static getInterpolation(loc1: Coordinate, loc2: Coordinate, ratio: number): Coordinate {
    const [lon1, lat1] = loc1.coordinates;
    const [lon2, lat2] = loc2.coordinates;
    const lon = lon1 + (lon2 - lon1) * ratio;
    const lat = lat1 + (lat2 - lat1) * ratio;
    const altitude = loc1.altitude + (loc2.altitude - loc1.altitude) * ratio;
    return { type: "Point", coordinates: [lon, lat], altitude };
  }
  static moveMeters(loc: Coordinate, x: number, y: number, z: number = 0): Coordinate {
    const [lon, lat] = loc.coordinates;
    const dx = ((x / 1000 / 6371) * (180 / Math.PI)) / Math.cos(lat * (Math.PI / 180));
    const dy = (y / 1000 / 6371) * (180 / Math.PI);
    return { ...loc, coordinates: [lon + dx, lat + dy], altitude: loc.altitude + z };
  }
  static getNedBearing(loc1: Coordinate, loc2: Coordinate) {
    const [startLng, startLat] = loc1.coordinates;
    const [endLng, endLat] = loc2.coordinates;
    const startLatRad = (startLat * Math.PI) / 180;
    const endLatRad = (endLat * Math.PI) / 180;
    const deltaLngRad = ((endLng - startLng) * Math.PI) / 180;
    const x = Math.sin(deltaLngRad) * Math.cos(endLatRad);
    const y =
      Math.cos(startLatRad) * Math.sin(endLatRad) - Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(deltaLngRad);
    const bearing = Math.atan2(x, y) * (180 / Math.PI);
    return bearing;
  }
  static getTargetCoordinate(loc1: Coordinate, heading: number, distance: number): Coordinate {
    const [startLng, startLat] = loc1.coordinates;
    const R = 6371000; // Earth's radius in meters

    // Convert to radians
    const startLatRad = (startLat * Math.PI) / 180;
    const startLngRad = (startLng * Math.PI) / 180;
    const headingRad = (heading * Math.PI) / 180;
    const angularDistance = distance / R;

    // Calculate target latitude using spherical trigonometry
    const targetLatRad = Math.asin(
      Math.sin(startLatRad) * Math.cos(angularDistance) +
        Math.cos(startLatRad) * Math.sin(angularDistance) * Math.cos(headingRad)
    );

    // Calculate target longitude
    const targetLngRad =
      startLngRad +
      Math.atan2(
        Math.sin(headingRad) * Math.sin(angularDistance) * Math.cos(startLatRad),
        Math.cos(angularDistance) - Math.sin(startLatRad) * Math.sin(targetLatRad)
      );

    // Convert back to degrees
    const targetLat = (targetLatRad * 180) / Math.PI;
    const targetLng = (targetLngRad * 180) / Math.PI;

    return {
      type: "Point",
      coordinates: [targetLng, targetLat],
      altitude: loc1.altitude, // Keep the same altitude
    };
  }
  static getGroundCoordinate(loc: Coordinate, yaw: number, pitch: number) {
    if (pitch > 0) {
      return null;
    }
    let clippedYaw = this.getClippedDegree(yaw);
    let clippedPitch: number;

    const pitchDiff = Math.abs(Math.abs(pitch) - 90);
    if (pitch < -90) {
      clippedPitch = -90 + pitchDiff;
      clippedYaw = this.getClippedDegree(clippedYaw + 180);
    } else {
      clippedPitch = pitch;
    }

    const alt = loc.altitude;
    const horizontalDistance = alt / Math.tan((Math.abs(clippedPitch) * Math.PI) / 180);
    if (horizontalDistance > 5000) {
      return null;
    }
    const targetCoordinate = this.getTargetCoordinate(loc, clippedYaw, horizontalDistance);
    return targetCoordinate;
  }
  static computeCenterAndZoomFromLocations(locations: Coordinate[]) {
    if (locations.length === 0) return null;

    const { minLat, maxLat, minLng, maxLng } = this.getBounds(...locations);
    const center: Coordinate = {
      type: "Point",
      coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
      altitude: 0,
    };

    // 중심점에서의 위도를 사용하여 경도 보정
    const centerLat = center.coordinates[1];
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;

    // 경도 차이를 위도 차이와 동일한 단위로 변환 (코사인 보정)
    const correctedLngDiff = lngDiff / Math.cos((centerLat * Math.PI) / 180);

    // 실제 거리 기반으로 최대 차이 계산
    const maxDiff = Math.max(latDiff, correctedLngDiff);

    // 여백을 고려한 zoom 계산 (20% 여백 추가)
    const paddingFactor = 1;
    const adjustedDiff = maxDiff * paddingFactor;

    // 웹 메르카토르 투영법을 고려한 zoom 계산
    // 360도는 zoom 0에서의 전체 경도 범위
    let zoom = Math.log2(360 / adjustedDiff);

    // 작은 영역에 대한 특별 처리
    if (adjustedDiff < 0.001) {
      zoom = 18; // 매우 작은 영역은 높은 zoom으로 고정
    } else if (adjustedDiff < 0.01) {
      zoom = Math.max(zoom - 1, 15); // 작은 영역은 약간 줄인 zoom
    }

    // zoom 범위 제한
    zoom = Math.min(Math.floor(Math.max(zoom, 3)) + 2, 19);

    return { center, zoom };
  }
  /**
   *
   * @param degree NED bearing 값
   *
   * @returns -180 ~ 180 사이 값으로 clip된 NED bearing 값
   */
  static getClippedDegree(degree: number) {
    const diff = Math.abs(Math.abs(degree) - 180);
    if (degree > 180) {
      return -180 + diff;
    }
    if (degree < -180) {
      return 180 - diff;
    }
    return degree;
  }
}
