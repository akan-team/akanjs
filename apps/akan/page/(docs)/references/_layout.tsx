import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  const { l } = usePage();
  const menuMap = [
    {
      name: l.trans({ en: "CLI Reference", ko: "CLI 레퍼런스" }),
      subMenus: [
        { name: l.trans({ en: "Commands", ko: "명령어" }), href: "/references/cli/overview" },
        { name: l.trans({ en: "Workspace", ko: "Workspace" }), href: "/references/cli/workspace" },
        { name: l.trans({ en: "Application", ko: "Application" }), href: "/references/cli/application" },
        { name: l.trans({ en: "Library", ko: "Library" }), href: "/references/cli/library" },
        { name: l.trans({ en: "Module", ko: "Module" }), href: "/references/cli/module" },
        { name: l.trans({ en: "Scalar", ko: "Scalar" }), href: "/references/cli/scalar" },
        { name: l.trans({ en: "Package", ko: "Package" }), href: "/references/cli/package" },
        { name: l.trans({ en: "Page", ko: "Page" }), href: "/references/cli/page" },
        { name: l.trans({ en: "Cloud", ko: "Cloud" }), href: "/references/cli/cloud" },
        { name: l.trans({ en: "Context", ko: "Context" }), href: "/references/cli/context" },
        { name: l.trans({ en: "Agent", ko: "Agent" }), href: "/references/cli/agent" },
        { name: l.trans({ en: "Guideline", ko: "Guideline" }), href: "/references/cli/guideline" },
      ],
    },
    {
      name: l.trans({ en: "AkanJS Reference", ko: "AkanJS 레퍼런스" }),
      subMenus: [
        { name: l.trans({ en: "akanjs/base", ko: "akanjs/base" }), href: "/references/akanjs/base" },
        { name: l.trans({ en: "akanjs/common", ko: "akanjs/common" }), href: "/references/akanjs/common" },
        { name: l.trans({ en: "akanjs/constant", ko: "akanjs/constant" }), href: "/references/akanjs/constant" },
        { name: l.trans({ en: "akanjs/fetch", ko: "akanjs/fetch" }), href: "/references/akanjs/fetch" },
        { name: l.trans({ en: "akanjs/signal", ko: "akanjs/signal" }), href: "/references/akanjs/signal" },
        { name: l.trans({ en: "akanjs/server", ko: "akanjs/server" }), href: "/references/akanjs/server" },
        { name: l.trans({ en: "akanjs/client", ko: "akanjs/client" }), href: "/references/akanjs/client" },
        { name: l.trans({ en: "akanjs/webkit", ko: "akanjs/webkit" }), href: "/references/akanjs/webkit" },
      ],
    },
    {
      name: l.trans({ en: "UI Reference", ko: "UI 레퍼런스" }),
      subMenus: [
        { name: l.trans({ en: "Overview", ko: "Overview" }), href: "/references/ui/overview" },
        { name: l.trans({ en: "Core", ko: "Core" }), href: "/references/ui/core" },
        { name: l.trans({ en: "Display", ko: "Display" }), href: "/references/ui/display" },
        { name: l.trans({ en: "Forms", ko: "Forms" }), href: "/references/ui/forms" },
        { name: l.trans({ en: "Overlays", ko: "Overlays" }), href: "/references/ui/overlays" },
        { name: l.trans({ en: "System", ko: "System" }), href: "/references/ui/system" },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
}
