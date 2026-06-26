import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";
import type { ReactNode } from "react";
import { AiOutlineCompass, AiOutlineHeart, AiOutlineHome, AiOutlineMessage, AiOutlineUser } from "react-icons/ai";

export default function LayoutComponent({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Layout.BottomTab
        tabs={[
          {
            name: "Explore",
            href: "/explore",
            icon: <AiOutlineCompass />,
          },
          {
            name: "Saved",
            href: "/wishlists",
            icon: <AiOutlineHeart />,
          },
          {
            name: "Trips",
            href: "/trips",
            icon: <AiOutlineHome />,
          },
          {
            name: "Inbox",
            href: "/inbox",
            icon: <AiOutlineMessage />,
          },
          {
            name: "Profile",
            href: "/profile",
            icon: <AiOutlineUser />,
          },
        ]}
      />
    </>
  );
}

export const pageConfig = {
  bottomInset: 64,
  safeArea: true,
  cache: true,
  transition: "none",
} satisfies PageConfig;
