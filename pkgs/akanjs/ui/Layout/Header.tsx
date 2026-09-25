"use client";
import { clsx } from "akanjs/client";
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface HeaderProps {
  className?: string;
  type?: "static" | "hide";
  children?: ReactNode;
  height?: number;
}
export const Header = ({ className, type, children, height = 40 }: HeaderProps) => {
  const [visible, setVisible] = useState(true);
  const position = useRef(0);
  useEffect(() => {
    if (type === "static") return;
    const handleScroll = () => {
      const isVisible = window.scrollY < 64 ? true : position.current > window.scrollY;
      position.current = window.scrollY;
      setVisible(isVisible);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
  return (
    <div
      className={clsx(
        `fixed top-0 z-[9] flex duration-300 ${
          !visible ? "md:-translate-y-full" : ""
        } w-full bg-base-100 shadow-sm backdrop-blur-lg`,
        className,
      )}
    >
      {children}
    </div>
  );
};
