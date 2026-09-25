import { cn } from "akanjs/client";
import type { CSSProperties, ReactNode } from "react";

interface RadialProgressProps {
  value: number;
  size?: number;
  thickness?: number;
  className?: string;
  trackClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Ring progress indicator. Replaces daisyUI's `.radial-progress`, which drew the ring with a
 * conic-gradient plus two masked pseudo-elements and read `--value`/`--size`/`--thickness` off
 * inline style. Same geometry here — the ring occupies the outer `thickness` of a `size` box, is
 * `box-content` so a border sits outside it, and starts at 12 o'clock going clockwise — but as an
 * inline `<svg>`, so it needs no global stylesheet.
 *
 * `size` and `thickness` are px. daisyUI's defaults were `5rem` and `size / 10`.
 * The ring paints in `currentColor`; set it with a `text-*` class in `className`.
 * `trackClassName` draws the full unfilled ring behind the value — the call sites used to stack a
 * second `.radial-progress` at `--value: 100` for this.
 */
export const RadialProgress = ({
  value,
  size = 80,
  thickness = size / 10,
  className,
  trackClassName,
  style,
  children,
}: RadialProgressProps) => {
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - thickness) / 2;
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative box-content inline-grid place-content-center place-items-center rounded-full align-middle",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        {trackClassName ? (
          <circle
            className={trackClassName}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
          />
        ) : null}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - clamped}
        />
      </svg>
      {children}
    </div>
  );
};
