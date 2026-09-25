import { usePage } from "@apps/akan/client";
import { Docs, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "System",
      desc: l.trans({
        en: "System namespace for app-level chrome and runtime helpers. It chooses CSR or SSR provider by render mode and exposes theme/language/reconnect/dev-mode helpers.",
        ko: "app-level chrome과 runtime helper를 위한 System namespace입니다. render mode에 따라 CSR 또는 SSR provider를 선택하고 theme/language/reconnect/dev-mode helper를 제공합니다.",
      }),
      props: [
        {
          name: "System.ThemeToggle",
          type: "component",
          desc: l.trans({ en: "Theme switching control.", ko: "theme switching control입니다." }),
        },
        {
          name: "System.SelectLanguage",
          type: "component",
          desc: l.trans({ en: "Language selector.", ko: "language selector입니다." }),
        },
        {
          name: "System.Reconnect",
          type: "component",
          desc: l.trans({
            en: "Reconnect helper for local or unstable sessions.",
            ko: "local 또는 unstable session을 위한 reconnect helper입니다.",
          }),
        },
      ],
      code: `<System.SelectLanguage languages={["en", "ko"]} />
<System.ThemeToggle themes={["light", "dark"]} />`,
    },
    {
      name: "ClientSide",
      desc: l.trans({
        en: "Small Suspense boundary for content that should be rendered client-side with an optional fallback.",
        ko: "client-side에서 렌더링해야 하는 content를 optional fallback과 함께 감싸는 작은 Suspense boundary입니다.",
      }),
      props: [
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "Client-side content.", ko: "client-side content입니다." }),
        },
        {
          name: "loading",
          type: "ReactNode",
          desc: l.trans({ en: "Suspense fallback.", ko: "Suspense fallback입니다." }),
        },
      ],
      code: `import { ClientSide } from "akanjs/ui";

export const BrowserOnlyPanel = () => (
  <ClientSide loading={<div>Loading...</div>}>
    <MapPanel />
  </ClientSide>
);`,
    },
    {
      name: "Signal",
      desc: l.trans({
        en: "Admin and developer-facing signal inspection namespace. It renders API/signal documents, arguments, listeners, WebSocket/PubSub views, and message payloads.",
        ko: "admin 및 developer-facing signal inspection namespace입니다. API/signal document, argument, listener, WebSocket/PubSub view, message payload를 렌더링합니다.",
      }),
      props: [
        {
          name: "Signal.Doc",
          type: "component",
          desc: l.trans({
            en: "Documentation viewer for signal definitions.",
            ko: "signal definition을 위한 documentation viewer입니다.",
          }),
        },
        {
          name: "Signal.RestApi",
          type: "component",
          desc: l.trans({
            en: "REST API signal view/test surface.",
            ko: "REST API signal view/test surface입니다.",
          }),
        },
        {
          name: "Signal.WebSocket / PubSub",
          type: "components",
          desc: l.trans({ en: "Realtime signal surfaces.", ko: "realtime signal surface입니다." }),
        },
        {
          name: "Signal.Arg / Object / Message",
          type: "components",
          desc: l.trans({ en: "Payload and argument renderers.", ko: "payload와 argument renderer입니다." }),
        },
      ],
      code: `import { Signal } from "akanjs/ui";

export const AdminSignals = ({ signal }) => (
  <div className="space-y-4">
    <Signal.Doc signal={signal} />
    <Signal.RestApi signal={signal} />
  </div>
);`,
    },
    {
      name: "Tab",
      desc: l.trans({
        en: "Compound tab state namespace. It provides a provider plus menu and panel components that share active menu state through context.",
        ko: "compound tab state namespace입니다. context를 통해 active menu state를 공유하는 provider, menu, panel component를 제공합니다.",
      }),
      props: [
        {
          name: "Tab",
          type: "{ defaultMenu?, className?, children? }",
          desc: l.trans({ en: "Provider/root for tab state.", ko: "tab state를 위한 provider/root입니다." }),
        },
        {
          name: "Tab.Menus",
          type: "component",
          desc: l.trans({ en: "Container for tab menu items.", ko: "tab menu item을 담는 container입니다." }),
        },
        {
          name: "Tab.Menu",
          type: "component",
          desc: l.trans({ en: "Selectable menu item.", ko: "선택 가능한 menu item입니다." }),
        },
        {
          name: "Tab.Panel",
          type: "component",
          desc: l.trans({
            en: "Content visible for a matching menu key.",
            ko: "일치하는 menu key에서 보이는 content입니다.",
          }),
        },
      ],
      code: `import { Tab } from "akanjs/ui";

<Tab defaultMenu="info">
  <Tab.Menus>
    <Tab.Menu value="info">Info</Tab.Menu>
    <Tab.Menu value="history">History</Tab.Menu>
  </Tab.Menus>
  <Tab.Panel value="info">Product info</Tab.Panel>
  <Tab.Panel value="history">Change history</Tab.Panel>
</Tab>;`,
    },
    {
      name: "animated",
      desc: l.trans({
        en: "Small re-export of react-spring animated primitives used by Akan UI components and custom animated surfaces.",
        ko: "Akan UI component와 custom animated surface에서 사용하는 react-spring animated primitive의 작은 re-export입니다.",
      }),
      props: [
        {
          name: "animated.div",
          type: "react-spring animated div",
          desc: l.trans({ en: "Animated div primitive.", ko: "animated div primitive입니다." }),
        },
        {
          name: "animated.g",
          type: "react-spring animated g",
          desc: l.trans({ en: "Animated SVG group primitive.", ko: "animated SVG group primitive입니다." }),
        },
        {
          name: "animated.progress",
          type: "react-spring animated progress",
          desc: l.trans({ en: "Animated progress element.", ko: "animated progress element입니다." }),
        },
      ],
      code: `import { animated } from "akanjs/ui";
import { useSpring } from "@react-spring/web";

export const FadeIn = ({ children }) => {
  const style = useSpring({ opacity: 1, from: { opacity: 0 } });
  return <animated.div style={style}>{children}</animated.div>;
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="system-ui" title={l.trans({ en: "System UI", ko: "System UI" })}>
        <Docs.Title>{l.trans({ en: "System UI", ko: "System UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "System UI components are app-shell and admin helpers, not normal feature widgets. Use them in root layouts, admin pages, signal dashboards, tabbed detail views, and animation-heavy UI.",
              ko: "System UI component는 일반 feature widget이 아니라 app-shell 및 admin helper입니다. root layout, admin page, signal dashboard, tabbed detail view, animation-heavy UI에서 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
