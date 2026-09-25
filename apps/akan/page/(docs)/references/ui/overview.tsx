import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  const pages = [
    {
      title: l.trans({ en: "Core", ko: "Core" }),
      href: "/references/ui/core",
      components: "Link, Image, Layout, Load, Model",
      desc: l.trans({
        en: "The most common page-building primitives for routing, media, page shells, data loading, and model workflows.",
        ko: "routing, media, page shell, data loading, model workflow에 가장 자주 쓰이는 핵심 primitive입니다.",
      }),
    },
    {
      title: l.trans({ en: "Display", ko: "Display" }),
      href: "/references/ui/display",
      components: "Data, RecentTime, Loading, Empty, Table, Pagination",
      desc: l.trans({
        en: "Display and feedback helpers for model lists, relative time labels, loading states, empty states, and tabular UI.",
        ko: "model list, relative time label, loading state, empty state, table UI를 위한 표시/피드백 helper입니다.",
      }),
    },
    {
      title: l.trans({ en: "Forms", ko: "Forms" }),
      href: "/references/ui/forms",
      components: "Field, Input, Select, Button",
      desc: l.trans({
        en: "Form controls and action primitives used by templates, filters, and admin surfaces.",
        ko: "template, filter, admin surface에서 사용하는 form control과 action primitive입니다.",
      }),
    },
    {
      title: l.trans({ en: "Overlays", ko: "Overlays" }),
      href: "/references/ui/overlays",
      components: "Modal, Dialog, Popconfirm, Dropdown, Copy",
      desc: l.trans({
        en: "Overlay, confirmation, menu, and copy helpers for focused user actions.",
        ko: "집중된 사용자 action을 위한 overlay, confirmation, menu, copy helper입니다.",
      }),
    },
    {
      title: l.trans({ en: "System", ko: "System" }),
      href: "/references/ui/system",
      components: "System, ClientSide, Signal, Tab, animated",
      desc: l.trans({
        en: "Application shell helpers, CSR guards, admin signal tools, tab state, and animation wrappers.",
        ko: "application shell helper, CSR guard, admin signal tool, tab state, animation wrapper입니다.",
      }),
    },
    {
      title: l.trans({ en: "Customization", ko: "커스터마이즈" }),
      href: "/references/ui/customize",
      components: "_overrides.tsx, override()",
      desc: l.trans({
        en: "Re-skin any framework component per route with a `page/**/_overrides.tsx` manifest — drop-in replacements, no call-site changes.",
        ko: "`page/**/_overrides.tsx` manifest로 framework 컴포넌트를 route 단위로 re-skin합니다 — drop-in 교체, call-site 변경 없음.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-ui" title="akanjs/ui">
        <Docs.Title>akanjs/ui</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/ui` is the shared UI facet for Akan apps. It provides route-aware links, data loading wrappers, model UI shells, form controls, display helpers, overlays, and system-level app chrome.",
              ko: "`akanjs/ui`는 Akan app을 위한 shared UI facet입니다. route-aware link, data loading wrapper, model UI shell, form control, display helper, overlay, system-level app chrome을 제공합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This reference is organized by actual app/lib usage frequency. Common components get full pages first; rarely used exports are deferred until they become part of normal application patterns.",
              ko: "이 reference는 실제 app/lib 사용 빈도를 기준으로 편성했습니다. 자주 쓰이는 컴포넌트를 먼저 문서화하고, 거의 쓰이지 않는 export는 일반 application pattern에 들어올 때까지 보류합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="page-map" title={l.trans({ en: "Page Map", ko: "페이지 맵" })}>
        <Docs.Title>{l.trans({ en: "Page Map", ko: "페이지 맵" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Open the page that matches the UI layer you are working on. Each detail page uses one `Scroll.Slide` per component with usage examples and props notes.",
              ko: "작업 중인 UI layer에 맞는 페이지를 여세요. 각 상세 페이지는 컴포넌트마다 하나의 `Scroll.Slide`를 사용하고 사용 예시와 props note를 제공합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          {pages.map(({ title, href, components, desc }) => (
            <Link
              key={title}
              href={href}
              className="rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary"
            >
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-1 font-mono text-base-content/70">{components}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </Link>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
