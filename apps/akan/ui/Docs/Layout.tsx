"use client";
import { usePage } from "@apps/akan/client";
import { clsx, getPathInfo, usePathCtx } from "akanjs/client";
import { Link } from "akanjs/ui";
import { useMemo } from "react";
import { AiOutlineLeft, AiOutlineRight } from "react-icons/ai";
import { Search } from "./Search";

interface LayoutProps {
  children: React.ReactNode;
  menuMap: {
    name: string;
    subMenus: {
      name: string;
      href: string;
    }[];
  }[];
}

export const Layout = ({ children, menuMap }: LayoutProps) => {
  const { l, lang, path } = usePage();
  const pathCtx = usePathCtx();
  const currentPath = pathCtx.location?.pathRoute?.path ?? getPathInfo(path, lang, pathCtx.prefix ?? "").path;

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
    <main className="min-h-screen overflow-x-hidden bg-base-100 text-base-content">
      <input type="checkbox" id="mobile-menu-toggle" className="peer hidden" />

      <div className="fixed inset-y-0 left-0 z-40 w-full -translate-x-full transform transition-transform duration-50 ease-in-out peer-checked:translate-x-0 lg:hidden">
        <div className="mt-16 h-full overflow-y-auto border-base-content/10 border-r bg-base-100/95 pb-24 shadow-2xl backdrop-blur-xl">
          <div className="px-3 pt-24 md:pt-6">
            <Search className="mb-3" onNavigate={closeMenu} />
            {menuMap.map((menu, menuIdx) => (
              <details
                key={menuIdx}
                className="collapse-arrow collapse mb-2 rounded-2xl border border-base-content/10 bg-base-content/4"
                open
              >
                <summary className="collapse-title font-bold text-base">{menu.name}</summary>
                <div className="collapse-content pl-4">
                  {menu.subMenus.map((subMenu, subIdx) => {
                    const isActive = subMenu.href === currentPath;
                    return (
                      <Link
                        key={subIdx}
                        href={subMenu.href}
                        className={clsx(
                          "mb-1 block rounded-xl px-3 py-2 text-sm transition-colors hover:text-primary",
                          isActive && "font-bold text-primary",
                        )}
                        onClick={closeMenu}
                      >
                        <div className="flex items-center gap-2">
                          <span>•</span> {subMenu.name}
                        </div>
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

      <div className="flex w-full overflow-x-hidden">
        <div className="relative hidden w-70 lg:block">
          <div className="fixed top-29 left-0 flex h-[calc(100vh-7rem)] w-65 flex-col overflow-hidden border border-base-content/10 border-l-0 bg-base-content/4 pt-4 font-medium shadow-2xl shadow-base-content/5 backdrop-blur-xl">
            <div className="overflow-y-auto px-2 pb-6">
              <Search className="mb-3" />
              {menuMap.map((menu, idx) => (
                <div key={idx} className="collapse-arrow collapse rounded-2xl">
                  <input type="checkbox" defaultChecked={true} />
                  <div className="collapse-title whitespace-nowrap font-bold text-base-content/50 text-sm uppercase tracking-[0.18em]">
                    {menu.name}
                  </div>
                  <div className="collapse-content pl-6 text-sm">
                    <div className="flex flex-col">
                      {menu.subMenus.map((subMenu, idx) => {
                        const isActive = subMenu.href === currentPath;
                        return (
                          <Link key={idx} href={subMenu.href} className="mb-1 block rounded-xl">
                            <div
                              className={clsx(
                                "flex items-center gap-2 rounded-xl px-3 py-1 text-base-content/70 transition-colors hover:text-primary",
                                isActive && "font-bold text-primary",
                              )}
                            >
                              <span>•</span> {subMenu.name}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex w-full flex-col gap-2 py-2 pb-10">
            <div className="w-full min-w-0 max-w-full px-4 lg:pr-[270px] lg:pl-4">
              <div className="w-full min-w-0 space-y-2 overflow-x-hidden px-4 pt-40 pb-16 md:pt-48 lg:mt-27 lg:px-8 lg:pt-10 xl:px-16 2xl:px-32">
                {children}
              </div>
              <div className="relative flex w-full px-4 py-2 lg:px-8 xl:px-16 2xl:px-32">
                <div className="mt-2 flex w-full min-w-0 items-center justify-between">
                  {prevPage ? (
                    <Link href={prevPage.href} scrollToTop className="group cursor-pointer">
                      <div className="flex cursor-pointer flex-col items-start gap-2 rounded-2xl border border-base-content/10 bg-base-content/4 p-4 transition-all hover:border-primary/20 hover:bg-primary/10">
                        <div className="pl-6 text-base-content/70 text-xs duration-200 group-hover:text-primary md:text-sm">
                          {l.trans({ en: "Previous", ko: "이전" })}
                        </div>
                        <div className="flex items-center justify-between gap-2 duration-200 group-hover:text-primary">
                          <AiOutlineLeft />
                          <div className="font-bold text-base-content text-sm duration-200 group-hover:text-primary md:text-base">
                            {prevPage.name}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div />
                  )}
                  {nextPage ? (
                    <Link href={nextPage.href} scrollToTop className="group cursor-pointer">
                      <div className="flex cursor-pointer flex-col items-start gap-2 rounded-2xl border border-base-content/10 bg-base-content/4 p-4 transition-all hover:border-primary/20 hover:bg-primary/10">
                        <div className="text-base-content/70 text-xs duration-200 group-hover:text-primary md:text-sm">
                          {l.trans({ en: "Next", ko: "다음" })}
                        </div>
                        <div className="flex items-center justify-between gap-2 duration-200 group-hover:text-primary">
                          <div className="font-bold text-base-content text-sm duration-200 group-hover:text-primary md:text-base">
                            {nextPage.name}
                          </div>
                          <AiOutlineRight />
                        </div>
                      </div>
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
    </main>
  );
};
