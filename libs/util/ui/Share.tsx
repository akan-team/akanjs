"use client";
import { usePage } from "@libs/util/client";
import { Copy } from "akanjs/ui";
import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ShareProps {
  title: string;
  url: string;
  children: ReactNode;
}

export const Share = ({ title, url, children }: ShareProps) => {
  const { l } = usePage();
  const shareData = useMemo(() => ({ title, url }), [title, url]);
  const [isShareable, setIsShareable] = useState(false);

  useEffect(() => {
    setIsShareable(
      typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare(shareData)),
    );
  }, [shareData]);

  if (isShareable) {
    if (isValidElement<{ onClick?: (event: MouseEvent) => void | Promise<void> }>(children)) {
      const child = children as ReactElement<{ onClick?: (event: MouseEvent) => void | Promise<void> }>;
      return cloneElement(child, {
        onClick: async (event: MouseEvent) => {
          await child.props.onClick?.(event);
          if (event.defaultPrevented) return;
          await navigator.share(shareData);
        },
      });
    }

    return (
      <span className="cursor-pointer" onClick={() => void navigator.share(shareData)}>
        {children}
      </span>
    );
  }

  return (
    <Copy text={shareData.url} copyMessage={l("util.linkCopied")}>
      {children}
    </Copy>
  );
};
