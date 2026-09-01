import { Shell } from "./Shell";

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
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Shell menuMap={menuMap}>{children}</Shell>
    </main>
  );
};
