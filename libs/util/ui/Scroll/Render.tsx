"use client";
import { clsx } from "akanjs/client";
import { createContext, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface RenderProps {
  id?: string;
  children: ReactNode;
  className?: string;
  preClassName?: string;
  postClassName?: string;
  duration?: 0 | 75 | 100 | 150 | 200 | 300 | 500 | 700 | 1000 | null;
  threshold?: number; // 화면 랜더링 비율
  once?: boolean;
  onRendered?: (scrollDirection: "up" | "down") => void;
  onHidden?: (scrollDirection: "up" | "down") => void;
  elementRef?: (element: HTMLDivElement | null) => void;
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
  elementRef,
}: RenderProps) => {
  const [rendered, setRendered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const scrollYRef = useRef(0);
  const onRenderedRef = useRef(onRendered);
  const onHiddenRef = useRef(onHidden);

  useEffect(() => {
    onRenderedRef.current = onRendered;
    onHiddenRef.current = onHidden;
  }, [onRendered, onHidden]);

  const setWrapperRef = useCallback(
    (element: HTMLDivElement | null) => {
      wrapperRef.current = element;
      elementRef?.(element);
    },
    [elementRef],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    renderedRef.current = false;
    setRendered(false);

    const thresholdValue = threshold ?? 0.35;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (once && renderedRef.current) return;

        const currentY = entry.boundingClientRect.y;
        const scrollDirection = currentY < scrollYRef.current ? "down" : "up";
        const isRendered = entry.isIntersecting && entry.intersectionRatio >= thresholdValue;
        const wasRendered = renderedRef.current;

        renderedRef.current = isRendered;
        scrollYRef.current = currentY;
        setRendered(isRendered);

        if (isRendered && !wasRendered) onRenderedRef.current?.(scrollDirection);
        if (!isRendered && wasRendered) onHiddenRef.current?.(scrollDirection);
      },
      { threshold: thresholdValue },
    );
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, [id, once, threshold]);

  return (
    <RenderContext.Provider value={{ rendered, setRendered }}>
      <div
        id={id}
        ref={setWrapperRef}
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
