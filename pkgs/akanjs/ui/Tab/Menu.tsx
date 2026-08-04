"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useContext, useEffect } from "react";

import { Tooltip } from "../Tooltip";
import { TabContext } from "./context";

export interface MenuProps {
  className?: string;
  activeClassName?: string;
  disabledClassName?: string;
  disabled?: boolean;
  menu: string;
  children: ReactNode;
  scrollToTop?: boolean;
  tooltip?: string;
}
export const Menu = ({
  className,
  activeClassName = "",
  disabledClassName = "",
  disabled = false,
  menu,
  children,
  scrollToTop,
  tooltip,
}: MenuProps) => {
  const { menu: currentMenu, setMenu, menuSet } = useContext(TabContext);
  useEffect(() => {
    if (!menuSet.current) return;
    menuSet.current.add(menu);
  }, [menu]);
  useEffect(() => {
    if (!disabled || !menuSet.current) return;
    if (currentMenu === menu) setMenu([...menuSet.current.values()].find((m) => m !== menu) ?? null);
  }, [disabled]);

  return (
    <Tooltip content={tooltip}>
      <div
        className={cn(
          className,
          menu !== currentMenu && !disabled && "cursor-pointer",
          disabled && "cursor-not-allowed",
          menu === currentMenu && activeClassName,
          disabled && disabledClassName,
        )}
        onClick={() => {
          if (disabled) return;
          setMenu(menu);
          if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        {children}
      </div>
    </Tooltip>
  );
};
