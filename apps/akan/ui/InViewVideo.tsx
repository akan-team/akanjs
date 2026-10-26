"use client";
import { useEffect, useRef } from "react";

interface InViewVideoProps {
  className?: string;
  src: string;
  poster?: string;
}
export const InViewVideo = ({ className, src, poster }: InViewVideoProps) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.at(-1)?.isIntersecting) {
          if (!video.getAttribute("src")) video.src = src;
          // play() rejects under iOS Low Power Mode or when a pause() lands first; the video just stays still.
          video.play().catch(() => undefined);
          return;
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
      },
      { rootMargin: "25% 0px" },
    );
    // Half a viewport caught the first demo below the hero at load, a 12 MB download racing the page's own requests.
    const observe = () => {
      // A poster attribute downloads as soon as it is parsed, preload="none" or not.
      if (poster) video.poster = poster;
      observer.observe(video);
    };
    if (document.readyState === "complete") observe();
    else window.addEventListener("load", observe, { once: true });
    return () => {
      window.removeEventListener("load", observe);
      observer.disconnect();
    };
  }, [src, poster]);
  return <video className={className} loop muted playsInline preload="none" ref={ref} src={src} />;
};
