import { usePage } from "@apps/akan/client";
import { Docs, type DocsMenu, JellyLoader } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout()
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(({ children }) => {
    const { l } = usePage();
    const menuMap: DocsMenu[] = [
      {
        name: l.trans({ en: "Workspace", ko: "워크스페이스" }),
        subMenus: [
          {
            name: l.trans({ en: "Structure", ko: "구조" }),
            href: "/conventions/workspace/structure",
            audience: "both",
          },
          {
            name: l.trans({ en: "Format & Lint", ko: "포맷 & 린트" }),
            href: "/conventions/workspace/lint",
            audience: "agent",
          },
        ],
      },
      {
        name: l.trans({ en: "App & Library", ko: "앱 & 라이브러리" }),
        subMenus: [
          {
            name: l.trans({ en: "Assets (public/ private/)", ko: "애셋 (public/ private/)" }),
            href: "/conventions/applib/asset",
            audience: "agent",
          },
          {
            name: l.trans({ en: "Components (ui/)", ko: "컴포넌트 (ui/)" }),
            href: "/conventions/applib/ui",
            audience: "agent",
          },
          {
            name: l.trans({ en: "Server Utils (srvkit/)", ko: "서버 유틸리티 (srvkit/)" }),
            href: "/conventions/applib/srvkit",
            audience: "agent",
          },
          {
            name: l.trans({ en: "Web Utils (webkit/)", ko: "웹 유틸리티 (webkit/)" }),
            href: "/conventions/applib/webkit",
            audience: "agent",
          },
          {
            name: l.trans({ en: "Common Utils (common/)", ko: "공통 유틸리티 (common/)" }),
            href: "/conventions/applib/common",
            audience: "agent",
          },
          {
            name: l.trans({ en: "akan.config.ts", ko: "akan.config.ts" }),
            href: "/conventions/applib/config",
            audience: "agent",
          },
        ],
      },
      {
        name: l.trans({ en: "Domain", ko: "도메인" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/module/overview", audience: "both" },
          { name: "model.abstract.md", href: "/conventions/module/abstract", audience: "human" },
          { name: "model.constant.ts", href: "/conventions/module/constant", audience: "human" },
          { name: "model.dictionary.ts", href: "/conventions/module/dictionary", audience: "agent" },
          { name: "model.document.ts", href: "/conventions/module/document", audience: "human" },
          { name: "model.service.ts", href: "/conventions/module/service", audience: "human" },
          { name: "model.signal.ts", href: "/conventions/module/signal", audience: "both" },
          { name: "model.store.ts", href: "/conventions/module/store", audience: "agent" },
          { name: "Model.Template.tsx", href: "/conventions/module/template", audience: "agent" },
          { name: "Model.Unit.tsx", href: "/conventions/module/unit", audience: "agent" },
          { name: "Model.Util.tsx", href: "/conventions/module/util", audience: "agent" },
          { name: "Model.View.tsx", href: "/conventions/module/view", audience: "agent" },
          { name: "Model.Zone.tsx", href: "/conventions/module/zone", audience: "agent" },
        ],
      },
      {
        name: l.trans({ en: "Scalar", ko: "스칼라" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/scalar/overview", audience: "both" },
          { name: "scalar.abstract.md", href: "/conventions/scalar/abstract", audience: "human" },
          { name: "scalar.constant.ts", href: "/conventions/scalar/constant", audience: "human" },
          { name: "scalar.dictionary.ts", href: "/conventions/scalar/dictionary", audience: "agent" },
          { name: "scalar.document.ts", href: "/conventions/scalar/document", audience: "human" },
          { name: "Scalar.Template.tsx", href: "/conventions/scalar/template", audience: "agent" },
          { name: "Scalar.Unit.tsx", href: "/conventions/scalar/unit", audience: "agent" },
        ],
      },
      {
        name: l.trans({ en: "Service", ko: "서비스" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/conventions/service/overview", audience: "both" },
          { name: "service.abstract.md", href: "/conventions/service/abstract", audience: "human" },
          { name: "service.dictionary.ts", href: "/conventions/service/dictionary", audience: "agent" },
          { name: "service.service.ts", href: "/conventions/service/service", audience: "human" },
          { name: "service.signal.ts", href: "/conventions/service/signal", audience: "both" },
          { name: "service.store.ts", href: "/conventions/service/store", audience: "agent" },
          { name: "Service.Util.tsx", href: "/conventions/service/util", audience: "agent" },
          { name: "Service.Zone.tsx", href: "/conventions/service/zone", audience: "agent" },
        ],
      },
    ];
    return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
  });
