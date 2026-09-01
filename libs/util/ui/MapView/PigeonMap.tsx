"use client";

import type { cnst } from "@libs/util";
import { st } from "@libs/util/client";
import { Float, Int } from "akanjs/base";
import type { CSSProperties } from "react";

import Pigeon from "./Pigeon";

const lightMapTiler = (x: number, y: number, z: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const darkMapTiler = (x: number, y: number, z: number) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;

export interface PigeonMapProps {
  id?: string;
  className?: string;
  onLoad?: () => void;
  onClick?: (coordinate: cnst.Coordinate) => void;
  onRightClick?: (coordinate: cnst.Coordinate) => void;
  onMouseMove?: (coordinate: cnst.Coordinate) => void;
  mapTiler?: (x: number, y: number, z: number, dpr?: number) => string;
  zoomControlStyle?: CSSProperties;
  children?: any;
  showZoomControl?: boolean;
  showScaleBar?: boolean;
  scaleBarClassName?: string;
  center?: cnst.Coordinate;
  zoom?: number;
}
export default function PigeonMap({
  id,
  className,
  onLoad,
  onClick,
  onRightClick,
  onMouseMove,
  mapTiler,
  zoomControlStyle,
  children,
  showZoomControl = true,
  showScaleBar = true,
  scaleBarClassName,
  center,
  zoom,
}: PigeonMapProps) {
  const theme = st.use.theme({ agent: false });
  const mapCenter = st.use.mapCenter();
  const mapZoom = st.use.mapZoom();
  const mapBounds = st.use.mapBounds({ agent: false });
  st.tool(center === undefined ? "setMapView" : null)
    .desc(
      "Move the map to a latitude and longitude, optionally at a zoom level (higher is closer; the map starts at 8).",
    )
    .arg("latitude", Float)
    .arg("longitude", Float)
    .opt("zoom", Int)
    .exec((latitude, longitude, zoom) => {
      st.do.setMapCenter({ type: "Point", coordinates: [longitude, latitude] } as cnst.Coordinate);
      if (zoom !== null) st.do.setMapZoom(zoom);
    });
  st.tool(center === undefined ? "readMapView" : null, { settle: false })
    .desc("Read where the map is currently centred and how far it is zoomed in.")
    .exec(() => ({
      latitude: mapCenter.coordinates[1],
      longitude: mapCenter.coordinates[0],
      zoom: zoom ?? mapZoom,
    }));
  return (
    <Pigeon
      className={className}
      onLoad={onLoad}
      zoom={zoom ?? mapZoom}
      center={center ?? mapCenter}
      onClick={onClick}
      onRightClick={onRightClick}
      onChangeZoom={(nextZoom) => {
        if (zoom === undefined) st.do.setMapZoom(nextZoom);
      }}
      onChangeCenter={(nextCenter) => {
        if (center === undefined) st.do.setMapCenter(nextCenter);
      }}
      onMouseMove={onMouseMove}
      bounds={mapBounds}
      onChangeBounds={(bounds) => {
        if (center === undefined) st.do.setMapBounds(bounds);
      }}
      mapTiler={mapTiler ?? (theme === "dark" ? darkMapTiler : lightMapTiler)}
      zoomControlStyle={zoomControlStyle}
      showZoomControl={showZoomControl}
      showScaleBar={showScaleBar}
      scaleBarClassName={scaleBarClassName}
    >
      {children}
    </Pigeon>
  );
}
