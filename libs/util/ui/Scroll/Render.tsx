"use client";
import { clsx } from "@akanjs/client";
import { createContext, useEffect, useRef, useState } from "react";

interface RenderProps {
  id?: string;
  children: any;
  className?: string;
  preClassName?: string;
  postClassName?: string;
  duration?: 0 | 75 | 100 | 150 | 200 | 300 | 500 | 700 | 1000 | null;
  threshold?: number; // 화면 랜더링 비율
  once?: boolean;
  onRendered?: (scrollDirection: "up" | "down") => void;
  onHidden?: (scrollDirection: "up" | "down") => void;
}

export const RenderContext = createContext<{
  rendered: boolean;
  setRendered: (rendered: boolean) => void;
}>({
  rendered: false,
  setRendered: () => {
    //
  },
});

export const Render = ({
  id,
  children,
  className,
  preClassName = "",
  postClassName = "",
  once,
  duration = 150,
  threshold,
  onRendered,
  onHidden,
}: RenderProps) => {
  const [rendered, setRendered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const scrollYRef = useRef(0);
  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (once && renderedRef.current) return;
        // const headerHeight = 80;
        const currentY = entry.boundingClientRect.y;
        const scrollDirection = currentY < scrollYRef.current ? "down" : "up";
        renderedRef.current = entry.isIntersecting;
        scrollYRef.current = currentY;
        setRendered(entry.isIntersecting);
        if (entry.isIntersecting && entry.intersectionRatio) onRendered?.(scrollDirection);
        if (!entry.isIntersecting && entry.intersectionRatio) onHidden?.(scrollDirection);
      },
      { threshold: threshold ?? 0.35 }
    );
    observer.observe(wrapperRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <RenderContext.Provider value={{ rendered, setRendered }}>
      <div
        id={id}
        ref={wrapperRef}
        data-rendered={rendered}
        className={clsx("group/scroll transition-all", duration ? `duration-${duration}` : null, className, {
          [preClassName]: !rendered,
          [postClassName]: rendered,
        })}
        style={{ scrollMarginTop: "100px" }}
      >
        {/* {children} */}
        {children}
      </div>
    </RenderContext.Provider>
  );
};
