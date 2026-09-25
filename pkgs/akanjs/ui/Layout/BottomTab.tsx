"use client";
import { cn, usePage } from "akanjs/client";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { Link } from "../Link";
import { BottomInset } from "./BottomInset";

interface TabType {
  name: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
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
  const path = st.use.path({ agent: false });
  const localePath = path.startsWith(`/${lang}`) ? path.slice(lang.length + 1) || "/" : path;
  const isActiveTab = (href: string) => (href === "/" ? localePath === href : localePath.startsWith(href));

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
        className={cn(
          "flex size-full items-center justify-around border-border border-t bg-background/95 text-foreground backdrop-blur-sm",
          className,
        )}
      >
        {tabs.map((tab) => {
          const active = isActiveTab(tab.href);
          return (
            <Link
              key={tab.name}
              href={tab.href}
              replace
              className={cn(
                "relative flex w-full flex-col items-center justify-end gap-1 py-1.5 transition-colors",
                active ? "font-medium text-primary" : "text-foreground/55 hover:text-foreground/80",
              )}
            >
              <div className="relative inline-flex w-max text-xl">
                {active ? (tab.activeIcon ?? tab.icon) : tab.icon}
                {tab.notiCount ? (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[10px] text-destructive-foreground leading-none">
                    {tab.notiCount > 99 ? "99+" : tab.notiCount}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px]">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </BottomInset>
  );
};
