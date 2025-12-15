"use client";
import { clsx } from "@akanjs/client";

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
  const bgColor = color ? `bg-[${color}]` : "bg-black";

  return (
    <button
      className={clsx(
        "flex flex-col items-center justify-center  rounded-md isolate  transition-all duration-100",
        className
      )}
      onClick={toggleMenu}
    >
      <div data-open={isOpen} className="relative h-6 w-8 group">
        {/* 상단 바 */}
        <span
          style={{ backgroundColor: color }}
          className={clsx("absolute left-0 h-1 w-full rounded-md transition-all  ease-in-out", {
            "top-2.5 rotate-45": isOpen,
            "top-0": !isOpen,
          })}
        ></span>

        {/* 중간 바 */}
        <span
          style={{ backgroundColor: color }}
          className={clsx("absolute left-0 h-1 w-full rounded-md transition-all  ease-in-out", {
            "top-2.5 opacity-100": !isOpen,
            "top-0 opacity-0": isOpen,
          })}
        ></span>

        {/* 하단 바 */}
        <span
          style={{ backgroundColor: color }}
          className={clsx("absolute left-0 h-1 w-full rounded-md transition-all  ease-in-out", {
            "top-2.5 -rotate-45": isOpen,
            "top-5": !isOpen,
          })}
        ></span>
      </div>
    </button>
  );
};
