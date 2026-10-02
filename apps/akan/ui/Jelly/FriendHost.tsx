"use client";
import { type ReactNode, useEffect, useRef } from "react";
import { FriendDirector } from "./friendDirector.util";

interface FriendHostProps {
  className?: string;
  name: string;
  isStill: boolean;
  children: ReactNode;
}
export const FriendHost = ({ className, name, isStill, children }: FriendHostProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return FriendDirector.attach(el);
  }, []);
  return (
    <span aria-hidden="true" className={className} data-friend={name} data-still={isStill ? "" : undefined} ref={ref}>
      {children}
    </span>
  );
};
