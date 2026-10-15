"use client";
import { cnst } from "@libs/util";
import { GoogleMap, type Libraries, useJsApiLoader } from "@react-google-maps/api";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useState } from "react";

import { MapViewContext } from "./context";

export interface GoogleProps {
  id?: string;
  className?: string;
  mapKey: string;
  onClick?: (coordinate: cnst.Coordinate) => void;
  onRightClick?: (coordinate: cnst.Coordinate) => void;
  center?: cnst.Coordinate;
  onChangeCenter?: (coordinate: cnst.Coordinate) => void;
  zoom?: number;
  onChangeZoom?: (zoom: number) => void;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  onLoad?: () => void;
  onMouseMove?: (coordinate: cnst.Coordinate, e: google.maps.MapMouseEvent) => void;
  options?: google.maps.MapOptions;
  children: ReactNode;
}
const libraries: Libraries = ["core", "maps", "marker"];
const defaultCenter = new cnst.Coordinate({ type: "Point", coordinates: [127.0016985, 37.5642135], altitude: 0 });
export default function Google({
  id,
  className,
  mapKey,
  onClick,
  onRightClick,
  center = defaultCenter,
  onChangeCenter,
  zoom,
  onChangeZoom,
  bounds,
  onLoad,
  onMouseMove,
  options,
  children,
}: GoogleProps) {
  const { isLoaded } = useJsApiLoader({
    id: id ?? "google-map-container",
    googleMapsApiKey: mapKey,
    version: "3.56.11",
    libraries,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [centerLng, centerLat] = center.coordinates;

  useEffect(() => {
    const currentCenter = map?.getCenter();
    if (!map || !currentCenter) return;
    if (currentCenter.lng() === centerLng && currentCenter.lat() === centerLat) return;
    map.setCenter({ lat: centerLat, lng: centerLng });
  }, [centerLat, centerLng, map]);

  useEffect(() => {
    if (!map) return;
    const currentZoom = map.getZoom();
    if (zoom === currentZoom) return;
    map.setZoom(zoom ?? 15);
  }, [zoom, map]);

  useEffect(() => {
    if (!map || !bounds) return;
    const latLngs = [
      { lat: bounds.minLat, lng: bounds.minLng },
      { lat: bounds.maxLat, lng: bounds.maxLng },
    ];
    map.fitBounds(new google.maps.LatLngBounds(...latLngs));
  }, [bounds, map]);

  return isLoaded ? (
    <MapViewContext.Provider value={{ type: "google" }}>
      <GoogleMap
        id="google-map-container"
        mapContainerClassName={cn("h-72 w-full", className)}
        onLoad={(mapInstance) => {
          if (map) return;
          setMap(mapInstance);
          mapInstance.setCenter({ lat: center.coordinates[1], lng: center.coordinates[0] });
          mapInstance.setZoom(zoom ?? 15);
          onLoad?.();
        }}
        onClick={(e) => {
          if (!e.latLng) return;
          return onClick?.(
            new cnst.Coordinate().set({
              coordinates: [e.latLng.lng(), e.latLng.lat()],
              altitude: 0,
            }),
          );
        }}
        onRightClick={(e) => {
          if (!e.latLng) return;
          return onRightClick?.(
            new cnst.Coordinate().set({
              type: "Point",
              coordinates: [e.latLng.lng(), e.latLng.lat()],
              altitude: 0,
            }),
          );
        }}
        onCenterChanged={() => {
          const currentCenter = map?.getCenter();
          if (!currentCenter) return;
          const [lng, lat] = [currentCenter.lng(), currentCenter.lat()];
          if (center.coordinates[0] === lng && center.coordinates[1] === lat) return;
          else return onChangeCenter?.(new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 }));
        }}
        onZoomChanged={() => {
          const currentZoom = map?.getZoom();
          if (!currentZoom || zoom === currentZoom) return;
          else return onChangeZoom?.(currentZoom);
        }}
        options={options}
        onMouseMove={(e) => {
          if (!e.latLng) return;
          const [lng, lat] = [e.latLng.lng(), e.latLng.lat()];
          const coordinate = new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 });
          onMouseMove?.(coordinate, e);
        }}
      >
        {children}
      </GoogleMap>
    </MapViewContext.Provider>
  ) : (
    <div className={cn("h-72 w-full", className)}></div>
  );
}
