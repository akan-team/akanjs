"use client";
import { clsx } from "@akanjs/client";
import { useRef, useState } from "react";

import { TabContext } from "./context";

export interface ProviderProps {
  className?: string;
  defaultMenu?: string | null;
  children?: any;
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
