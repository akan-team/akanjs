"use client";
import { Err } from "@libs/util/client";
import { clsx } from "akanjs/client";
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScrollContext } from "./context";

export interface ProviderProps {
  className?: string;
  children?: ReactNode;
}
export const Provider = ({ className, children }: ProviderProps) => {
  const slideElementsRef = useRef(new Map<string, HTMLElement>());
  const animationFrameRef = useRef<number | null>(null);
  const childArray = useMemo(
    () => React.Children.toArray(children) as { props?: { id?: string; title?: ReactNode } }[],
    [children],
  );
  const slideIds = useMemo(
    () => childArray.map((child) => child.props?.id).filter((id): id is string => !!id),
    [childArray],
  );
  const slides = useMemo(
    () =>
      childArray
        .map((child) => ({ id: child.props?.id, title: child.props?.title }))
        .filter((slide) => !!slide.id && !!slide.title) as { id: string; title: ReactNode }[],
    [childArray],
  );
  if (slideIds.length === 0) throw new Err("util.error.slideProviderRequiresSlide");
  const [slide, setSlide] = useState<string>(slideIds[0]);
  const setActiveSlide = useCallback(
    (value: string) => {
      if (!slideIds.includes(value)) return;
      setSlide(value);
    },
    [slideIds],
  );
  const updateActiveSlide = useCallback(() => {
    const anchorY = 120;
    const slidePositions = slideIds
      .map((id) => {
        const element = slideElementsRef.current.get(id);
        if (!element) return null;
        return { id, rect: element.getBoundingClientRect() };
      })
      .filter((position): position is { id: string; rect: DOMRect } => !!position);

    if (slidePositions.length === 0) return;

    const scrollBottom = window.scrollY + window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const isScrollBottom = scrollBottom >= documentHeight - 2;
    const passedSlides = slidePositions.filter(({ rect }) => rect.top <= anchorY);
    const visibleSlides = slidePositions.filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
    const nextSlide = isScrollBottom
      ? slidePositions.at(-1)?.id
      : (passedSlides.at(-1)?.id ?? visibleSlides[0]?.id ?? slidePositions[0].id);

    if (!nextSlide) return;

    setSlide((prevSlide) => (prevSlide === nextSlide ? prevSlide : nextSlide));
  }, [slideIds]);
  const scheduleActiveSlideUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateActiveSlide();
    });
  }, [updateActiveSlide]);
  const registerSlideElement = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) slideElementsRef.current.set(id, element);
      else slideElementsRef.current.delete(id);
      scheduleActiveSlideUpdate();
    },
    [scheduleActiveSlideUpdate],
  );

  useEffect(() => {
    if (slideIds.includes(slide)) return;
    setSlide(slideIds[0]);
  }, [slide, slideIds]);

  useEffect(() => {
    scheduleActiveSlideUpdate();
    window.addEventListener("scroll", scheduleActiveSlideUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveSlideUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleActiveSlideUpdate);
      window.removeEventListener("resize", scheduleActiveSlideUpdate);
      if (animationFrameRef.current === null) return;
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [scheduleActiveSlideUpdate]);

  return (
    <ScrollContext.Provider value={{ slide, setSlide: setActiveSlide, registerSlideElement, slideIds, slides }}>
      <div data-slide={slide} className={clsx(className, "group/slide")}>
        {children}
      </div>
    </ScrollContext.Provider>
  );
};
