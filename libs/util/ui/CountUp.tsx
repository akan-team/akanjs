"use client";
import ReactCountUp from "react-countup";

interface CountUpProps {
  start: number;
  end: number;
  duration: number;
}

export const CountUp = ({ start = 0, end, duration = 10 }: CountUpProps) => {
  return <ReactCountUp start={start} end={end} duration={duration} />;
};
