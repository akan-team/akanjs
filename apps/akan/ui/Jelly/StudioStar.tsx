import { cn } from "akanjs/client";
import { Image } from "akanjs/ui";

interface StudioStarProps {
  className?: string;
  priority?: boolean;
}
export const StudioStar = ({ className, priority }: StudioStarProps) => {
  return (
    <div className={cn("group/star relative aspect-square", className)}>
      <div className="absolute inset-x-[16%] bottom-[3%] h-[7%] rounded-full bg-black/25 blur-xl dark:bg-black/60" />
      <div className="relative size-full transition-transform duration-700 ease-jelly group-hover/star:scale-105 group-active/star:scale-95 group-active/star:duration-100">
        <div className="jelly-breathe group-hover/star:jelly-wobble size-full">
          <Image
            alt=""
            className="pointer-events-none size-full select-none object-contain"
            draggable={false}
            height={900}
            priority={priority}
            src="/jelly/star-stand.webp"
            width={900}
          />
        </div>
      </div>
    </div>
  );
};
