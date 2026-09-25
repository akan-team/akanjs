"use client";
import { clsx } from "akanjs/client";
import { type ReactNode, useRef, useState } from "react";

import { TabContext } from "./context";

export interface ProviderProps {
  /** Additional classes for the tab state wrapper. */
  className?: string;
  /** Initial active menu key. */
  defaultMenu?: string | null;
  /** Tab.Menus and Tab.Panel children. */
  children?: ReactNode;
}
export const Provider = ({ className, defaultMenu = null, children }: ProviderProps) => {
  const menuSet = useRef(new Set<string>());
  const [menu, setMenu] = useState<string | null>(defaultMenu);
  return (
    <TabContext.Provider value={{ defaultMenu, menu, setMenu, menuSet }}>
      <div data-menu={menu} className={clsx(className, "group/tab")}>
        {children}
      </div>
    </TabContext.Provider>
  );
};
