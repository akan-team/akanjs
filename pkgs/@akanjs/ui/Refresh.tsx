"use client";
import { ReactElement } from "react";
import { BiLoaderAlt } from "react-icons/bi";
import PullToRefresh from "react-simple-pull-to-refresh";

interface RefreshProps {
  children: ReactElement;
  onRefresh: () => Promise<void>;
}

export const Refresh = ({ children, onRefresh }: RefreshProps) => {
  return (
    <PullToRefresh
      onRefresh={onRefresh}
      refreshingContent={
        <div className="bg-base-100 fixed left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full shadow-sm">
          <BiLoaderAlt className="animate-spin text-2xl" />
        </div>
      }
    >
      {children}
    </PullToRefresh>
  );
};
