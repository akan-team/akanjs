"use client";
import { clsx } from "@akanjs/client";
import { animated } from "@akanjs/ui";
import { useSpring } from "react-spring";

export interface ProgressBarProps {
  className?: string;
  value: number;
  max: number;
}
export const ProgressBar = ({ className, value, max }: ProgressBarProps) => {
  const progress = useSpring({ value: 0, to: { value: value } });
  return <animated.progress className={clsx("progress w-full", className)} value={progress.value} max={max} />;
};
