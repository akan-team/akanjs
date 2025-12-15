"use client";
import clsx from "clsx";
import { type ReactNode, useContext } from "react";

import { ScrollContext } from "./context";
import { Render } from "./Render";

interface SlideProps {
  id: string;
  title?: ReactNode;
  children: any;
  className?: string;
  preClassName?: string;
  postClassName?: string;
}
export const Slide = ({ id, title, children, className, preClassName, postClassName }: SlideProps) => {
  const { setSlide, slideIds } = useContext(ScrollContext);
  return (
    <Render
      id={id}
      className={clsx("", className)}
      preClassName={preClassName}
      postClassName={postClassName}
      onRendered={() => {
        setSlide(id);
      }}
      onHidden={(direction) => {
        const slideIdx = slideIds.findIndex((slideId) => slideId === id);
        const targetSlideIdx =
          direction === "up" ? Math.max(slideIdx - 1, 0) : Math.min(slideIdx + 1, slideIds.length - 1);
        setSlide(slideIds[targetSlideIdx]);
      }}
    >
      {children}
    </Render>
  );
};
