import { cn } from "akanjs/client";
import { JellyStar } from "./Jelly";

interface AkanLogoProps {
  className?: string;
  logoClassName?: string;
}

export const AkanLogo = ({ className, logoClassName }: AkanLogoProps) => {
  return (
    <div className={cn("group/logo relative isolate flex items-center gap-1.5", className)}>
      <span className={cn("group-hover/logo:jelly-wobble block size-[1.45em]", logoClassName)}>
        <JellyStar />
      </span>
      <span className="font-black tracking-[-0.045em]">Akan.js</span>
    </div>
  );
};
