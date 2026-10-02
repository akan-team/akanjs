import { cn } from "akanjs/client";
import { Image } from "akanjs/ui";

interface FriendLayerProps {
  className?: string;
  src: string;
  priority?: boolean;
}
export const FriendLayer = ({ className, src, priority }: FriendLayerProps) => {
  return (
    <Image
      alt=""
      className={cn("absolute inset-0 size-full select-none object-contain", className)}
      draggable={false}
      height={256}
      priority={priority}
      src={src}
      width={256}
    />
  );
};
