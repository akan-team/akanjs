import { clsx } from "akanjs/client";
import { Image } from "akanjs/ui";

interface AkanLogoProps {
  className?: string;
  logoClassName?: string;
}

export const AkanLogo = ({ className, logoClassName }: AkanLogoProps) => {
  return (
    <div className={clsx("relative isolate flex items-center", className)}>
      <div className="relative">
        <div className="pointer-events-none absolute top-[38%] left-[44%] h-7 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-md" />
        <div className="pointer-events-none absolute right-1 bottom-0 h-5 w-8 rounded-full bg-primary/12 blur-md" />
        <Image src="/akanlogo.png" width={64} height={64} className={clsx("relative z-10", logoClassName)} />
      </div>
      <span className="relative z-10 -ml-1 font-bold">Akan.js</span>
    </div>
  );
};
