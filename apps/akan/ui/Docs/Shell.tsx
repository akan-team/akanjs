"use client";
import { usePage } from "@apps/akan/client";
import { cn, getPathInfo, usePathCtx } from "akanjs/client";
import { Link } from "akanjs/ui";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineLeft, AiOutlineRight } from "react-icons/ai";
import { Friend, type FriendProps, JellyStar } from "../Jelly";
import { AudienceIcon, AudienceLegend } from "./Audience";
import type { DocsMenu } from "./Layout";
import { PageTurnTool } from "./PageTurnTool";
import { Search } from "./Search";
import { SearchTool } from "./SearchTool";

const menuLinkClassName = "flex items-center gap-2 rounded-full px-3 transition-colors";
const idleLinkClassName = "text-foreground/70 hover:bg-foreground/5 hover:text-foreground";
const activeLinkClassName = "jelly tint-primary font-bold text-primary-foreground";
const pageTurnClassName =
  "group squish jelly-glass flex min-w-0 flex-col gap-1.5 rounded-3xl px-5 py-4 transition-shadow hover:tint-primary";

interface MenuMarkProps {
  friend?: FriendProps["name"];
}
const MenuMark = ({ friend }: MenuMarkProps) => {
  if (friend) return <Friend name={friend} className="-my-1 size-7 shrink-0" interactive={false} still />;
  return (
    <span className="flex size-7 shrink-0 items-center justify-center">
      <JellyStar className="size-4.5" shadow={false} />
    </span>
  );
};

interface ShellProps {
  children: React.ReactNode;
  menuMap: DocsMenu[];
}

