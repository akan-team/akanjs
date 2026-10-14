"use client";
import { cn, usePage, usePathCtx } from "akanjs/client";
import type { ReactNode } from "react";

import { Link } from "../Link";
import { isActiveHref, useCurrentPathname } from "../Link/activePath";
import { BottomInset } from "./BottomInset";

interface TabType {
  name: ReactNode;
  icon?: ReactNode;
  activeIcon?: ReactNode;
  /** Drawn in the tab's link in place of icon and name, and passable from a server component, unlike `renderTab`. */
  content?: ReactNode;
  activeContent?: ReactNode;
  notiCount?: number;
  href: string;
  /** Lights on `href` alone, not on the pages under it: a home tab at `/org/<id>` under which every org page sits. */
  exact?: boolean;
  /** More paths that light the tab, each with the pages under it: a "More" tab that claims several sections. */
  match?: string[];
}

export interface BottomTabProps {
  className?: string;
  tabs: TabType[];
  height?: number;
  /** Names the tab bar's navigation landmark for a screen reader. */
  label?: string;
  /** Draws one tab inside its link. The link, the route match, and the badge placement stay the framework's. */
  renderTab?: (tab: TabType, active: boolean) => ReactNode;
}

export const BottomTab = ({ className, tabs, height = 64, label, renderTab }: BottomTabProps) => {
  const { lang } = usePage();
  const { prefix } = usePathCtx();
  const pathname = useCurrentPathname();
  const isActiveTab = ({ href, exact, match }: TabType) =>
    isActiveHref({ pathname, href, lang, prefix: prefix ?? "", exact, match });

  return (
    <BottomInset
      className="h-full"
      role="bottomChrome"
      estimatedHeight={height}
      frameCache
      frameScope="layout"
      frameSource="bottomTab"
    >
      <nav
        aria-label={label}
        className={cn(
          "flex size-full items-center justify-around border-border border-t bg-background/95 text-foreground backdrop-blur-sm",
          className,
        )}
      >
        {tabs.map((tab) => {
          const active = isActiveTab(tab);
          const custom = renderTab ? renderTab(tab, active) : active ? (tab.activeContent ?? tab.content) : tab.content;
          const badge = tab.notiCount ? (
            <span
              className={cn(
                "absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[10px] text-destructive-foreground leading-none",
                custom !== undefined ? "top-1 left-[calc(50%+0.5rem)]" : "-top-1 -right-2",
              )}
            >
              {tab.notiCount > 99 ? "99+" : tab.notiCount}
            </span>
          ) : null;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              replace
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-full flex-col items-center justify-end gap-1 py-1.5 transition-colors",
                active ? "font-medium text-primary" : "text-foreground/55 hover:text-foreground/80",
              )}
            >
              {custom !== undefined ? (
                <>
                  {custom}
                  {badge}
                </>
              ) : (
                <>
                  <div className="relative inline-flex w-max text-xl">
                    {active ? (tab.activeIcon ?? tab.icon) : tab.icon}
                    {badge}
                  </div>
                  <span className="text-[11px]">{tab.name}</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </BottomInset>
  );
};
