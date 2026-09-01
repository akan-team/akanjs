"use client";
import { cn } from "akanjs/client";
import { st } from "akanjs/store";
import { animated } from "akanjs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { AiOutlineMenu } from "react-icons/ai";
import { BiX } from "react-icons/bi";
import { useSpring } from "react-spring";
import { buttonRecipe } from "../Button";

export interface SiderProps {
  className?: string;
  bgClassName?: string;
  children?: ReactNode;
}

export const Sider = ({ className, bgClassName, children }: SiderProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const path = st.use.path({ agent: false });
  const openMenu = st
    .tool("openMenu")
    .desc("Open the side navigation drawer.")
    .exec(() => {
      setIsOpen(true);
    });
  const closeMenu = st
    .tool("closeMenu")
    .desc("Close the side navigation drawer.")
    .exec(() => {
      setIsOpen(false);
    });
  useEffect(() => {
    setIsOpen(false);
  }, [path]);
  const siderAnimation = useSpring({
    translateX: isOpen ? "0%" : "-100%",
    config: { tension: 300, friction: 30 },
  });
  const overlayAnimation = useSpring({
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });

  return (
    <>
      <button
        aria-label="Open menu"
        className={buttonRecipe({ variant: "ghost", size: "icon" })}
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        <AiOutlineMenu />
      </button>

      {isOpen ? (
        <animated.div
          style={overlayAnimation}
          className={cn("fixed inset-0 z-40 bg-black/50 backdrop-blur-sm", bgClassName)}
          onClick={() => {
            setIsOpen(false);
          }}
        />
      ) : null}

      <animated.div
        // Off-screen but still mounted, so it stays out of the tab order until it is actually reachable.
        aria-hidden={!isOpen}
        className={cn(
          "fixed top-0 left-0 z-50 flex h-full w-3/4 flex-col border-border border-r bg-card text-card-foreground shadow-2xl md:w-80",
          !isOpen && "pointer-events-none",
          className,
        )}
        style={siderAnimation}
      >
        <div className="flex shrink-0 items-center justify-end p-2">
          <button
            aria-label="Close menu"
            className={buttonRecipe({ variant: "ghost", size: "icon" }, "rounded-full text-foreground/50")}
            onClick={() => {
              setIsOpen(false);
            }}
            type="button"
          >
            <BiX className="text-2xl" />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </animated.div>
    </>
  );
};
