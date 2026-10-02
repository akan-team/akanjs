import { usePage } from "@apps/akan/client";
import { Docs, type DocsMenu } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout().render(({ children }) => {
  const { l } = usePage();
  const menuMap: DocsMenu[] = [
    {
      name: l.trans({ en: "CLI Reference", ko: "CLI 레퍼런스" }),
      friend: "cloud",
      subMenus: [
        { name: l.trans({ en: "Commands", ko: "명령어" }), href: "/references/cli/overview", audience: "both" },
        { name: l.trans({ en: "Workspace", ko: "Workspace" }), href: "/references/cli/workspace", audience: "agent" },
        {
          name: l.trans({ en: "Application", ko: "Application" }),
          href: "/references/cli/application",
          audience: "agent",
        },
        { name: l.trans({ en: "Library", ko: "Library" }), href: "/references/cli/library", audience: "agent" },
        { name: l.trans({ en: "Module", ko: "Module" }), href: "/references/cli/module", audience: "agent" },
        { name: l.trans({ en: "Scalar", ko: "Scalar" }), href: "/references/cli/scalar", audience: "agent" },
        { name: l.trans({ en: "Package", ko: "Package" }), href: "/references/cli/package", audience: "agent" },
        { name: l.trans({ en: "Page", ko: "Page" }), href: "/references/cli/page", audience: "agent" },
        { name: l.trans({ en: "Primitive", ko: "Primitive" }), href: "/references/cli/primitive", audience: "agent" },
        { name: l.trans({ en: "Workflow", ko: "Workflow" }), href: "/references/cli/workflow", audience: "agent" },
        { name: l.trans({ en: "Quality", ko: "Quality" }), href: "/references/cli/quality", audience: "agent" },
        // { name: l.trans({ en: "Cloud", ko: "Cloud" }), href: "/references/cli/cloud", audience: "agent" },
        // { name: l.trans({ en: "Tunnel", ko: "Tunnel" }), href: "/references/cli/tunnel", audience: "agent" },
        { name: l.trans({ en: "Context", ko: "Context" }), href: "/references/cli/context", audience: "agent" },
        { name: l.trans({ en: "Agent", ko: "Agent" }), href: "/references/cli/agent", audience: "agent" },
        // { name: l.trans({ en: "Code Agent", ko: "Code Agent" }), href: "/references/cli/code", audience: "agent" },
        { name: l.trans({ en: "Guideline", ko: "Guideline" }), href: "/references/cli/guideline", audience: "agent" },
      ],
    },
    {
      name: l.trans({ en: "AkanJS Reference", ko: "AkanJS 레퍼런스" }),
      friend: "moon",
      subMenus: [
        { name: l.trans({ en: "akanjs/base", ko: "akanjs/base" }), href: "/references/akanjs/base", audience: "agent" },
        {
          name: l.trans({ en: "akanjs/common", ko: "akanjs/common" }),
          href: "/references/akanjs/common",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/constant", ko: "akanjs/constant" }),
          href: "/references/akanjs/constant",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/fetch", ko: "akanjs/fetch" }),
          href: "/references/akanjs/fetch",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/signal", ko: "akanjs/signal" }),
          href: "/references/akanjs/signal",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/server", ko: "akanjs/server" }),
          href: "/references/akanjs/server",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/client", ko: "akanjs/client" }),
          href: "/references/akanjs/client",
          audience: "agent",
        },
        {
          name: l.trans({ en: "akanjs/webkit", ko: "akanjs/webkit" }),
          href: "/references/akanjs/webkit",
          audience: "agent",
        },
      ],
    },
    {
      name: l.trans({ en: "UI Reference", ko: "UI 레퍼런스" }),
      friend: "planet",
      subMenus: [
        { name: l.trans({ en: "Overview", ko: "Overview" }), href: "/references/ui/overview", audience: "agent" },
        { name: l.trans({ en: "Core", ko: "Core" }), href: "/references/ui/core", audience: "agent" },
        { name: l.trans({ en: "Display", ko: "Display" }), href: "/references/ui/display", audience: "agent" },
        { name: l.trans({ en: "Forms", ko: "Forms" }), href: "/references/ui/forms", audience: "agent" },
        { name: l.trans({ en: "Overlays", ko: "Overlays" }), href: "/references/ui/overlays", audience: "agent" },
        { name: l.trans({ en: "System", ko: "System" }), href: "/references/ui/system", audience: "agent" },
        { name: l.trans({ en: "Agent", ko: "Agent" }), href: "/references/ui/agent", audience: "agent" },
        {
          name: l.trans({ en: "Customization", ko: "커스터마이즈" }),
          href: "/references/ui/customize",
          audience: "agent",
        },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
});
