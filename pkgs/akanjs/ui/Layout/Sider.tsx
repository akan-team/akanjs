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
  const path = st.use.path();
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
        className={buttonRecipe({ variant: "ghost" })}
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <AiOutlineMenu />
      </button>

      {isOpen ? (
        <animated.div
          style={overlayAnimation}
          className={cn("fixed inset-0 z-40 h-screen w-screen", bgClassName)}
          onClick={() => {
            setIsOpen(false);
          }}
        />
      ) : null}

      <animated.div
        style={siderAnimation}
        className={cn("fixed top-0 left-0 z-50 h-full w-3/4 bg-muted p-4 text-foreground md:w-80", className)}
      >
        <button
          className="absolute top-4 left-4 text-lg"
          onClick={() => {
            setIsOpen(false);
          }}
        >
          <BiX />
        </button>
        {children}
      </animated.div>
    </>
  );
};
