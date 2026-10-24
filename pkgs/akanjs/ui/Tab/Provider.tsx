"use client";
import { Any } from "akanjs/base";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
import { type ReactNode, type RefObject, useContext, useEffect, useRef, useState } from "react";
import { sharedContext } from "../../client/sharedContext";
import { agentAttrs } from "../agentAttrs";
import { Tooltip } from "../Tooltip";

interface TabContextType {
  defaultMenu: string | null;
  menu: string | null;
  setMenu: (value: string | null) => void;
  /** Mounted menu key → disabled. */
  menus: RefObject<Map<string, boolean>>;
  switchTab: (menu: string) => void;
}

const TabContext = sharedContext<TabContextType>("tab", {
  defaultMenu: null,
  menu: null,
  setMenu: (value: string | null) => null,
  menus: null as unknown as RefObject<Map<string, boolean>>,
  switchTab: (menu: string) => null,
});

export interface ProviderProps {
  className?: string;
  defaultMenu?: string | null;
  /** Names the tab for the in-page agent; omitted, it publishes nothing (two tabs would share a name). */
  namespace?: string;
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
  // A call-time guard, not a static `oneOf`: the children fill `menus` after this render.
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

export interface MenuProps {
  className?: string;
  activeClassName?: string;
  disabledClassName?: string;
  disabled?: boolean;
  menu: string;
  children: ReactNode;
  scrollToTop?: boolean;
  tooltip?: ReactNode;
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
        {...agentAttrs(switchTab, menu)}
        role="tab"
        type="button"
      >
        {children}
      </button>
    </Tooltip>
  );
};

export interface MenusProps {
  className?: string;
  children: ReactNode;
}
export const Menus = ({ className, children }: MenusProps) => (
  <div className={cn("inline-flex items-center gap-1", className)} role="tablist">
    {children}
  </div>
);

export interface PanelProps {
  className?: string;
  menu: string;
  children?: ReactNode;
  loading?: "eager" | "lazy" | "every";
}
export const Panel = ({ className, menu, children, loading = "eager" }: PanelProps) => {
  const { menu: currentMenu } = useContext(TabContext);
  const isShown = currentMenu === menu;
  const [loaded, setLoaded] = useState(isShown);
  const isMounted = loading === "eager" || isShown || (loading === "lazy" && loaded);
  useEffect(() => {
    setLoaded(isMounted);
  }, [isMounted]);

  return isMounted ? <div className={cn(className, !isShown && "hidden")}>{children}</div> : null;
};
