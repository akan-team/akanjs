"use client";
import { clsx } from "@akanjs/client";
import { cnst } from "@util";
import { Map, type PigeonProps as PigeonLibProps, ZoomControl } from "pigeon-maps";
import { CSSProperties, MouseEventHandler, PropsWithChildren, useContext, useRef, useState } from "react";

import { MapViewContext, PigeonMapPropsContext } from "./context";

export interface PigeonProps {
  id?: string;
  className?: string;
  onLoad?: () => void;
  onClick?: (coordinate: cnst.Coordinate) => void;
  onRightClick?: (coordinate: cnst.Coordinate) => void;
  center?: cnst.Coordinate;
  onChangeCenter?: (coordinate: cnst.Coordinate) => void;
  zoom?: number;
  onChangeZoom?: (zoom: number) => void;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  onChangeBounds?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  mouseEvents?: boolean;
  onMouseMove?: (coordinate: cnst.Coordinate) => void;
  mapTiler?: (x: number, y: number, z: number, dpr: number) => string;
  children?: any;
  zoomControlStyle?: CSSProperties;
  showZoomControl?: boolean;
}
export default function Pigeon({
  id,
  className,
  onLoad,
  onClick,
  onRightClick,
  center = { type: "Point", coordinates: [127.0016985, 37.5642135], altitude: 0 },
  onChangeCenter,
  zoom,
  onChangeZoom,
  bounds = { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
  onChangeBounds,
  mouseEvents = true,
  onMouseMove,
  mapTiler,
  children,
  zoomControlStyle,
  showZoomControl = true,
}: PigeonProps) {
  return (
    <MapViewContext.Provider value={{ type: "pigeon" }}>
      <Map
        boxClassname="relative"
        center={[center.coordinates[1], center.coordinates[0]]}
        defaultCenter={[center.coordinates[1], center.coordinates[0]]}
        zoom={zoom ?? 13}
        defaultZoom={zoom ?? 13}
        maxZoom={19}
        provider={mapTiler}
        onBoundsChanged={({ center: [lat, lng], zoom: newZoom, bounds: { ne, sw }, initial }) => {
          if (initial) onLoad?.();
          if (zoom !== newZoom) onChangeZoom?.(newZoom);
          if (center.coordinates[0] !== lng || center.coordinates[1] !== lat)
            onChangeCenter?.(cnst.coordinate.crystalize({ type: "Point", coordinates: [lng, lat], altitude: 0 }));
          if (bounds.minLat !== sw[1] || bounds.maxLat !== ne[1] || bounds.minLng !== sw[0] || bounds.maxLng !== ne[0])
            onChangeBounds?.({ minLat: sw[1], maxLat: ne[1], minLng: sw[0], maxLng: ne[0] });
        }}
      >
        <PigeonPropsProvider mouseEvents={mouseEvents} onMouseMove={onMouseMove} onClick={onClick}>
          {children}
        </PigeonPropsProvider>
        {showZoomControl ? (
          <ZoomControl
            style={zoomControlStyle}
            buttonStyle={{
              background: "rgba(0, 0, 0, 0.8)",
              color: "#9e9e9e",
            }}
          />
        ) : null}
      </Map>
    </MapViewContext.Provider>
  );
}

interface PigeonPropsProviderProps extends PigeonLibProps {
  mouseEvents?: boolean;
  onMouseMove?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
  onRightClick?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
}
function PigeonPropsProvider({
  children,
  mouseEvents,
  onMouseMove,
  onClick,
  onRightClick,
  ...props
}: PropsWithChildren<PigeonPropsProviderProps>) {
  return (
    <PigeonMapPropsContext.Provider value={props}>
      <MouseTracker mouseEvents={mouseEvents} onMouseMove={onMouseMove} onClick={onClick} onRightClick={onRightClick}>
        {children}
      </MouseTracker>
    </PigeonMapPropsContext.Provider>
  );
}

interface MouseTrackerProps {
  mouseEvents?: boolean;
  onMouseMove?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
  onRightClick?: (coordinate: cnst.Coordinate, event: React.MouseEvent<HTMLDivElement>) => void;
}
function MouseTracker({
  mouseEvents,
  onMouseMove,
  onClick,
  onRightClick,
  children,
}: PropsWithChildren<MouseTrackerProps>) {
  const [initialLeft, setInitialLeft] = useState(0);
  const [initialTop, setInitialTop] = useState(0);

  const props = useContext(PigeonMapPropsContext);

  const propsRef = useRef(props);

  propsRef.current = props;

  const handleDragMove: MouseEventHandler<HTMLDivElement> = (event) => {
    const x = event.clientX;
    const y = event.clientY;

    const { pixelToLatLng } = propsRef.current;
    const [lat, lng] = pixelToLatLng?.([x - initialLeft, y - initialTop]) ?? [0, 0];
    onMouseMove?.(cnst.coordinate.crystalize({ type: "Point", coordinates: [lng, lat], altitude: 0 }), event);
  };
  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    const x = event.clientX;
    const y = event.clientY;

    const { pixelToLatLng } = propsRef.current;
    const [lat, lng] = pixelToLatLng?.([x - initialLeft, y - initialTop]) ?? [0, 0];
    if (event.button === 0)
      onClick?.(cnst.coordinate.crystalize({ type: "Point", coordinates: [lng, lat], altitude: 0 }), event);
    if (event.button === 2)
      onRightClick?.(cnst.coordinate.crystalize({ type: "Point", coordinates: [lng, lat], altitude: 0 }), event);
  };

  return (
    <div
      className={clsx("absolute inset-0", !mouseEvents && "pointer-events-none")}
      onMouseMove={handleDragMove}
      onClick={handleClick}
      ref={(ref) => {
        if (ref !== null) {
          setInitialLeft(ref.getBoundingClientRect().left);
          setInitialTop(ref.getBoundingClientRect().top);
        }
      }}
    >
      {children}
    </div>
  );
}
