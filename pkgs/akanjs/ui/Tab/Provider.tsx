"use client";
import { Any } from "akanjs/base";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
import { type ReactNode, useRef, useState } from "react";

import { TabContext } from "./context";

export interface ProviderProps {
  /** Additional classes for the tab state wrapper. */
  className?: string;
  /** Initial active menu key. */
  defaultMenu?: string | null;
  /** Names this tab for the in-page agent. Without it the tab publishes nothing — two tabs on one screen would otherwise share a name. */
  namespace?: string;
  /** Tab.Menus and Tab.Panel children. */
  children?: ReactNode;
}
export const Provider = ({ className, defaultMenu = null, namespace, children }: ProviderProps) => {
  const menus = useRef(new Map<string, boolean>());
  const [menu, setMenu] = useState<string | null>(defaultMenu);
  const suffix = namespace ? capitalize(namespace) : "";
  st.expose(namespace ? `tabsIn${suffix}` : null, Any)
    .desc("The menus this tab offers and the one it shows.")
    // A thunk, not a value: the children fill `menus` after this render, so a value built here is empty.
    .value(() => ({
      current: menu,
      menus: [...menus.current].map(([key, disabled]) => (disabled ? { menu: key, disabled } : { menu: key })),
    }));
  // The menu list is filled by the children after this render, so it cannot be a mount-static `oneOf`; the guard
  // reads it at call time instead, which is also what keeps a disabled menu out of reach of the agent alone.
  const switchTab = st
    .tool(namespace ? `switchTabIn${suffix}` : null, {
      guard: ({ menu }) => {
        const disabled = menus.current.get(menu as string);
        if (disabled === undefined)
          return `No menu "${String(menu)}" on this tab. It offers: ${[...menus.current.keys()].join(", ")}.`;
        return disabled ? `The menu "${String(menu)}" is disabled.` : true;
      },
    })
    .desc(`Show one menu of the ${namespace ?? ""} tab. Read tabsIn${suffix} for the menus it offers.`)
    .arg("menu", String)
    .exec((next) => {
      setMenu(next);
    });
  return (
    <TabContext.Provider value={{ defaultMenu, menu, setMenu, menus, switchTab }}>
      <div data-menu={menu} className={cn(className, "group/tab")}>
        {children}
      </div>
    </TabContext.Provider>
  );
};
