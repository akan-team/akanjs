"use client";
import { cn } from "akanjs/client";
import { st } from "akanjs/store";
import { type ReactNode, useEffect, useState } from "react";
import { AiOutlineClose, AiOutlineMenu } from "react-icons/ai";
import { BiX } from "react-icons/bi";
import { useSpring } from "react-spring";
import { agentAttrs } from "../agentAttrs";
import { animated } from "../animated";
import { buttonRecipe } from "../Button";

export interface SiderProps {
  className?: string;
  bgClassName?: string;
  /** Element that opens the drawer. Defaults to the framework's hamburger button. */
  trigger?: ReactNode;
  /** Whole top row of the drawer, replacing the row the close button sits in. */
  header?: ReactNode;
  /** Element that closes the drawer, inside the default header row. */
  close?: ReactNode;
  children?: ReactNode;
}

export const Sider = ({ className, bgClassName, trigger, header, close, children }: SiderProps) => {
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
      <div className="contents" onClick={() => void openMenu()} {...agentAttrs(openMenu)}>
        {trigger ?? (
          <button aria-label="Open menu" className={buttonRecipe({ variant: "ghost", size: "icon" })} type="button">
            <AiOutlineMenu />
          </button>
        )}
      </div>

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
        {header ?? (
          <div className="flex shrink-0 items-center justify-end p-2">
            <div className="contents" onClick={() => void closeMenu()} {...agentAttrs(closeMenu)}>
              {close ?? (
                <button
                  aria-label="Close menu"
                  className={buttonRecipe({ variant: "ghost", size: "icon" }, "rounded-full text-foreground/50")}
                  type="button"
                >
                  <BiX className="text-2xl" />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </animated.div>
    </>
  );
};

export interface LeftSiderProps {
  className?: string;
  children: ReactNode;
  open: boolean;
  width?: number | string;
  /** Element that closes the drawer. `false` draws none. */
  close?: ReactNode | false;
  onCancel: () => void;
}
export const LeftSider = ({ className, children, open, width, close, onCancel }: LeftSiderProps) => {
  return (
    <div
      className={cn(
        "absolute top-0 border-muted border-r bg-background transition-all duration-150",
        open ? "translate-x-0" : "translate-x-[-100%]",
        className,
      )}
      style={{ width }}
    >
      {children}
      {close === false ? null : (
        <div
          className="absolute top-0 right-0"
          onClick={() => {
            onCancel();
          }}
        >
          {close ?? (
            <button className={buttonRecipe({ variant: "ghost", size: "icon" })}>
              <BiX />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface RightSiderProps {
  className?: string;
  children: ReactNode;
  open: boolean;
  title?: ReactNode;
  width?: number | string;
  /** The mark inside the drawer's close control. `false` draws no control. */
  close?: ReactNode | false;
  onCancel: () => void;
}
export const RightSider = ({ className, children, open, title, width, close, onCancel }: RightSiderProps) => {
  return (
    <div
      className={cn(
        "group absolute top-0 right-0 overflow-y-auto border-muted border-l bg-background pt-14 transition-all duration-150",
        open && "translate-x-0",
        !open && "translate-x-[100%]",
        className,
      )}
      style={{ width }}
    >
      {children}
      <div className="absolute top-2 left-4 flex items-center gap-4 pt-2 text-xl">
        {close === false ? null : (
          <div
            className={cn(
              "cursor-pointer border-muted bg-background transition-all duration-150",
              open && "opacity-100",
              !open && "opacity-0",
            )}
            onClick={() => {
              onCancel();
            }}
          >
            {close ?? <AiOutlineClose />}
          </div>
        )}
        {title ? <div className="whitespace-nowrap">{title}</div> : null}
      </div>
    </div>
  );
};
