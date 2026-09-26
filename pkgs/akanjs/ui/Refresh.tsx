"use client";
import { lazy } from "akanjs/webkit";
import type { ReactElement } from "react";
import { BiLoaderAlt } from "react-icons/bi";

//? An optional peer: `as string` keeps tsc from resolving it in a workspace that never installed it, while Bun
//? strips the assertion and bundles the literal. A variable hid it from Bun too, leaving a bare browser import.
const PullToRefresh = lazy(() => import("react-simple-pull-to-refresh" as string), { ssr: false });

interface RefreshProps {
  children: ReactElement;
  onRefresh: () => Promise<void>;
}

export const Refresh = ({ children, onRefresh }: RefreshProps) => {
  return (
    <PullToRefresh
      onRefresh={onRefresh}
      refreshingContent={
        <div className="fixed left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-background shadow-sm">
          <BiLoaderAlt className="animate-spin text-2xl" />
        </div>
      }
    >
      {children}
    </PullToRefresh>
  );
};
