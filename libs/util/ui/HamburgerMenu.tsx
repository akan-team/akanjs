"use client";
import { usePage } from "@libs/util/client";
import { cn } from "akanjs/client";

interface HamburgerMenuProps {
  className?: string;
  barClassName?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const HamburgerMenu = ({ className, barClassName, isOpen, setIsOpen }: HamburgerMenuProps) => {
  const { l } = usePage();
  const barBaseClassName = "absolute left-0 h-1 w-full rounded-md bg-foreground transition-all ease-in-out";
  return (
    <button
      type="button"
      aria-label={l("util.menu")}
      aria-expanded={isOpen}
      className={cn(
        "isolate flex flex-col items-center justify-center rounded-md transition-all duration-100",
        className,
      )}
      onClick={() => {
        setIsOpen(!isOpen);
      }}
    >
      <div data-open={isOpen} className="group relative h-6 w-8">
        <span className={cn(barBaseClassName, barClassName, isOpen ? "top-2.5 rotate-45" : "top-0")} />
        <span className={cn(barBaseClassName, barClassName, isOpen ? "top-0 opacity-0" : "top-2.5 opacity-100")} />
        <span className={cn(barBaseClassName, barClassName, isOpen ? "top-2.5 -rotate-45" : "top-5")} />
      </div>
    </button>
  );
};
