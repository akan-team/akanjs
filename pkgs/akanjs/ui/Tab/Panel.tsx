"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useContext, useEffect, useState } from "react";

import { TabContext } from "./context";

export interface PanelProps {
  className?: string;
  menu: string;
  children?: ReactNode;
  loading?: "eager" | "lazy" | "every";
}
export const Panel = ({ className, menu, children, loading = "eager" }: PanelProps) => {
  const { menu: currentMenu } = useContext(TabContext);
  const [loaded, setLoaded] = useState(menu === currentMenu);

  useEffect(() => {
    if (loading === "eager") setLoaded(true);
    else if (loading === "lazy" && !loaded && currentMenu === menu) setLoaded(true);
    else if (loading === "every") setLoaded(currentMenu === menu);
  }, [currentMenu]);

  if (loading === "eager") return <div className={cn(className, currentMenu !== menu && "hidden")}>{children}</div>;
  else return loaded ? <div className={cn(className, currentMenu !== menu && "hidden")}>{children}</div> : null;
};
