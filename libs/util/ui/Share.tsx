"use client";
import { Copy } from "@akanjs/ui";
import { usePage } from "@util/client";

interface ShareProps {
  title: string;
  url: string;
  children: any;
}

export const Share = ({ title, url, children }: ShareProps) => {
  const { l } = usePage();
  const shareData = { title, url };
  const isShareable = typeof navigator !== "undefined" && navigator.canShare(shareData);
  if (isShareable)
    return (
      <div className="size-full cursor-pointer" onClick={() => navigator.share(shareData)}>
        {children}
      </div>
    );
  else
    return (
      <Copy text={shareData.url} copyMessage={l("util.linkCopied")}>
        {children}
      </Copy>
    );
};
