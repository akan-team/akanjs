"use client";
import { getEnv } from "akanjs/base";
import { clsx, DEFAULT_TOP_INSET, debugFrame, type TransitionType, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect } from "react";
import { BiChevronLeft, BiX } from "react-icons/bi";

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

const closeIconTransitions = new Set<TransitionType>(["bottomUp", "scaleOut", "fade"]);

export const Navbar = ({ back = false, className, height, children, title, left, right }: NavbarProps) => {
  const pathCtx = usePathCtx();
  const pathRoute = pathCtx.location?.pathRoute;
  const path = pathRoute?.path;
  const BackIcon = closeIconTransitions.has(pathRoute?.pageState.transition ?? "none") ? BiX : BiChevronLeft;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const suffix = getEnv().renderMode === "csr" && path ? `-${path}` : "";
  useLayoutEffect(() => {
    if (!path) return;
    debugFrame("navbar.mount", { path, height });
    return () => debugFrame("navbar.unmount", { path, height });
  }, [path, height]);
  useLayoutEffect(() => {
    if (!path) return;
    return registerFrameSlot({
      type: "topInset",
      scope: "page",
      source: "navbar",
      estimatedHeight: height ?? DEFAULT_TOP_INSET,
      height,
    });
  }, [registerFrameSlot, height, path]);
  return (
    <>
      <Portal id={`topInsetContent${suffix}`}>
        <div
          className={clsx(
            "flex size-full items-center px-5",
            {
              "pl-14": back,
            },
            className,
          )}
        >
          {children}
        </div>
      </Portal>
      {back ? (
        <Portal id={`topLeftActionContent${suffix}`}>
          {typeof back === "boolean" ? (
            <Link.Back className="text-4xl">
              <BackIcon />
            </Link.Back>
          ) : (
            back
          )}
        </Portal>
      ) : null}
    </>
  );
};
