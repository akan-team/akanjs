import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  const { l } = usePage();
  const menuMap = [
    {
      name: l.trans({ en: "Workspace", ko: "워크스페이스" }),
      subMenus: [
        { name: l.trans({ en: "Structure", ko: "구조" }), href: "/conventions/workspace/structure" },
        { name: l.trans({ en: "Format & Lint", ko: "포맷 & 린트" }), href: "/conventions/workspace/lint" },
      ],
    },
    {
      name: l.trans({ en: "App & Library", ko: "앱 & 라이브러리" }),
      subMenus: [
        {
          name: l.trans({ en: "Assets (public/ private/)", ko: "애셋 (public/ private/)" }),
          href: "/conventions/applib/asset",
        },
        { name: l.trans({ en: "Components (ui/)", ko: "컴포넌트 (ui/)" }), href: "/conventions/applib/ui" },
        {
          name: l.trans({ en: "Server Utils (srvkit/)", ko: "서버 유틸리티 (srvkit/)" }),
          href: "/conventions/applib/srvkit",
        },
        {
          name: l.trans({ en: "Web Utils (webkit/)", ko: "웹 유틸리티 (webkit/)" }),
          href: "/conventions/applib/webkit",
        },
        {
          name: l.trans({ en: "Common Utils (common/)", ko: "공통 유틸리티 (common/)" }),
          href: "/conventions/applib/common",
        },
        {
          name: l.trans({ en: "akan.config.ts", ko: "akan.config.ts" }),
          href: "/conventions/applib/config",
        },
      ],
    },
    {
      name: l.trans({ en: "Domain", ko: "도메인" }),
      subMenus: [
        { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/module/overview" },
        { name: "model.abstract.md", href: "/conventions/module/abstract" },
        { name: "model.constant.ts", href: "/conventions/module/constant" },
        { name: "model.dictionary.ts", href: "/conventions/module/dictionary" },
        { name: "model.document.ts", href: "/conventions/module/document" },
        { name: "model.service.ts", href: "/conventions/module/service" },
        { name: "model.signal.ts", href: "/conventions/module/signal" },
        { name: "model.store.ts", href: "/conventions/module/store" },
        { name: "Model.Template.tsx", href: "/conventions/module/template" },
        { name: "Model.Unit.tsx", href: "/conventions/module/unit" },
        { name: "Model.Util.tsx", href: "/conventions/module/util" },
        { name: "Model.View.tsx", href: "/conventions/module/view" },
        { name: "Model.Zone.tsx", href: "/conventions/module/zone" },
      ],
    },
    {
      name: l.trans({ en: "Scalar", ko: "스칼라" }),
      subMenus: [
        { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/scalar/overview" },
        { name: "scalar.abstract.md", href: "/conventions/scalar/abstract" },
        { name: "scalar.constant.ts", href: "/conventions/scalar/constant" },
        { name: "scalar.dictionary.ts", href: "/conventions/scalar/dictionary" },
        { name: "scalar.document.ts", href: "/conventions/scalar/document" },
        { name: "Scalar.Template.tsx", href: "/conventions/scalar/template" },
        { name: "Scalar.Unit.tsx", href: "/conventions/scalar/unit" },
      ],
    },
    {
      name: l.trans({ en: "Service", ko: "서비스" }),
      subMenus: [
        { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/service/overview" },
        { name: "service.abstract.md", href: "/conventions/service/abstract" },
        { name: "service.dictionary.ts", href: "/conventions/service/dictionary" },
        { name: "service.service.ts", href: "/conventions/service/service" },
        { name: "service.signal.ts", href: "/conventions/service/signal" },
        { name: "service.store.ts", href: "/conventions/service/store" },
        { name: "Service.Util.tsx", href: "/conventions/service/util" },
        { name: "Service.Zone.tsx", href: "/conventions/service/zone" },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
}
