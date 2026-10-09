"use client";
import { cn } from "akanjs/client";
import { useSpring } from "react-spring";
import { animated } from "../animated";

export interface ProgressBarProps {
  className?: string;
  value: number;
  max: number;
}

// A div track, not `<progress>`: `accent-color` themes only the fill, and no browser rounds the fill.
export const ProgressBar = ({ className, value, max }: ProgressBarProps) => {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const spring = useSpring({ from: { percent: 0 }, to: { percent } });
  return (
    <div
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
    >
      <animated.div className="h-full rounded-full bg-primary" style={{ width: spring.percent.to((p) => `${p}%`) }} />
    </div>
  );
};
