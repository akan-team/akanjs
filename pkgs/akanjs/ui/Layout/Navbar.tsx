"use client";
import { getEnv } from "akanjs/base";
import { clsx, DEFAULT_TOP_INSET, usePathCtx } from "akanjs/client";
import { type ReactNode, useEffect, useState } from "react";
import { BiChevronLeft } from "react-icons/bi";

import { Link } from "../Link";
import { Portal } from "../Portal";

export interface NavbarProps {
  className?: string;
  children?: ReactNode;
  height?: number;
  title?: ReactNode;
  back?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}

export const Navbar = ({ back = false, className, height, children, title, left, right }: NavbarProps) => {
  const [render, setRender] = useState(false);
  const pathCtx = usePathCtx();
  const { location } = pathCtx;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const suffix = getEnv().renderMode === "csr" ? `-${location.pathRoute.path}` : "";
  useEffect(() => {
    setRender(true);
  }, []);
  useEffect(
    () =>
      registerFrameSlot({
        type: "topInset",
        scope: "page",
        source: "navbar",
        estimatedHeight: height ?? DEFAULT_TOP_INSET,
        height,
      }),
    [registerFrameSlot, height],
  );
  if (!render) return null;
  return (
    <>
      <Portal id={`topInsetContent${suffix}`}>
        <div className={clsx("size-full", className)}>{children}</div>
      </Portal>
      {back ? (
        <Portal id={`topLeftActionContent${suffix}`}>
          {typeof back === "boolean" ? (
            <Link.Back className="text-4xl">
              <BiChevronLeft />
            </Link.Back>
          ) : (
            back
          )}
        </Portal>
      ) : null}
    </>
  );
};
