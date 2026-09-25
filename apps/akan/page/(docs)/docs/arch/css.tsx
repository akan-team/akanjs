import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="styling-foundation" title={l.trans({ en: "Styling Foundation", ko: "스타일링 기반" })}>
        <Docs.Title>{l.trans({ en: "Styling Foundation", ko: "스타일링 기반" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan uses Tailwind CSS and DaisyUI as the default styling foundation. Tailwind gives screens a fast utility language for layout, spacing, responsive behavior, and one-off composition. DaisyUI adds semantic component names and theme tokens, so app screens can say primary, base, warning, or error instead of hard-coding every color.",
              ko: "Akan은 Tailwind CSS와 DaisyUI를 기본 스타일링 기반으로 사용합니다. Tailwind는 레이아웃, 간격, 반응형 동작, 일회성 조합을 빠르게 작성할 수 있는 유틸리티 언어를 제공합니다. DaisyUI는 의미 기반 컴포넌트 이름과 테마 토큰을 더해, 앱 화면이 모든 색상을 하드코딩하지 않고 primary, base, warning, error 같은 의도를 표현할 수 있게 합니다.",
            })}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Use Tailwind for structure and layout. Use DaisyUI for theme-aware component vocabulary and semantic colors.",
              ko: "구조와 레이아웃에는 Tailwind를 사용하고, 테마를 인식하는 컴포넌트 표현과 의미 기반 색상에는 DaisyUI를 사용하세요.",
            })}{" "}
            <Link href="https://tailwindcss.com/docs" className="link link-primary" target="_blank" rel="noreferrer">
              Tailwind CSS
            </Link>{" "}
            /{" "}
            <Link href="https://daisyui.com/docs/intro/" className="link link-primary" target="_blank" rel="noreferrer">
              DaisyUI
            </Link>
          </Docs.Alert>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="mb-2 font-bold text-base-content">
              {l.trans({ en: "How the layers work together", ko: "레이어가 함께 동작하는 방식" })}
            </div>
            <div className="space-y-1">
              {[
                {
                  title: "styles.css",
                  desc: l.trans({
                    en: "Imports Tailwind, Akan UI styles, DaisyUI, and app theme tokens.",
                    ko: "Tailwind, Akan UI style, DaisyUI, 앱 테마 토큰을 import합니다.",
                  }),
                },
                {
                  title: "Theme tokens",
                  desc: l.trans({
                    en: "Turns brand decisions into reusable names such as primary, base, warning, and error.",
                    ko: "브랜드 결정을 primary, base, warning, error 같은 재사용 가능한 이름으로 바꿉니다.",
                  }),
                },
                {
                  title: "Components",
                  desc: l.trans({
                    en: "Use those names through btn, input, card, alert, and Tailwind utility classes.",
                    ko: "btn, input, card, alert, Tailwind utility class를 통해 그 이름들을 사용합니다.",
                  }),
                },
                {
                  title: "Screens",
                  desc: l.trans({
                    en: "Assemble consistent business screens without repeating raw color and spacing rules.",
                    ko: "raw color와 spacing rule을 반복하지 않고 일관된 비즈니스 화면을 조립합니다.",
                  }),
                },
              ].map(({ title, desc }, idx) => (
                <div key={idx} className="flex gap-3 rounded-lg bg-base-200 px-4 py-2">
                  <div>
                    <span className="font-mono font-semibold text-primary">{title}: </span>
                    <span className="text-base-content/70 text-sm">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="design-system-first"
        title={l.trans({ en: "Design System First", ko: "디자인 시스템을 먼저 설계" })}
      >
        <Docs.Title>{l.trans({ en: "Design System First", ko: "디자인 시스템을 먼저 설계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Do not design every page from scratch. Define the app's basic component style first, then let pages assemble those components. Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should share the same spacing, radius, text color, border, and state behavior.",
              ko: "모든 페이지를 처음부터 따로 디자인하지 마세요. 앱의 기본 컴포넌트 스타일을 먼저 정의하고, 페이지는 그 컴포넌트를 조립하도록 만드세요. 버튼, input, card, form, alert, tab, modal, navigation은 같은 간격, radius, 텍스트 색, border, 상태 동작을 공유해야 합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should use shared classes.",
                ko: "button, input, card, form, alert, tab, modal, navigation은 공유 클래스를 사용해야 합니다.",
              }),
              l.trans({
                en: "Business pages should assemble the design system instead of redefining colors and spacing.",
                ko: "비즈니스 페이지는 색상과 간격을 다시 정의하기보다 디자인 시스템을 조립해야 합니다.",
              }),
              l.trans({
                en: "Imported modules feel consistent when they use the same Tailwind and DaisyUI tokens.",
                ko: "가져온 모듈도 같은 Tailwind와 DaisyUI 토큰을 사용하면 일관되게 보입니다.",
              }),
            ].map((desc) => (
              <div
                key={desc}
                className="rounded-xl border border-base-300 bg-base-100 px-4 py-2 text-base-content/70 text-sm"
              >
                {desc}
              </div>
            ))}
          </div>
          <Code.Snippet
            language="typescript"
            code={`<div className="space-y-3 rounded-xl bg-base-100 p-4 text-base-content">
  <button className="btn btn-primary">Save</button>
  <input className="input input-bordered w-full" placeholder="Product name" />
  <div className="card border border-base-300 bg-base-100 p-4">
    Product summary
  </div>
  <div className="alert alert-info">Stock updated successfully.</div>
</div>`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="theme-system" title={l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}>
        <Docs.Title>{l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Theme and color are declared from the app style entry. The app imports Tailwind, Akan UI styles, enables DaisyUI, then declares one or more DaisyUI themes. Each theme maps semantic names to real colors.",
              ko: "테마와 색상은 앱 스타일 진입점에서 선언합니다. 앱은 Tailwind와 Akan UI 스타일을 import하고 DaisyUI를 활성화한 뒤, 하나 이상의 DaisyUI theme을 선언합니다. 각 theme은 의미 기반 이름을 실제 색상에 매핑합니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/page/akanjs/styles.css"
            code={`@import "tailwindcss";
@import "akanjs/ui/styles.css";

@plugin "daisyui" {
  logs: false;
  exclude: properties;
}

@plugin "daisyui/theme" {
  name: "light";
  --color-primary: #c33c32;
  --color-base-content: #2c3e50;
  --color-base-100: #fafafa;
  --color-base-200: #f5f5f5;
}

@plugin "daisyui/theme" {
  name: "dark";
  default: true;
  --color-primary: #ff493b;
  --color-base-content: #ffffff;
  --color-base-100: #1a1a1a;
  --color-base-200: #2a2a2a;
}`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "DaisyUI supports multiple theme blocks, so one app can define light, dark, brand, admin, or demo themes with the same component classes.",
              ko: "DaisyUI는 여러 theme block을 지원하므로, 하나의 앱에서도 같은 컴포넌트 클래스를 유지한 채 light, dark, brand, admin, demo 테마를 선언할 수 있습니다.",
            })}{" "}
            <Link
              href="https://daisyui.com/docs/themes/"
              className="link link-primary"
              target="_blank"
              rel="noreferrer"
            >
              {l.trans({ en: "DaisyUI Theme Docs", ko: "DaisyUI 테마 문서" })}
            </Link>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="font-declaration" title={l.trans({ en: "Font Declaration", ko: "폰트 선언 방식" })}>
        <Docs.Title>{l.trans({ en: "Font Declaration", ko: "폰트 선언 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Fonts are declared from the root layout. Export a fonts array with a font name, file paths, weights, and an optional default flag. Akan then exposes those fonts as Tailwind-like classes, so components can use className values such as font-pretendard or font-lemonmilk.",
              ko: "폰트는 루트 레이아웃에서 선언합니다. font name, file path, weight, optional default 값을 가진 fonts 배열을 export하면, Akan은 이를 Tailwind와 유사한 클래스처럼 노출합니다. 컴포넌트는 font-pretendard, font-lemonmilk 같은 className으로 폰트를 사용할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/page/akanjs/_layout.tsx"
            language="typescript"
            code={`import type { Font } from "akanjs/client";

export const fonts: Font[] = [
  {
    name: "pretendard",
    default: true,
    paths: [
      { src: "/libs/shared/fonts/Pretendard-Regular.woff2", weight: 400 },
      { src: "/libs/shared/fonts/Pretendard-SemiBold.woff2", weight: 600 },
      { src: "/libs/shared/fonts/Pretendard-Bold.woff2", weight: 700 },
    ],
  },
];`}
          />
          <Code.Snippet
            title="Using font classes"
            language="typescript"
            code={`<span className="font-pretendard text-base-content">
  Styled with Pretendard
</span>

<span className="font-lemonmilk text-primary">
  Brand logo styled with Lemon Milk
</span>`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
