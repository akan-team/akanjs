"use client";

import { cnst } from "@util";
import { st } from "@util/client";
import { CSSProperties } from "react";

import Pigeon from "./Pigeon";

export interface PigeonMapProps {
  id?: string;
  className?: string;
  onLoad?: () => void;
  onClick?: (coordinate: cnst.Coordinate) => void;
  onRightClick?: (coordinate: cnst.Coordinate) => void;
  onMouseMove?: (coordinate: cnst.Coordinate) => void;
  mapTiler?: (x: number, y: number, z: number, dpr: number) => string;
  zoomControlStyle?: CSSProperties;
  children?: any;
  showZoomControl?: boolean;
}
export default function PigeonMap({
  id,
  className,
  onLoad,
  onClick,
  onRightClick,
  onMouseMove,
  mapTiler = (x, y, z, dpr) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  zoomControlStyle,
  children,
  showZoomControl = true,
}: PigeonMapProps) {
  const mapCenter = st.use.mapCenter();
  const mapZoom = st.use.mapZoom();
  const mapBounds = st.use.mapBounds();
  return (
    <Pigeon
      className={className}
      onLoad={onLoad}
      zoom={mapZoom}
      center={mapCenter}
      onClick={onClick}
      onRightClick={onRightClick}
      onChangeZoom={(zoom) => {
        st.do.setMapZoom(zoom);
      }}
      onChangeCenter={(center) => {
        st.do.setMapCenter(center);
      }}
      onMouseMove={onMouseMove}
      bounds={mapBounds}
      onChangeBounds={(bounds) => {
        st.do.setMapBounds(bounds);
      }}
      mapTiler={mapTiler}
      zoomControlStyle={zoomControlStyle}
      showZoomControl={showZoomControl}
    >
      {children}
    </Pigeon>
  );
}
