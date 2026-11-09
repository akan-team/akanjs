"use client";
import { useEffect, useRef } from "react";
import { VideoDirector } from "./videoDirector.util";

interface InViewVideoProps {
  className?: string;
  src: string;
  compactSrc?: string;
  poster?: string;
}
export const InViewVideo = ({ className, src, compactSrc, poster }: InViewVideoProps) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    return VideoDirector.attach(video, { src, compactSrc, poster });
  }, [src, compactSrc, poster]);
  return <video className={className} loop muted playsInline preload="none" ref={ref} />;
};
