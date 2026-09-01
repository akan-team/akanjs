"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useContext, useEffect } from "react";

import { agentAttrs } from "../agentAttrs";
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
  const { menu: currentMenu, setMenu, menus, switchTab } = useContext(TabContext);
  useEffect(() => {
    if (!menus.current) return;
    menus.current.set(menu, disabled);
    return () => {
      menus.current?.delete(menu);
    };
  }, [menu, disabled]);
  useEffect(() => {
    if (!disabled || !menus.current) return;
    if (currentMenu === menu) setMenu([...menus.current].find(([key, off]) => key !== menu && !off)?.[0] ?? null);
  }, [disabled]);

  const active = menu === currentMenu;
  return (
    <Tooltip content={tooltip}>
      <button
        aria-selected={active}
        className={cn(
          "rounded-field px-3 py-1.5 font-medium text-sm transition-colors",
          !active && !disabled && "cursor-pointer text-foreground/55 hover:bg-muted/60 hover:text-foreground/80",
          active && "bg-muted text-foreground",
          disabled && "cursor-not-allowed opacity-50",
          className,
          active && activeClassName,
          disabled && disabledClassName,
        )}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          switchTab(menu);
          if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        {...agentAttrs(switchTab)}
        role="tab"
        type="button"
      >
        {children}
      </button>
    </Tooltip>
  );
};
