"use client";
import { clsx } from "@akanjs/client";
import { cnst } from "@util/client";
import { Overlay as PigeonMarker, PigeonProps } from "pigeon-maps";
import { useContext, useRef } from "react";

import { PigeonMapPropsContext } from "./context";

interface MarkerProps extends PigeonProps {
  className?: string;
  coordinate: cnst.Coordinate;
  children?: any;
  onClick?: () => void;
  onDrag?: () => void;
}
export default function Marker({ className, children, coordinate, onClick, onDrag, ...props }: MarkerProps) {
  const mouseDownPosition = useRef<[number, number] | null>(null);
  const contextProps = useContext(PigeonMapPropsContext);

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
    >
      <div
        className={clsx("relative grid -translate-x-1/2 -translate-y-1/2 place-items-center", {
          "cursor-pointer": onClick !== undefined,
        })}
        onMouseDown={(e) => {
          mouseDownPosition.current = [e.clientX, e.clientY];
        }}
        onMouseUp={(e) => {
          if (mouseDownPosition.current === null) return;

          const mouseUpPosition = [e.clientX, e.clientY];

          const delta = Math.sqrt(
            (mouseUpPosition[0] - mouseDownPosition.current[0]) ** 2 +
              (mouseUpPosition[1] - mouseDownPosition.current[1]) ** 2
          );

          if (delta < 5) onClick?.();
          mouseDownPosition.current = null;
        }}
        onMouseMove={() => {
          if (mouseDownPosition.current === null) return;
          onDrag?.();
        }}
      >
        {children}
      </div>
    </PigeonMarker>
  );
}
