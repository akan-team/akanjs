"use client";
import { cn } from "akanjs/client";

interface HamburgerMenuProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  className?: string;
  color?: string;
}

export const HamburgerMenu = ({ isOpen, setIsOpen, className, color }: HamburgerMenuProps) => {
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <button
      className={cn(
        "isolate flex flex-col items-center justify-center rounded-md transition-all duration-100",
        className,
      )}
      onClick={toggleMenu}
    >
      <div data-open={isOpen} className="group relative h-6 w-8">
        {/* 상단 바 */}
        <span
          style={{ backgroundColor: color }}
          className={cn(
            "absolute left-0 h-1 w-full rounded-md transition-all ease-in-out",
            isOpen && "top-2.5 rotate-45",
            !isOpen && "top-0",
          )}
        ></span>

        {/* 중간 바 */}
        <span
          style={{ backgroundColor: color }}
          className={cn(
            "absolute left-0 h-1 w-full rounded-md transition-all ease-in-out",
            !isOpen && "top-2.5 opacity-100",
            isOpen && "top-0 opacity-0",
          )}
        ></span>

        {/* 하단 바 */}
        <span
          style={{ backgroundColor: color }}
          className={cn(
            "absolute left-0 h-1 w-full rounded-md transition-all ease-in-out",
            isOpen && "top-2.5 -rotate-45",
            !isOpen && "top-5",
          )}
        ></span>
      </div>
    </button>
  );
};
