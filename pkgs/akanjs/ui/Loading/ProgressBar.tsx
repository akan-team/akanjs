"use client";
import { cn } from "akanjs/client";
import { animated } from "akanjs/ui";
import { useSpring } from "react-spring";

export interface ProgressBarProps {
  className?: string;
  value: number;
  max: number;
}
export const ProgressBar = ({ className, value, max }: ProgressBarProps) => {
  const progress = useSpring({ value: 0, to: { value: value } });
  // Same reasoning as the checkbox: a native <progress> honours `accent-color`, so the bar is themed
  // without an appearance-none rebuild of the track and fill.
  return (
    <animated.progress
      className={cn("h-2 w-full rounded-box accent-primary", className)}
      value={progress.value}
      max={max}
    />
  );
};