export const Shell = ({ children, menuMap }: ShellProps) => {
  const { l, lang, path } = usePage();
  const pathCtx = usePathCtx();
  const prefix = pathCtx.prefix ?? "";
  const fallbackPath = pathCtx.location?.pathRoute?.path ?? getPathInfo(path, lang, prefix).path;
  const [currentPath, setCurrentPath] = useState(fallbackPath);

  useEffect(() => {
    setCurrentPath(fallbackPath);
  }, [fallbackPath]);

  useEffect(() => {
    const syncCurrentPath = () => {
      setCurrentPath(
        getPathInfo(`${window.location.pathname}${window.location.search}${window.location.hash}`, lang, prefix).path,
      );
    };
    syncCurrentPath();
    window.addEventListener("popstate", syncCurrentPath);
    window.addEventListener("hashchange", syncCurrentPath);
    return () => {
      window.removeEventListener("popstate", syncCurrentPath);
      window.removeEventListener("hashchange", syncCurrentPath);
    };
  }, [lang, prefix]);

  const closeMenu = () => {
    const checkbox = document.getElementById("mobile-menu-toggle") as HTMLInputElement | undefined;
    if (checkbox) checkbox.checked = false;
  };

  const pageList = useMemo(() => menuMap.flatMap((menu) => menu.subMenus), [menuMap]);
  const pageIdx = useMemo(() => {
    return pageList.findIndex((page) => page.href === currentPath);
  }, [pageList, currentPath]);
  const prevPage = useMemo(() => (pageIdx > 0 ? pageList[pageIdx - 1] : null), [pageList, pageIdx]);
  const nextPage = useMemo(() => (pageIdx < pageList.length - 1 ? pageList[pageIdx + 1] : null), [pageList, pageIdx]);

  return (
    <>
      <SearchTool />
      <PageTurnTool next={nextPage} prev={prevPage} />
      <input type="checkbox" id="mobile-menu-toggle" className="peer hidden" />

      <div className="fixed inset-y-0 left-0 z-40 w-full -translate-x-full transform transition-transform duration-50 ease-in-out peer-checked:translate-x-0 lg:hidden">
        <div className="mt-[var(--akanjs-header-bar)] h-full overflow-y-auto bg-background/95 pb-24 shadow-2xl backdrop-blur-xl">
          <div className="px-3 pt-[calc(var(--akanjs-header-inset)+1rem)]">
            <Search className="mb-3" onNavigate={closeMenu} />
            <AudienceLegend className="mb-3" />
            {menuMap.map((menu, menuIdx) => (
              <details key={menuIdx} className="group jelly-glass mb-3 rounded-3xl" open>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 p-4 font-extrabold text-base tracking-tight [&::-webkit-details-marker]:hidden">
                  <MenuMark friend={menu.friend} />
                  <span className="flex-1">{menu.name}</span>
                  <span className="text-foreground/35 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="flex flex-col gap-0.5 px-3 pb-3">
                  {menu.subMenus.map((subMenu, subIdx) => {
                    const isActive = subMenu.href === currentPath;
                    return (
                      <Link
                        key={subIdx}
                        href={subMenu.href}
                        className={cn(menuLinkClassName, "py-2", isActive ? activeLinkClassName : idleLinkClassName)}
                        onClick={() => {
                          setCurrentPath(subMenu.href);
                          closeMenu();
                        }}
                      >
                        {subMenu.audience ? (
                          <AudienceIcon audience={subMenu.audience} className={isActive ? "text-current" : undefined} />
                        ) : null}
                        {subMenu.name}
                      </Link>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>

      <label
        htmlFor="mobile-menu-toggle"
        className="pointer-events-none fixed inset-0 z-30 cursor-pointer bg-black/30 opacity-0 backdrop-blur-sm transition-all duration-300 peer-checked:pointer-events-auto peer-checked:opacity-100 lg:hidden"
      ></label>

      <div className="flex w-full overflow-x-clip">
        <aside className="relative hidden w-72 shrink-0 lg:block">
          <div className="jelly-glass sticky top-[calc(var(--akanjs-header-offset)+0.75rem)] ml-3 flex h-[calc(100vh-var(--akanjs-header-offset)-1.5rem)] w-66 flex-col overflow-hidden rounded-box">
            <div className="overflow-y-auto px-3 pt-3 pb-6">
              <Search className="mb-3" />
              <AudienceLegend className="mb-4" />
              {menuMap.map((menu, idx) => (
                <details key={idx} className="group mb-2" open>
                  <summary className="flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-2xl px-2 py-1.5 font-extrabold text-foreground text-sm tracking-tight transition-colors hover:bg-foreground/4 [&::-webkit-details-marker]:hidden">
                    <MenuMark friend={menu.friend} />
                    <span className="flex-1">{menu.name}</span>
                    <span className="text-foreground/35 text-xs transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-3 text-sm">
                    {menu.subMenus.map((subMenu, idx) => {
                      const isActive = subMenu.href === currentPath;
                      return (
                        <Link
                          key={idx}
                          href={subMenu.href}
                          className={cn(
                            menuLinkClassName,
                            "py-1.5",
                            isActive ? activeLinkClassName : idleLinkClassName,
                          )}
                          onClick={() => setCurrentPath(subMenu.href)}
                        >
                          {subMenu.audience ? (
                            <AudienceIcon
                              audience={subMenu.audience}
                              className={isActive ? "text-current" : undefined}
                            />
                          ) : null}
                          <span className="min-w-0 truncate">{subMenu.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex w-full flex-col gap-2 py-2 pb-10">
            <div className="w-full min-w-0 max-w-full px-4 xl:pr-[270px] xl:pl-4">
              <div className="w-full min-w-0 space-y-2 overflow-x-hidden px-4 pt-40 pb-16 md:pt-48 lg:mt-27 lg:px-8 lg:pt-10 xl:px-16 2xl:px-32">
                {children}
              </div>
              <div className="relative flex w-full px-4 py-2 lg:px-8 xl:px-16 2xl:px-32">
                <div className="mt-2 grid w-full min-w-0 grid-cols-2 gap-3">
                  {prevPage ? (
                    <Link href={prevPage.href} scrollToTop className={cn(pageTurnClassName, "items-start")}>
                      <span className="flex items-center gap-1.5 font-bold text-foreground/45 text-xs uppercase tracking-[0.16em]">
                        <AiOutlineLeft />
                        {l.trans({ en: "Previous", ko: "이전" })}
                      </span>
                      <span className="font-extrabold text-foreground text-sm tracking-tight group-hover:text-primary md:text-base">
                        {prevPage.name}
                      </span>
                    </Link>
                  ) : (
                    <div />
                  )}
                  {nextPage ? (
                    <Link href={nextPage.href} scrollToTop className={cn(pageTurnClassName, "items-end text-right")}>
                      <span className="flex items-center gap-1.5 font-bold text-foreground/45 text-xs uppercase tracking-[0.16em]">
                        {l.trans({ en: "Next", ko: "다음" })}
                        <AiOutlineRight />
                      </span>
                      <span className="font-extrabold text-foreground text-sm tracking-tight group-hover:text-primary md:text-base">
                        {nextPage.name}
                      </span>
                    </Link>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
