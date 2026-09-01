"use client";
import { Admin, type cnst, st, usePage } from "@libs/shared/client";
import { cn, type DataMenuItem, router } from "akanjs/client";
import { useInterval } from "akanjs/webkit";
import type { ComponentType, ReactNode } from "react";

interface AdministratorProps {
  defaultMenu?: string;
  pageMenus: { key: string; title: string; menus: DataMenuItem[] | DataMenuItem }[];
  password?: boolean;
  ssoTypes?: cnst.SsoType["value"][];
  logo?: ReactNode;
  footer?: ReactNode;
  themes?: string[];
}

export const Administrator = ({
  defaultMenu = "admin",
  password,
  ssoTypes,
  logo,
  pageMenus,
  footer,
  themes = ["light", "dark"],
}: AdministratorProps) => {
  const searchParams = st.use.searchParams();
  const topMenu = Array.isArray(searchParams.topMenu) ? searchParams.topMenu[0] : searchParams.topMenu;
  const subMenu = Array.isArray(searchParams.subMenu) ? searchParams.subMenu[0] : searchParams.subMenu;
  const storeDo = st.do as unknown as { [key: string]: ((...args: unknown[]) => Promise<void>) | undefined };
  const { l } = usePage();
  const pageMenu = pageMenus.find((pageMenu) => pageMenu.key === topMenu) ?? pageMenus[0];
  const menuItems = pageMenu.menus;
  const isArray = Array.isArray(menuItems);
  const me = st.use.me();
  const activeMenu = isArray ? (menuItems.find((menuItem) => menuItem.key === subMenu) ?? menuItems[0]) : menuItems;
  const Render: ComponentType = activeMenu.render;
  const labelOf = (menuItem: DataMenuItem) =>
    menuItem.label ?? l((menuItem.key.includes(".") ? menuItem.key : `${menuItem.key}.modelName`) as `admin.id`);
  useInterval(() => {
    if (me.id) void storeDo.getActiveSummary?.();
  }, 2000);
  if (!me.id || ["signup", "signin"].includes(topMenu ?? ""))
    return <Admin.Util.Auth ssoTypes={ssoTypes} password={password} logo={logo} />;
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-4 border-border border-b bg-background px-4 text-foreground">
        <div className="flex shrink-0 items-center gap-2.5">
          {logo}
          <span className="hidden text-foreground/40 text-sm lg:block">{l("admin.modelName")}</span>
        </div>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-muted p-1">
          {pageMenus.map((menu) => (
            <button
              key={menu.key}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium text-sm duration-200",
                menu.key === pageMenu.key
                  ? "bg-foreground text-background"
                  : "text-foreground/60 hover:bg-foreground/10 hover:text-foreground",
              )}
              onClick={() => router.push(`/admin?topMenu=${menu.key}`)}
            >
              {menu.title}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          <Admin.View.General admin={me} />
          <Admin.Util.ToolMenu themes={themes} />
        </div>
      </header>
      {isArray ? (
        <aside className="group fixed top-14 bottom-0 left-0 z-40 w-16 overflow-hidden border-border border-r bg-background duration-300 hover:w-60 hover:shadow-2xl">
          <nav className="flex h-full flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
            {menuItems.map((menuItem) => {
              const isActive = menuItem.key === (subMenu ?? menuItems[0].key);
              return (
                <button
                  key={menuItem.key}
                  className={cn(
                    "relative flex h-11 w-56 shrink-0 items-center gap-3 rounded-xl px-3 duration-200",
                    isActive ? "bg-muted text-foreground" : "text-foreground/50 hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => router.push(`/admin?topMenu=${pageMenu.key}&subMenu=${menuItem.key}`)}
                >
                  <span
                    className={cn(
                      "absolute -left-2 h-5 w-0.5 rounded-r-full bg-foreground duration-200",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex size-6 shrink-0 items-center justify-center text-lg">{menuItem.icon}</span>
                  <span className="truncate text-left text-sm opacity-0 duration-200 group-hover:opacity-100">
                    {labelOf(menuItem)}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}
      <main className={cn("pt-14", isArray ? "pl-16" : "")}>
        <div className="p-4 md:p-6">
          <div className="mb-4 flex items-center gap-1.5 text-foreground/40 text-xs">
            <span>{pageMenu.title}</span>
            <span>/</span>
            <span className="text-foreground/70">{labelOf(activeMenu)}</span>
          </div>
          <Render />
          {footer ? <div className="mt-10">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
};
