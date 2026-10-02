import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { Friend, type FriendProps } from "./Friend";
import { JellyStar } from "./JellyStar";

interface JellyKickerProps {
  className?: string;
  friend?: FriendProps["name"];
  children: ReactNode;
}
export const JellyKicker = ({ className, friend, children }: JellyKickerProps) => {
  return (
    <p
      className={cn(
        "jelly-glass inline-flex items-center gap-2 rounded-full py-1 pr-4 pl-1.5 font-bold text-foreground/75 text-sm",
        className,
      )}
    >
      {friend ? (
        <Friend className="size-7" name={friend} />
      ) : (
        <span className="block size-7 p-0.5">
          <JellyStar />
        </span>
      )}
      {children}
    </p>
  );
};
