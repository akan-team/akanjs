import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { JellyStar } from "./JellyStar";

interface JellyLoaderProps {
  className?: string;
  label?: string;
}
export const JellyLoader = ({ className, label }: JellyLoaderProps) => {
  const { l } = usePage();
  return (
    <div className={cn("flex min-h-[60vh] w-full flex-col items-center justify-center gap-4", className)} role="status">
      <JellyStar className="size-20" motion="hop" />
      <span className="font-bold text-foreground/45 text-sm">
        {label ?? l.trans({ en: "Loading…", ko: "불러오는 중…" })}
      </span>
    </div>
  );
};
