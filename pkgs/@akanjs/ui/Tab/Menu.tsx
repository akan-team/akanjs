"use client";
import { clsx } from "@akanjs/client";
import { useContext, useEffect } from "react";

import { TabContext } from "./context";

export interface MenuProps {
  className?: string;
  activeClassName?: string;
  disabledClassName?: string;
  disabled?: boolean;
  menu: string;
  children: any;
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
    <div
      data-tip={tooltip}
      className={clsx(className, {
        "cursor-pointer": menu !== currentMenu && !disabled,
        "cursor-not-allowed": disabled,
        tooltip: !!tooltip,
        [activeClassName]: menu === currentMenu,
        [disabledClassName]: disabled,
      })}
      onClick={() => {
        if (disabled) return;
        setMenu(menu);
        if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      {children}
    </div>
  );
};
