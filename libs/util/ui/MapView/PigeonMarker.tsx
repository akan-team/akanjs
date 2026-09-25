"use client";
import type { cnst } from "@libs/util/client";
import { cn } from "akanjs/client";
import { Overlay as PigeonMarker, type PigeonProps } from "pigeon-maps";
import { type MouseEvent, useContext, useEffect, useRef } from "react";

import { PigeonMapPropsContext } from "./context";

interface MarkerProps extends PigeonProps {
  className?: string;
  coordinate: cnst.Coordinate;
  style?: React.CSSProperties;
  children?: any;
  onClick?: () => void;
  onDrag?: (event: MouseEvent<HTMLDivElement>) => void;
}
export default function Marker({ className, children, coordinate, style, onClick, onDrag, ...props }: MarkerProps) {
  const mouseDownPosition = useRef<[number, number] | null>(null);
  const contextProps = useContext(PigeonMapPropsContext);

  useEffect(() => {
    const clearMouseDownPosition = () => {
      mouseDownPosition.current = null;
    };
    window.addEventListener("mouseup", clearMouseDownPosition);
    return () => {
      window.removeEventListener("mouseup", clearMouseDownPosition);
    };
  }, []);

  const { offset } = props;

  const anchor: [number, number] = [coordinate.coordinates[1], coordinate.coordinates[0]];

  const c = contextProps.latLngToPixel?.(anchor) ?? [0, 0];

  return (
    <PigeonMarker
      className={className}
      {...props}
      {...contextProps}
      left={c[0] - (offset ? offset[0] : 0)}
      top={c[1] - (offset ? offset[1] : 0)}
      style={style}
    >
      <div
        className={cn(
          "relative grid -translate-x-1/2 -translate-y-1/2 place-items-center",
          onClick ? "cursor-pointer" : null,
        )}
        onMouseDown={(e) => {
          if (onDrag) e.stopPropagation();
          mouseDownPosition.current = [e.clientX, e.clientY];
        }}
        onMouseUp={(e) => {
          if (mouseDownPosition.current === null) return;

          const mouseUpPosition = [e.clientX, e.clientY];

          const delta = Math.sqrt(
            (mouseUpPosition[0] - mouseDownPosition.current[0]) ** 2 +
              (mouseUpPosition[1] - mouseDownPosition.current[1]) ** 2,
          );

          if (delta < 5) onClick?.();
          mouseDownPosition.current = null;
        }}
        onMouseMove={(e) => {
          if (mouseDownPosition.current === null) return;
          const delta = Math.sqrt(
            (e.clientX - mouseDownPosition.current[0]) ** 2 + (e.clientY - mouseDownPosition.current[1]) ** 2,
          );
          if (delta < 5) return;
          onDrag?.(e);
        }}
        onClick={(e) => {
          if (onClick) e.stopPropagation();
        }}
      >
        {children}
      </div>
    </PigeonMarker>
  );
}
