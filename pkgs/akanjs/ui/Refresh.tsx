"use client";
import { lazy } from "akanjs/webkit";
import type { ReactElement } from "react";
import { BiLoaderAlt } from "react-icons/bi";

const pullToRefreshPackage = "react-simple-pull-to-refresh";

const PullToRefresh = lazy(() => import(pullToRefreshPackage), { ssr: false });

interface RefreshProps {
  children: ReactElement;
  onRefresh: () => Promise<void>;
}

export const Refresh = ({ children, onRefresh }: RefreshProps) => {
  return (
    <PullToRefresh
      onRefresh={onRefresh}
      refreshingContent={
        <div className="fixed left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-base-100 shadow-sm">
          <BiLoaderAlt className="animate-spin text-2xl" />
        </div>
      }
    >
      {children}
    </PullToRefresh>
  );
};
