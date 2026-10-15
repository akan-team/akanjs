"use client";
import { cn, resolveServerUrl } from "akanjs/client";
import { Loading } from "akanjs/ui";
import { type ReactNode, useState } from "react";

interface DownloadProps {
  className?: string;
  url: string;
  filename: string;
  onClick?: () => void;
  children?: ReactNode;
}
export const Download = ({ className, onClick, url, filename, children }: DownloadProps) => {
  const [loading, setLoading] = useState(false);

  return (
    <a
      href={resolveServerUrl(url)}
      download={filename}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.();
        setLoading(true);
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }}
      className={cn(
        "flex items-center justify-start duration-500",
        loading ? "cursor-default opacity-80" : "cursor-pointer",
        className,
      )}
    >
      {children}
      <div
        className="flex items-center justify-center text-center duration-300 data-[loading=false]:scale-0 data-[loading=true]:scale-100"
        data-loading={loading}
      >
        <Loading.Spin />
      </div>
    </a>
  );
};
