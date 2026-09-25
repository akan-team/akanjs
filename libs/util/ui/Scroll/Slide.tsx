"use client";
import clsx from "clsx";
import { type ReactNode, useCallback, useContext } from "react";

import { ScrollContext } from "./context";
import { Render } from "./Render";

interface SlideProps {
  id: string;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  preClassName?: string;
  postClassName?: string;
}
export const Slide = ({ id, title, children, className, preClassName, postClassName }: SlideProps) => {
  const { registerSlideElement } = useContext(ScrollContext);
  const setSlideElement = useCallback(
    (element: HTMLDivElement | null) => {
      registerSlideElement(id, element);
    },
    [id, registerSlideElement],
  );

  return (
    <Render
      id={id}
      className={clsx("", className)}
      preClassName={preClassName}
      postClassName={postClassName}
      elementRef={setSlideElement}
    >
      {children}
    </Render>
  );
};
