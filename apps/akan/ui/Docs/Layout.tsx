import type { FriendProps } from "../Jelly";
import type { Audience } from "./Audience";
import { Shell } from "./Shell";

export interface DocsMenu {
  name: string;
  friend?: FriendProps["name"];
  subMenus: {
    name: string;
    href: string;
    audience?: Audience;
  }[];
}

interface LayoutProps {
  children: React.ReactNode;
  menuMap: DocsMenu[];
}

export const Layout = ({ children, menuMap }: LayoutProps) => {
  return (
    <main className="min-h-screen overflow-x-clip text-foreground">
      <Shell menuMap={menuMap}>{children}</Shell>
    </main>
  );
};
