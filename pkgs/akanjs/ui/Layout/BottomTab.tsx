"use client";
import { clsx, usePage } from "akanjs/client";
import { useEffect, useState } from "react";

import { Link } from "../Link";
import { BottomInset } from "./BottomInset";

interface TabType {
  name: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  notiCount?: number;
  href: string;
}

export interface BottomTabProps {
  className?: string;
  tabs: TabType[];
  height?: number;
}

export const BottomTab = ({ className, tabs, height = 64 }: BottomTabProps) => {
  const { lang } = usePage();
  //ssr 에러나서 꼼짝없이 쓴거임. 페이지 이동에 대응안됨.
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const isActiveTab = (tabHref: string) => {
    if (!isRendered) return false;
    const locationPath = window.location.pathname.startsWith(`/${lang}`)
      ? window.location.pathname.slice(lang.length + 1) === ""
        ? "/"
        : window.location.pathname.slice(lang.length + 1)
      : window.location.pathname;
    return tabHref === "/" ? locationPath === tabHref : locationPath.startsWith(tabHref);
  };

  useEffect(() => {
    setIsRendered(true);
  }, []);

  return (
    <BottomInset
      className="h-full"
      role="bottomChrome"
      estimatedHeight={height}
      frameCache
      frameScope="layout"
      frameSource="bottomTab"
    >
      <div
        className={clsx(
          `flex size-full items-center justify-around rounded-t-xl border border-base-200 border-b-0 bg-base-100`,
          className,
        )}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            replace
            className={`relative flex w-full flex-col items-center justify-end gap-1 ${
              isActiveTab(tab.href) ? "" : "opacity-60"
            }`}
          >
            <div className="indicator">
              {isActiveTab(tab.href) ? (tab.activeIcon ?? tab.icon) : tab.icon}
              {tab.notiCount && tab.notiCount > 0 ? (
                <div className="indicator-item flex size-2 items-center justify-center rounded-full bg-secondary text-[10px] text-base-100"></div>
              ) : null}
            </div>
            <span>{tab.name}</span>
          </Link>
        ))}
      </div>
    </BottomInset>
  );
};
