"use client";
import { cnst } from "@libs/util";
import { cn } from "akanjs/client";
import { Map, type PigeonProps as PigeonLibProps, ZoomControl } from "pigeon-maps";
import {
  type CSSProperties,
  type MouseEventHandler,
  type PropsWithChildren,
  useContext,
  useRef,
  useState,
} from "react";

import { MapViewContext, PigeonMapPropsContext } from "./context";
import { OverzoomTile } from "./OverzoomTile";
import ScaleBar from "./ScaleBar";

const CLICK_DRAG_THRESHOLD_PX = 5;

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
  mapTiler?: (x: number, y: number, z: number, dpr?: number) => string;
  children?: any;
  zoomControlStyle?: CSSProperties;
  showZoomControl?: boolean;
  showScaleBar?: boolean;
  scaleBarClassName?: string;
}
export default function Pigeon({
  id,
  className,
  onLoad,
  onClick,
  onRightClick,
  center = new cnst.Coordinate().set({ coordinates: [127.0016985, 37.5642135], altitude: 0 }),
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
  showScaleBar = true,
  scaleBarClassName,
}: PigeonProps) {
  return (
    <MapViewContext.Provider value={{ type: "pigeon" }}>
      <div className={cn("relative h-full w-full", className)}>
        <Map
          attribution={false}
          boxClassname="relative h-full w-full"
          center={[center.coordinates[1], center.coordinates[0]]}
          defaultCenter={[center.coordinates[1], center.coordinates[0]]}
          zoom={zoom ?? 13}
          defaultZoom={zoom ?? 13}
          maxZoom={23}
          tileComponent={OverzoomTile}
          provider={mapTiler}
          onBoundsChanged={({ center: [lat, lng], zoom: newZoom, bounds: { ne, sw }, initial }) => {
            if (initial) onLoad?.();
            if (zoom !== newZoom) onChangeZoom?.(newZoom);
            if (center.coordinates[0] !== lng || center.coordinates[1] !== lat)
              onChangeCenter?.(new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 }));
            if (
              bounds.minLat !== sw[1] ||
              bounds.maxLat !== ne[1] ||
              bounds.minLng !== sw[0] ||
              bounds.maxLng !== ne[0]
            )
              onChangeBounds?.({ minLat: sw[1], maxLat: ne[1], minLng: sw[0], maxLng: ne[0] });
          }}
        >
          <PigeonPropsProvider
            mouseEvents={mouseEvents}
            onMouseMove={onMouseMove}
            onClick={onClick}
            onRightClick={onRightClick}
          >
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
          {showScaleBar ? (
            <ScaleBar
              className={cn("absolute right-2 bottom-2", scaleBarClassName)}
              zoom={zoom ?? 13}
              lat={center.coordinates[1]}
            />
          ) : null}
        </Map>
      </div>
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
  const mouseDownPosition = useRef<[number, number] | null>(null);
  const draggedRef = useRef(false);

  const props = useContext(PigeonMapPropsContext);

  const propsRef = useRef(props);

  propsRef.current = props;

  const handleDragMove: MouseEventHandler<HTMLDivElement> = (event) => {
    const x = event.clientX;
    const y = event.clientY;
    if (mouseDownPosition.current) {
      const delta = Math.sqrt((x - mouseDownPosition.current[0]) ** 2 + (y - mouseDownPosition.current[1]) ** 2);
      if (delta > CLICK_DRAG_THRESHOLD_PX) draggedRef.current = true;
    }

    const { pixelToLatLng } = propsRef.current;
    const [lat, lng] = pixelToLatLng?.([x - initialLeft, y - initialTop]) ?? [0, 0];
    onMouseMove?.(new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 }), event);
  };
  const handleMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    mouseDownPosition.current = [event.clientX, event.clientY];
    draggedRef.current = false;
  };
  const handleMouseUp: MouseEventHandler<HTMLDivElement> = () => {
    mouseDownPosition.current = null;
  };
  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    const dragged = draggedRef.current;
    mouseDownPosition.current = null;
    draggedRef.current = false;
    if (dragged) return;

    const x = event.clientX;
    const y = event.clientY;

    const { pixelToLatLng } = propsRef.current;
    const [lat, lng] = pixelToLatLng?.([x - initialLeft, y - initialTop]) ?? [0, 0];
    onClick?.(new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 }), event);
  };

  const handleContextMenu: MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault(); // 브라우저 기본 컨텍스트 메뉴 방지
    const x = event.clientX;
    const y = event.clientY;

    const { pixelToLatLng } = propsRef.current;
    const [lat, lng] = pixelToLatLng?.([x - initialLeft, y - initialTop]) ?? [0, 0];
    onRightClick?.(new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 }), event);
  };

  return (
    <div
      className={cn("absolute inset-0", !mouseEvents && "pointer-events-none")}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleDragMove}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
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
