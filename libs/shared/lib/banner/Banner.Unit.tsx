import type { cnst } from "@libs/shared/client";
import { cn, type ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ className, banner, href }: ModelProps<"banner", cnst.LightBanner>) => {
  return (
    <Link
      href={href}
      className={cn("flex h-36 w-full animate-fadeIn rounded-lg shadow-sm duration-300 hover:shadow-lg", className)}
    >
      <div>{banner.title}</div>
    </Link>
  );
};
