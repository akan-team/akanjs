import type { cnst } from "@libs/shared/client";
import { cn } from "akanjs/client";
import { Image } from "akanjs/ui";

interface GeneralProps {
  className?: string;
  banner: cnst.Banner;
}

export const General = ({ className, banner }: GeneralProps) => {
  return (
    <div className={cn("w-full animate-fadeIn", className)}>
      <div>{banner.title}</div>
      <div>{banner.content}</div>
      <Image file={banner.image} />
    </div>
  );
};
