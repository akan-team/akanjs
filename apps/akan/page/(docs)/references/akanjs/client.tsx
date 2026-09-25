import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "router",
      desc: l.trans({
        en: "Client navigation singleton that normalizes Akan language/base-path prefixes before delegating to the active router. Use it from pages, stores, templates, and utilities for push/replace/back/refresh.",
        ko: "Akan language/base-path prefix를 normalize한 뒤 active router에 위임하는 client navigation singleton입니다. page, store, template, utility에서 push/replace/back/refresh에 사용합니다.",
      }),
      code: `import { router } from "akanjs/client";

router.push("/profile");
router.replace("/signin");
router.refresh();`,
    },
    {
      name: "clsx",
      desc: l.trans({
        en: "Re-export of `clsx` for composing class names across Akan UI code. Most view/unit/template components import it from `akanjs/client` to keep UI dependencies consistent.",
        ko: "Akan UI code 전반에서 class name을 조합하기 위한 `clsx` re-export입니다. 대부분의 view/unit/template component는 UI dependency를 일관되게 유지하기 위해 `akanjs/client`에서 import합니다.",
      }),
      code: `import { clsx } from "akanjs/client";

<button className={clsx("btn", active && "btn-primary")} />;`,
    },
    {
      name: "ModelProps / ModelsProps",
      desc: l.trans({
        en: "Common props for generated Unit, Zone, and list UI components. They carry model data, slice metadata, query/init settings, actions, columns, and click handlers.",
        ko: "generated Unit, Zone, list UI component를 위한 공통 props입니다. model data, slice metadata, query/init setting, action, column, click handler를 전달합니다.",
      }),
      code: `import type { ModelProps, ModelsProps } from "akanjs/client";

export function UserUnit({ user, className }: ModelProps<"user", LightUser>) {}
export function UserZone({ slice, init }: ModelsProps<LightUser>) {}`,
    },
    {
      name: "PageConfig / LayoutProps",
      desc: l.trans({
        en: "Route module types for page/layout files. `PageConfig` controls transition, safe area, gesture, and cache behavior, plus `devOnly` to keep the route out of `akan build`, while `LayoutProps` describes layout children and route params.",
        ko: "page/layout 파일을 위한 route module type입니다. `PageConfig`는 transition, safe area, gesture, cache behavior와 함께 `akan build`에서 라우트를 제외하는 `devOnly`를 제어하고, `LayoutProps`는 layout children과 route params를 설명합니다.",
      }),
      code: `import type { LayoutProps, PageConfig } from "akanjs/client";

export const pageConfig: PageConfig = { transition: "bottomUp", safeArea: true };

export default function Layout({ children }: LayoutProps) {
  return children;
}`,
    },
    {
      name: "Font / createFont",
      desc: l.trans({
        en: "Font declaration types and client-side font factory shims. Layout modules use `Font` data so the server build can optimize local font assets while CSR code receives safe no-op shims.",
        ko: "font declaration type과 client-side font factory shim입니다. layout module은 `Font` data를 사용해 server build가 local font asset을 optimize하게 하고, CSR code에는 안전한 no-op shim을 제공합니다.",
      }),
      code: `import type { Font } from "akanjs/client";
import { Noto_Sans_KR } from "akanjs/client";

export const fonts: Font[] = [
  { name: "Noto Sans KR", paths: [{ src: "./font.woff2", weight: 400 }] },
];`,
    },
    {
      name: "usePage / msg / Err",
      desc: l.trans({
        en: "Page dictionary and translation helpers generated from Akan dictionaries. Components use `usePage()` for locale-aware text and `msg`/`Err` for message rendering helpers.",
        ko: "Akan dictionary에서 생성되는 page dictionary와 translation helper입니다. component는 locale-aware text에 `usePage()`를 사용하고 message rendering helper로 `msg`/`Err`를 사용합니다.",
      }),
      code: `import { msg, Err, usePage } from "akanjs/client";

const { l } = usePage();
const label = l.trans({ en: "Save", ko: "저장" });`,
    },
    {
      name: "fetch / sig",
      desc: l.trans({
        en: "Typed client fetch proxy built from registered signal metadata. It exposes generated endpoint and slice methods and keeps JWT state synchronized through auth helpers.",
        ko: "registered signal metadata에서 만들어지는 typed client fetch proxy입니다. generated endpoint와 slice method를 제공하고 auth helper를 통해 JWT state를 동기화합니다.",
      }),
      code: `import { fetch, sig } from "akanjs/client";

const user = await fetch.user(userId);
const signals = sig;`,
    },
    {
      name: "getCookie / setCookie / getAccount",
      desc: l.trans({
        en: "Cookie and account helpers that work across server and client contexts. `getAccount` decodes the JWT only when it belongs to the current app and environment.",
        ko: "server/client context 모두에서 동작하는 cookie 및 account helper입니다. `getAccount`는 JWT가 현재 app과 environment에 속할 때만 decode합니다.",
      }),
      code: `import { getAccount, getCookie, setCookie } from "akanjs/client";

const jwt = getCookie("jwt");
const account = getAccount<{ userId: string }>();
setCookie("theme", "dark");`,
    },
    {
      name: "setAuth / initAuth / resetAuth",
      desc: l.trans({
        en: "Authentication helpers that update FetchClient JWT state, cookies, and client storage together. Stores call these after login/logout so future generated fetch calls include the right token.",
        ko: "FetchClient JWT state, cookie, client storage를 함께 업데이트하는 authentication helper입니다. store는 login/logout 이후 이를 호출해 이후 generated fetch call이 올바른 token을 포함하도록 합니다.",
      }),
      code: `import { initAuth, resetAuth, setAuth } from "akanjs/client";

initAuth();
setAuth({ jwt });
resetAuth();`,
    },
    {
      name: "device",
      desc: l.trans({
        en: "Device singleton for Capacitor/native features such as safe-area values, keyboard listeners, haptics, scroll position, platform info, and language detection.",
        ko: "safe-area value, keyboard listener, haptics, scroll position, platform info, language detection 같은 Capacitor/native feature를 위한 device singleton입니다.",
      }),
      code: `import { device } from "akanjs/client";

await device.vibrate("light");
const scrollTop = device.getScrollTop();`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-client" title="akanjs/client">
        <Docs.Title>akanjs/client</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/client` contains browser/UI-facing helpers: routing, typed fetch access, dictionary hooks, page/layout types, auth/cookie helpers, device utilities, font declarations, and common UI prop types.",
              ko: "`akanjs/client`는 browser/UI-facing helper를 제공합니다. routing, typed fetch access, dictionary hook, page/layout type, auth/cookie helper, device utility, font declaration, common UI prop type에 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
