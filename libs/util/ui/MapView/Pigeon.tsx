"use client";
import { cnst } from "@libs/util";
import { cn } from "akanjs/client";
import { Map, type PigeonProps as PigeonLibProps, ZoomControl } from "pigeon-maps";
import {
  type CSSProperties,
  type MouseEvent,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { MapViewContext, PigeonMapPropsContext } from "./context";
import { OverzoomTile } from "./OverzoomTile";
import ScaleBar from "./ScaleBar";

const CLICK_DRAG_THRESHOLD_PX = 5;
const defaultCenter = new cnst.Coordinate().set({ coordinates: [127.0016985, 37.5642135], altitude: 0 });
const emptyBounds = { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };

interface PigeonView {
  center: [number, number];
  zoom: number;
}

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
  children?: ReactNode;
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
  center = defaultCenter,
  onChangeCenter,
  zoom,
  onChangeZoom,
  bounds = emptyBounds,
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
  const [centerLng, centerLat] = center.coordinates;
  const requestedZoom = zoom ?? 13;
  //? pigeon-maps re-applies both its center and zoom props whenever either changes, so it is fed its own last view.
  const [view, setView] = useState<PigeonView>({ center: [centerLat, centerLng], zoom: requestedZoom });
  useEffect(() => {
    setView((prev) =>
      prev.center[0] === centerLat && prev.center[1] === centerLng ? prev : { ...prev, center: [centerLat, centerLng] },
    );
  }, [centerLat, centerLng]);
  useEffect(() => {
    setView((prev) => (prev.zoom === requestedZoom ? prev : { ...prev, zoom: requestedZoom }));
  }, [requestedZoom]);
  return (
    <MapViewContext.Provider value={{ type: "pigeon" }}>
      <div className={cn("relative h-full w-full", className)}>
        <Map
          attribution={false}
          boxClassname="relative h-full w-full"
          center={view.center}
          defaultCenter={[centerLat, centerLng]}
          zoom={view.zoom}
          defaultZoom={requestedZoom}
          maxZoom={23}
          tileComponent={OverzoomTile}
          provider={mapTiler}
          onBoundsChanged={({ center: [lat, lng], zoom: newZoom, bounds: { ne, sw }, initial }) => {
            setView({ center: [lat, lng], zoom: newZoom });
            if (initial) onLoad?.();
            if (zoom !== newZoom) onChangeZoom?.(newZoom);
            if (centerLng !== lng || centerLat !== lat)
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
                background: "color-mix(in oklab, var(--background) 80%, transparent)",
                color: "var(--foreground)",
              }}
            />
          ) : null}
          {showScaleBar ? (
            <ScaleBar
              className={cn("absolute right-2 bottom-2", scaleBarClassName)}
              zoom={view.zoom}
              lat={view.center[0]}
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
  const mouseDownPosition = useRef<[number, number] | null>(null);
  const draggedRef = useRef(false);

  const props = useContext(PigeonMapPropsContext);

  const propsRef = useRef(props);

  propsRef.current = props;

  //? Measured on every event: a rect saved at render time is stale once the page or a modal scrolls.
  const coordinateOf = (event: MouseEvent<HTMLDivElement>) => {
    const { left, top } = event.currentTarget.getBoundingClientRect();
    const [lat, lng] = propsRef.current.pixelToLatLng?.([event.clientX - left, event.clientY - top]) ?? [0, 0];
    return new cnst.Coordinate().set({ coordinates: [lng, lat], altitude: 0 });
  };

  const handleDragMove: MouseEventHandler<HTMLDivElement> = (event) => {
    if (mouseDownPosition.current) {
      const delta = Math.sqrt(
        (event.clientX - mouseDownPosition.current[0]) ** 2 + (event.clientY - mouseDownPosition.current[1]) ** 2,
      );
      if (delta > CLICK_DRAG_THRESHOLD_PX) draggedRef.current = true;
    }
    onMouseMove?.(coordinateOf(event), event);
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
    onClick?.(coordinateOf(event), event);
  };

  const handleContextMenu: MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    onRightClick?.(coordinateOf(event), event);
  };

  return (
    <div
      className={cn("absolute inset-0", !mouseEvents && "pointer-events-none")}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleDragMove}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {children}
    </div>
  );
}
