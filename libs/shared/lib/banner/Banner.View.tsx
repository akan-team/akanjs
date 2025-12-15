import { clsx } from "@akanjs/client";
import { Image } from "@akanjs/ui";
import { cnst } from "@shared/client";

interface BannerViewProps {
  className?: string;
  banner: cnst.Banner;
  self?: { id?: string } | null;
}

export const General = ({ className, banner, self }: BannerViewProps) => {
  return (
    <div className={clsx(className, `animate-fadeIn w-full`)}>
      <div>{banner.title}</div>
      <div>{banner.content}</div>
      <Image file={banner.image} />
    </div>
  );
};
