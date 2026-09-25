import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
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
              en: "Akan uses Tailwind CSS with a semantic design-token layer and the akanjs/ui primitives as the default styling foundation. Tailwind gives screens a fast utility language for layout, spacing, responsive behavior, and one-off composition. The token layer + primitives add semantic names, so app screens can say primary, background, warning, or destructive instead of hard-coding every color.",
              ko: "Akan은 Tailwind CSS와 시맨틱 디자인 토큰 계층, 그리고 akanjs/ui 프리미티브를 기본 스타일링 기반으로 사용합니다. Tailwind는 레이아웃, 간격, 반응형 동작, 일회성 조합을 빠르게 작성할 수 있는 유틸리티 언어를 제공합니다. 토큰 계층 + 프리미티브는 의미 기반 이름을 더해, 앱 화면이 모든 색상을 하드코딩하지 않고 primary, background, warning, destructive 같은 의도를 표현할 수 있게 합니다.",
            })}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Use Tailwind for structure and layout. Use akanjs/ui primitives (Button, Badge, Input, Field …) and semantic tokens for theme-aware components and colors.",
              ko: "구조와 레이아웃에는 Tailwind를 사용하고, 테마를 인식하는 컴포넌트와 색상에는 akanjs/ui 프리미티브(Button, Badge, Input, Field …)와 시맨틱 토큰을 사용하세요.",
            })}{" "}
            <Link
              href="https://tailwindcss.com/docs"
              className="text-primary underline underline-offset-4 hover:no-underline"
              target="_blank"
              rel="noreferrer"
            >
              Tailwind CSS
            </Link>
          </Docs.Alert>
          <div className={panelRecipe()}>
            <div className="mb-2 font-bold text-foreground">
              {l.trans({ en: "How the layers work together", ko: "레이어가 함께 동작하는 방식" })}
            </div>
            <div className="space-y-1">
              {[
                {
                  title: "styles.css",
                  desc: l.trans({
                    en: "Imports Tailwind, Akan UI styles, and the semantic design-token layer.",
                    ko: "Tailwind, Akan UI style, 시맨틱 디자인 토큰 계층을 import합니다.",
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
                    en: "Use those names through akanjs/ui primitives (Button, Input, Badge) and Tailwind utility classes.",
                    ko: "akanjs/ui 프리미티브(Button, Input, Badge)와 Tailwind utility class를 통해 그 이름들을 사용합니다.",
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
                <div key={idx} className="flex gap-3 rounded-lg bg-muted px-4 py-2">
                  <div>
                    <span className="font-mono font-semibold text-primary">{title}: </span>
                    <span className="text-foreground/70 text-sm">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

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
                en: "Imported modules feel consistent when they use the same Tailwind and semantic design tokens.",
                ko: "가져온 모듈도 같은 Tailwind와 시맨틱 디자인 토큰을 사용하면 일관되게 보입니다.",
              }),
            ].map((desc) => (
              <div key={desc} className={panelRecipe({ padding: "none" }, "px-4 py-2 text-foreground/70 text-sm")}>
                {desc}
              </div>
            ))}
          </div>
          <Code.Snippet
            className="w-full"
            language="typescript"
            code={`<div className="space-y-3 rounded-xl bg-background p-4 text-foreground">
  <button className={buttonRecipe({ variant: "primary" })}>Save</button>
  <input className="h-10 w-full rounded-field border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none" placeholder="Product name" />
  <div className="rounded-box border border-border bg-card p-4">
    Product summary
  </div>
  <div className="flex items-center gap-2 rounded-box border border-info/30 bg-info/10 p-4">Stock updated successfully.</div>
</div>`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="theme-system" title={l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}>
        <Docs.Title>{l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Theme and color are declared from the app style entry. The app imports Tailwind and Akan UI styles, defines raw CSS variables per theme under :root / [data-theme], then maps them to Tailwind color names with @theme inline. Switching themes is just toggling the data-theme attribute.",
              ko: "테마와 색상은 앱 스타일 진입점에서 선언합니다. Tailwind와 Akan UI 스타일을 import하고, :root / [data-theme] 아래에 테마별 원시 CSS 변수를 정의한 뒤 @theme inline으로 Tailwind 색상 이름에 매핑합니다. 테마 전환은 data-theme 속성만 바꾸면 됩니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/styles.css"
            code={`@import "tailwindcss";
@import "akanjs/ui/styles.css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root,
[data-theme="dark"] {
  --background: #1a1a1a;
  --foreground: #ffffff;
  --primary: #ff493b;
  --primary-foreground: #ffffff;
  --muted: #2a2a2a;
  --border: #3a3a3a;
}

[data-theme="light"] {
  --background: #fafafa;
  --foreground: #2c3e50;
  --primary: #c33c32;
  --primary-foreground: #ffffff;
  --muted: #f5f5f5;
  --border: #e5e5e5;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-border: var(--border);
}`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Because @theme inline references var(), the same class (bg-primary, text-foreground …) resolves to different colors per data-theme — so one app can define light, dark, brand, or admin themes without changing any component class.",
              ko: "@theme inline이 var()를 참조하므로, 같은 클래스(bg-primary, text-foreground …)가 data-theme에 따라 다른 색으로 해석됩니다. 컴포넌트 클래스를 바꾸지 않고도 light, dark, brand, admin 테마를 정의할 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="lib-tokens" title={l.trans({ en: "Lib-Owned Tokens", ko: "라이브러리 소유 토큰" })}>
        <Docs.Title>{l.trans({ en: "Lib-Owned Tokens", ko: "라이브러리 소유 토큰" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A lib whose components need fixed colors — a vendor sign-in button, a brand mark — declares them once in libs/<lib>/ui/tokens.css. Every app whose pages reach that lib compiles the file automatically, ahead of its own stylesheets, so the app stays the last word on any variable both declare. Nothing is imported by hand, and adding an app cannot forget it.",
              ko: "벤더 로그인 버튼이나 브랜드 마크처럼 고정 색상이 필요한 라이브러리는 libs/<lib>/ui/tokens.css 에 한 번만 선언합니다. 해당 라이브러리에 도달하는 앱은 이 파일을 자동으로, 자신의 스타일시트보다 먼저 컴파일하므로 같은 변수를 선언했다면 앱이 최종 승자입니다. 손으로 import 할 것이 없고, 앱을 추가하며 빠뜨릴 수도 없습니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/social/ui/tokens.css"
            code={`:root {
  --kakao: #fee500;
  --kakao-foreground: #3c1e1e;
  --naver: #1ec800;
}`}
          />
          <Code.Snippet
            className="w-full"
            title="libs/social/ui/KakaoButton.tsx"
            language="typescript"
            code={`<button className="bg-[var(--kakao)] text-[var(--kakao-foreground)]">Kakao</button>`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "These are plain custom properties, not a Tailwind @theme extension: the color vocabulary is closed per stylesheet, so bg-kakao would generate no CSS. Reference them as bg-[var(--kakao)], which the color lint rules allow by design. An @import the pipeline cannot resolve fails the build rather than compiling to nothing.",
              ko: "이것은 Tailwind @theme 확장이 아니라 순수 custom property 입니다. 색 어휘는 스타일시트 단위로 폐쇄되므로 bg-kakao 는 CSS 를 생성하지 않습니다. bg-[var(--kakao)] 로 참조하세요 — 색상 lint 규칙이 의도적으로 허용하는 형태입니다. 해석할 수 없는 @import 는 조용히 사라지지 않고 빌드를 실패시킵니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

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
            className="w-full"
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
            className="w-full"
            title="Using font classes"
            language="typescript"
            code={`<span className="font-pretendard text-foreground">
  Styled with Pretendard
</span>

<span className="font-lemonmilk text-primary">
  Brand logo styled with Lemon Milk
</span>`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
}
