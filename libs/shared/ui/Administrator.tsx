"use client";
import { DataMenuItem, router } from "@akanjs/client";
import { useInterval } from "@akanjs/next";
import { Menu } from "@akanjs/ui";
import { Admin, cnst, st, usePage } from "@shared/client";
import { ReactNode, useState } from "react";

interface AdministratorProps {
  defaultMenu?: string;
  pageMenus: { key: string; title: string; menus: DataMenuItem[] | DataMenuItem }[];
  password?: boolean;
  ssoTypes?: cnst.SsoType["value"][];
  logo?: ReactNode;
  footer?: ReactNode;
}

export const Administrator = ({
  defaultMenu = "admin",
  password,
  ssoTypes,
  logo,
  pageMenus,
  footer,
}: AdministratorProps) => {
  const searchParams = st.use.searchParams();
  const topMenu = searchParams.topMenu as string | undefined;
  const subMenu = searchParams.subMenu as string | undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const storeDo = st.do as unknown as { [key: string]: ((...args) => Promise<void>) | undefined };
  const { l } = usePage();
  const pageMenu = pageMenus.find((pageMenu) => pageMenu.key === topMenu) ?? pageMenus[0];
  const menuItems = pageMenu.menus;
  const isArray = Array.isArray(menuItems);
  const me = st.use.me();
  const Render: any = isArray
    ? (menuItems.find((menuItem) => menuItem.key === subMenu) ?? menuItems[0]).render
    : menuItems.render;
  useInterval(() => {
    if (me.id) void storeDo.getActiveSummary?.();
  }, 2000);
  if (!me.id || ["signup", "signin"].includes(topMenu ?? ""))
    return <Admin.Util.Auth ssoTypes={ssoTypes} password={password} logo={logo} />;
  return (
    <div className="mx-auto mt-0 block min-h-screen overflow-hidden">
      <div className="fixed z-50 flex h-12 w-full items-center justify-between bg-black">
        <div className="mt-1 ml-5">
          <div className="text-base-100 flex items-center gap-3 whitespace-nowrap">
            {logo} {l("admin.modelName")}
          </div>
        </div>
        <Menu
          className="inset-x-0 top-0 flex h-12 w-[400px] justify-center"
          ulClassName=" flex items-center justify-center"
          inlineCollapsed={false}
          mode="horizontal"
          selectedKeys={[pageMenu.key]}
          onClick={({ key }) => router.push(`/admin?topMenu=${key}`)}
          items={pageMenus.map((pageMenu) => ({
            key: pageMenu.key,
            label: <div className="text-white">{pageMenu.title}</div>,
          }))}
        />
        <Admin.View.General admin={me} />
      </div>
      {isArray && (
        <div className="fixed mt-12 h-full">
          <Menu
            className="text-xs shadow-lg"
            style={{ height: "100vh" }}
            defaultSelectedKeys={[menuItems[0].key]}
            inlineCollapsed={!menuOpen}
            mode="inline"
            activeStyle="active"
            items={menuItems.map((menuItem) => ({
              ...menuItem,
              icon: <div className="flex h-5 justify-center">{menuItem.icon}</div>,
              label: (
                <div className="flex h-5 justify-center">
                  {menuItem.label ??
                    l((menuItem.key.includes(".") ? menuItem.key : `${menuItem.key}.modelName`) as `admin.id`)}
                </div>
              ),
              render: undefined,
            }))}
            selectedKeys={[subMenu ?? menuItems[0].key]}
            onClick={({ key }) => router.push(`/admin?topMenu=${pageMenu.key}&subMenu=${key}`)}
            onMouseOver={() => {
              if (!menuOpen) setMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (menuOpen) setMenuOpen(false);
            }}
          />
        </div>
      )}
      <div className={`mt-20 ${!isArray ? "mx-12" : menuOpen ? "ml-60" : "ml-24"} mr-4 min-h-screen duration-300`}>
        <Render />
      </div>
    </div>
  );
};
