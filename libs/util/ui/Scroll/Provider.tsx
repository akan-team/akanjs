"use client";
import { clsx } from "@akanjs/client";
import React, { type ReactNode, useState } from "react";

import { ScrollContext } from "./context";

export interface ProviderProps {
  className?: string;
  children?: any;
}
export const Provider = ({ className, children }: ProviderProps) => {
  const childArray = React.Children.toArray(children as ReactNode) as { props?: { id?: string; title?: string } }[];
  const slideIds = childArray.map((child) => child.props?.id).filter((id): id is string => !!id);
  const slides = childArray
    .map((child) => ({ id: child.props?.id, title: child.props?.title }))
    .filter((slide) => !!slide.id && !!slide.title) as { id: string; title: ReactNode }[];
  if (slideIds.length === 0) throw new Error("SlideProvider requires at least one Slide component");
  const [slide, setSlide] = useState<string>(slideIds[0]);
  return (
    <>
      <ScrollContext.Provider value={{ slide, setSlide, slideIds, slides }}>
        <div data-slide={slide} className={clsx(className, "group/slide")}>
          {children}
        </div>
      </ScrollContext.Provider>
    </>
  );
};
