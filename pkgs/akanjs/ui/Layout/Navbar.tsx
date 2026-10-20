"use client";
import { cn, DEFAULT_TOP_INSET, debugFrame, type TransitionType, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect } from "react";
import { BiChevronLeft, BiX } from "react-icons/bi";

import { Link } from "../Link";
import { FrameSlotPortal } from "./FrameSlotPortal";

export interface NavbarProps {
  className?: string;
  children?: ReactNode;
  height?: number;
  title?: ReactNode;
  /** `true` draws the framework's back button; any other node is drawn in its place. */
  back?: ReactNode;
  /** Where the default back button goes when there is no history to go back to, as on a deep link. */
  backFallback?: string;
  left?: ReactNode;
  right?: ReactNode;
}

const closeIconTransitions = new Set<TransitionType>(["bottomUp", "scaleOut", "fade"]);

export const Navbar = ({
  back = false,
  backFallback,
  className,
  height,
  children,
  title,
  left,
  right,
}: NavbarProps) => {
  const pathCtx = usePathCtx();
  const pathRoute = pathCtx.location?.pathRoute;
  const path = pathRoute?.path;
  const BackIcon = closeIconTransitions.has(pathRoute?.pageState.transition ?? "none") ? BiX : BiChevronLeft;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
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
  const bar = (
    <div className={cn("flex size-full items-center gap-2 px-5", back && "pl-14", className)}>
      {left ? <div className="flex shrink-0 items-center gap-1">{left}</div> : null}
      {title ? <div className="min-w-0 flex-1 truncate font-semibold text-base">{title}</div> : null}
      {children}
      {right ? <div className="ml-auto flex shrink-0 items-center gap-1">{right}</div> : null}
    </div>
  );
  const backButton =
    back === true ? (
      <Link.Back className="text-4xl" fallback={backFallback}>
        <BackIcon />
      </Link.Back>
    ) : (
      back
    );
  return (
    <>
      <FrameSlotPortal slot="topInset">{bar}</FrameSlotPortal>
      {back ? <FrameSlotPortal slot="topLeftAction">{backButton}</FrameSlotPortal> : null}
    </>
  );
};
