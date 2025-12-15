"use client";
import { clsx } from "@akanjs/client";
import { GoogleMap, type Libraries, useJsApiLoader } from "@react-google-maps/api";
import { cnst } from "@util";
import { useEffect, useState } from "react";

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
  children: any;
}
const libraries: Libraries = ["core", "maps", "marker"];
export default function Google({
  id,
  className,
  mapKey,
  onClick,
  onRightClick,
  center = { type: "Point", coordinates: [127.0016985, 37.5642135], altitude: 0 },
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

  // Set center
  useEffect(() => {
    const currentCenter = map?.getCenter();
    if (!map || !currentCenter) return;
    const [lng, lat] = [currentCenter.lng(), currentCenter.lat()];
    if (center.coordinates[0] === lng && center.coordinates[1] === lat) return;
    else map.setCenter({ lat: center.coordinates[1], lng: center.coordinates[0] });
  }, [center, map]);

  // Set zoom
  useEffect(() => {
    if (!map) return;
    const currentZoom = map.getZoom();
    if (zoom === currentZoom) return;
    map.setZoom(zoom ?? 15);
  }, [zoom, map]);

  // Change bounds
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
        mapContainerClassName={clsx("h-72 w-full", className)}
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
            cnst.coordinate.crystalize({
              type: "Point",
              coordinates: [e.latLng.lng(), e.latLng.lat()],
              altitude: 0,
            })
          );
        }}
        onRightClick={(e) => {
          if (!e.latLng) return;
          return onRightClick?.(
            cnst.coordinate.crystalize({
              type: "Point",
              coordinates: [e.latLng.lng(), e.latLng.lat()],
              altitude: 0,
            })
          );
        }}
        onCenterChanged={() => {
          const currentCenter = map?.getCenter();
          if (!currentCenter) return;
          const [lng, lat] = [currentCenter.lng(), currentCenter.lat()];
          if (center.coordinates[0] === lng && center.coordinates[1] === lat) return;
          else
            return onChangeCenter?.(
              cnst.coordinate.crystalize({ type: "Point", coordinates: [lng, lat], altitude: 0 })
            );
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
          const coordinate = cnst.coordinate.crystalize({
            type: "Point",
            coordinates: [lng, lat],
            altitude: 0,
          });
          onMouseMove?.(coordinate, e);
        }}
      >
        {children}
      </GoogleMap>
    </MapViewContext.Provider>
  ) : (
    <div className={clsx("h-72 w-full", className)}></div>
  );
}
