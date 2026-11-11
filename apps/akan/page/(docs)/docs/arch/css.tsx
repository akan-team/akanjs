import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page()
  .config({ transition: "fade", rscPatchHeadSafe: true })
  .head(({ lang }) => {
    const title = lang === "ko" ? "아키텍처: CSS와 스타일링 | Akan.js" : "Architecture: CSS And Styling | Akan.js";
    const description =
      lang === "ko"
        ? "디자인 시스템과 테마 토큰 값, 라이브러리가 소유한 토큰, 폰트 선언."
        : "The design system, theme token values, library-owned tokens and font declaration.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const termRows = [
      {
        name: "semantic token",
        desc: l.trans({
          en: "A color named for its role (primary, background, destructive) instead of its value.",
          ko: "값이 아니라 역할로 이름 붙인 색입니다. primary, background, destructive 같은 이름입니다.",
        }),
      },
      {
        name: "theme",
        desc: l.trans({
          en: "One set of values for every token. The data-theme attribute picks which set applies.",
          ko: "모든 토큰에 대한 값 한 벌입니다. data-theme 속성이 어느 벌을 쓸지 고릅니다.",
        }),
      },
      {
        name: "primitive",
        desc: l.trans({
          en: "A ready-made akanjs/ui component (Button, Input, Badge, Field) that already uses the tokens.",
          ko: "이미 토큰을 쓰도록 만들어진 akanjs/ui 컴포넌트입니다. Button, Input, Badge, Field 같은 것입니다.",
        }),
      },
      {
        name: "custom property",
        desc: l.trans({
          en: "A CSS variable such as --primary. Tokens are custom properties underneath.",
          ko: "--primary 같은 CSS 변수입니다. 토큰의 실체는 custom property입니다.",
        }),
      },
    ];

    const layerRows = [
      {
        name: "tokens",
        desc: l.trans({
          en: "Brand decisions turned into names such as primary, background, warning and destructive.",
          ko: "브랜드 결정을 primary, background, warning, destructive 같은 이름으로 바꾼 것입니다.",
        }),
      },
      {
        name: "recipes",
        desc: l.trans({
          en: "Functions that compose token classes into one named look, such as buttonRecipe.",
          ko: "토큰 클래스를 조합해 이름 붙인 모양 하나로 만드는 함수입니다. buttonRecipe가 그 예입니다.",
        }),
      },
      {
        name: "components",
        desc: l.trans({
          en: "akanjs/ui primitives (Button, Input, Badge) and Tailwind utilities that use those names.",
          ko: "그 이름들을 쓰는 akanjs/ui 프리미티브(Button, Input, Badge)와 Tailwind utility class입니다.",
        }),
      },
      {
        name: "screens",
        desc: l.trans({
          en: "Business screens assembled from components, without repeating raw color and spacing rules.",
          ko: "raw color와 spacing 규칙을 반복하지 않고, 컴포넌트를 조립해 만든 비즈니스 화면입니다.",
        }),
      },
    ];

    const fontFieldRows = [
      {
        name: "name",
        desc: l.trans({
          en: "The font's name. It becomes the class font-<name>, such as font-pretendard.",
          ko: "폰트 이름입니다. font-<name> 클래스가 됩니다. 예: font-pretendard.",
        }),
      },
      {
        name: "paths",
        desc: l.trans({
          en: "One entry per font file: its src and the weight it covers.",
          ko: "폰트 파일마다 항목 하나입니다. 파일 경로(src)와 그 파일이 맡는 weight를 적습니다.",
        }),
      },
      {
        name: "default",
        desc: l.trans({
          en: "The font the whole app uses when no font class is set. Only one font can be the default.",
          ko: "폰트 클래스를 따로 주지 않았을 때 앱 전체가 쓰는 폰트입니다. 기본 폰트는 하나만 둘 수 있습니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="styling-foundation" title={l.trans({ en: "Styling Foundation", ko: "스타일링 기반" })}>
          <Docs.Title>{l.trans({ en: "Styling Foundation", ko: "스타일링 기반" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "When every screen writes its own colors (#ff493b here, a red utility class there), changing the brand or adding a dark theme means hunting down each one. Akan avoids that by naming colors for what they are for, and letting every screen use the names.",
                ko: "화면마다 색을 직접 적으면(여기는 #ff493b, 저기는 빨간 utility class), 브랜드를 바꾸거나 다크 테마를 더할 때 하나하나 찾아 고쳐야 합니다. Akan은 색에 용도로 이름을 붙이고, 모든 화면이 그 이름을 쓰게 해서 이 문제를 피합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Akan uses Tailwind CSS with a semantic design-token layer and the akanjs/ui primitives as the default styling foundation. So app screens say primary, background, warning or destructive instead of hard-coding every color. The two halves split the work like this:",
                ko: "Akan은 Tailwind CSS와 시맨틱 디자인 토큰 계층, 그리고 akanjs/ui 프리미티브를 기본 스타일링 기반으로 사용합니다. 그래서 앱 화면은 모든 색을 하드코딩하지 않고 primary, background, warning, destructive 같은 의도로 말합니다. 두 도구는 일을 이렇게 나눕니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">Tailwind CSS</div>
                <div className="mb-2 text-foreground/50 text-xs">
                  {l.trans({ en: "Structure and layout", ko: "구조와 레이아웃" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "A fast utility language for layout, spacing, responsive behavior and one-off composition.",
                    ko: "레이아웃, 간격, 반응형 동작, 일회성 조합을 빠르게 적는 utility 언어입니다.",
                  })}{" "}
                  <Link
                    href="https://tailwindcss.com/docs"
                    className="text-primary underline underline-offset-4 hover:no-underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tailwind CSS
                  </Link>
                </div>
                <code className={chip}>flex gap-4 p-4 md:grid-cols-2</code>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Tokens + akanjs/ui", ko: "토큰 + akanjs/ui" })}
                </div>
                <div className="mb-2 text-foreground/50 text-xs">
                  {l.trans({ en: "Theme-aware colors and components", ko: "테마를 따라가는 색과 컴포넌트" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Semantic color names and primitives (Button, Badge, Input, Field …) that follow the theme.",
                    ko: "테마를 따라가는 의미 기반 색 이름과 프리미티브(Button, Badge, Input, Field …)입니다.",
                  })}
                </div>
                <code className={chip}>bg-primary text-foreground {"<Button>"}</code>
              </div>
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "How the layers work together", ko: "레이어가 함께 동작하는 방식" })}
            </Docs.SubSubTitle>
            <Docs.Figure
              title={l.trans({
                en: "Four layers, each built from the one below",
                ko: "아래 계층을 딛고 올라가는 네 계층",
              })}
              image="style-layers"
              prompt={`
              Four wide flat slabs stacked on top of each other like a layered cake, centred, with a small gap
              between each slab. Each slab carries its label written inside it; from the bottom up the labels are
              "Tokens", "Recipes", "Components" and "Screens". The bottom slab labelled "Tokens" is traced as the
              red accent. One thin black upward arrow runs along the right side of the stack from the bottom slab
              to the top slab. Nothing else.
            `}
              alt={l.trans({
                en: "From the bottom up: semantic tokens, recipes that compose them into looks, components that add behavior, and screens that assemble components. Every color on a screen traces back to a token.",
                ko: "아래에서부터 시맨틱 토큰, 토큰을 조합해 모양을 만드는 recipe, 동작을 더하는 컴포넌트, 컴포넌트를 조립한 화면 순서입니다. 화면의 모든 색은 결국 토큰에서 옵니다.",
              })}
            />
            <Docs.IntroTable
              type={l.trans({ en: "Layer", ko: "계층" })}
              descLabel={l.trans({ en: "What it does", ko: "하는 일" })}
              items={layerRows}
            />
            <div>
              {l.trans({
                en: "Tokens are declared in page/styles.css, which also imports Tailwind and the Akan UI styles. The Theme System section below shows that file; the UI Recipe page covers the recipe layer.",
                ko: "토큰은 page/styles.css에 선언하고, 이 파일이 Tailwind와 Akan UI 스타일도 함께 import합니다. 그 파일은 아래 '테마 시스템 선언 방식'에서, recipe 계층은 UI 레시피 문서에서 다룹니다.",
              })}
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
                en: "A page designed from scratch drifts: its buttons end up a little rounder, its borders a little lighter than the page next to it. So define the app's basic component style first, and let pages only assemble those components.",
                ko: "처음부터 따로 디자인한 페이지는 조금씩 어긋납니다. 버튼은 옆 페이지보다 약간 더 둥글고, border는 약간 더 옅어집니다. 그래서 앱의 기본 컴포넌트 스타일을 먼저 정의하고, 페이지는 그 컴포넌트를 조립하기만 하게 만드세요.",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Buttons, inputs, cards, forms, alerts, tabs, modals and navigation share the same spacing, radius, text color, border and state behavior, through shared classes.",
                  ko: "button, input, card, form, alert, tab, modal, navigation은 공유 클래스를 통해 같은 간격, radius, 텍스트 색, border, 상태 동작을 씁니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Business pages assemble the design system instead of redefining colors and spacing.",
                  ko: "비즈니스 페이지는 색과 간격을 다시 정의하지 않고 디자인 시스템을 조립합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Imported modules feel consistent too, because they use the same Tailwind and semantic design tokens.",
                  ko: "가져온 모듈도 같은 Tailwind와 시맨틱 디자인 토큰을 쓰므로 일관되게 보입니다.",
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "A block built this way uses no color values at all, only token names and recipes:",
                ko: "이렇게 만든 블록에는 색 값이 하나도 없고, 토큰 이름과 recipe만 있습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              language="typescript"
              code={`<div className="space-y-3 rounded-xl bg-background p-4 text-foreground">
  <button className={buttonRecipe({ variant: "primary" })}>Save</button>
  <input className={inputRecipe({}, "w-full")} placeholder="Product name" />
  <div className="rounded-box border border-border bg-card p-4">
    Product summary
  </div>
  <div className="flex items-center gap-2 rounded-box border border-info/30 bg-info/10 p-4">Stock updated successfully.</div>
</div>`}
            />
            <div>
              {l.trans({
                en: "Switch the theme and the whole block restyles itself, because every class in it points at a token rather than a color.",
                ko: "테마를 바꾸면 블록 전체가 알아서 다시 칠해집니다. 안의 모든 클래스가 색이 아니라 토큰을 가리키기 때문입니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="theme-system"
          title={l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}
        >
          <Docs.Title>{l.trans({ en: "Theme System Declaration", ko: "테마 시스템 선언 방식" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Components write bg-primary once. Which red that means is decided in a single file, the app style entry, once per theme. Declaring it takes four steps:",
                ko: "컴포넌트는 bg-primary라고 한 번만 적습니다. 그것이 어떤 빨강인지는 앱 스타일 진입점이라는 파일 하나에서, 테마마다 한 번씩 정합니다. 선언은 네 단계입니다:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Import Tailwind and the Akan UI styles.",
                  ko: "Tailwind와 Akan UI 스타일을 import합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Define the raw values per theme as CSS variables under :root and [data-theme].",
                  ko: ":root와 [data-theme] 아래에 테마별 원시 값을 CSS 변수로 정의합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Map those variables to Tailwind color names with @theme inline.",
                  ko: "@theme inline으로 그 변수들을 Tailwind 색 이름에 연결합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Switch themes by changing the data-theme attribute. Nothing else changes.",
                  ko: "테마 전환은 data-theme 속성만 바꾸면 됩니다. 다른 것은 바뀌지 않습니다.",
                })}
              </li>
            </ol>
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
            <div>
              {l.trans({
                en: "A color that text sits on comes with a -foreground partner for that text: bg-primary pairs with text-primary-foreground, so a label on a primary button stays readable in every theme.",
                ko: "글자가 올라가는 색에는 그 글자를 위한 -foreground 짝이 있습니다. bg-primary에는 text-primary-foreground가 짝이므로, primary 버튼 위 글자는 어느 테마에서나 잘 읽힙니다.",
              })}
            </div>
            <Docs.Alert type="info">
              {l.trans({
                en: "Because @theme inline references var(), the same class (bg-primary, text-foreground …) resolves to a different color per data-theme. One app can define light, dark, brand or admin themes without changing any component class.",
                ko: "@theme inline이 var()를 참조하므로, 같은 클래스(bg-primary, text-foreground …)가 data-theme에 따라 다른 색으로 해석됩니다. 컴포넌트 클래스를 하나도 바꾸지 않고 light, dark, brand, admin 테마를 정의할 수 있습니다.",
              })}
            </Docs.Alert>
            <div>
              {l.trans({
                en: "The browser's theme-color follows --akan-theme-color once the root defines it, and so do a native app's status bar icons when the app names the appearance plugin. Set it per theme beside the tokens, for example --akan-theme-color: var(--background). It outranks the root layout's .viewport({ themeColor }), and a change of data-theme or of the root's inline style applies at once.",
                ko: "루트에 --akan-theme-color가 있으면 브라우저의 theme-color가 그 색을 따르고, appearance 플러그인을 적은 네이티브 앱은 상태 표시줄 아이콘도 따릅니다. 토큰 옆에 테마별로 두면 됩니다(예: --akan-theme-color: var(--background)). root layout의 .viewport({ themeColor })보다 우선하며, data-theme이나 루트의 인라인 스타일이 바뀌면 바로 반영됩니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="lib-tokens" title={l.trans({ en: "Lib-Owned Tokens", ko: "라이브러리 소유 토큰" })}>
          <Docs.Title>{l.trans({ en: "Lib-Owned Tokens", ko: "라이브러리 소유 토큰" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Some colors must not follow the theme. A Kakao sign-in button is Kakao yellow in the light theme and in the dark one. When a lib's components need fixed colors like that, the lib declares them itself:",
                ko: "테마를 따라가면 안 되는 색도 있습니다. 카카오 로그인 버튼은 라이트 테마에서도 다크 테마에서도 카카오 노랑입니다. 라이브러리의 컴포넌트에 이런 고정 색이 필요하면 라이브러리가 직접 선언합니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">{l.trans({ en: "Theme tokens", ko: "테마 토큰" })}</div>
                <div className="mb-2 text-foreground/50 text-xs">
                  {l.trans({ en: "Follow the theme", ko: "테마를 따라갑니다" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Declared in the app's page/styles.css and mapped with @theme inline.",
                    ko: "앱의 page/styles.css에 선언하고 @theme inline으로 연결합니다.",
                  })}
                </div>
                <code className={chip}>bg-primary</code>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">{l.trans({ en: "Lib tokens", ko: "라이브러리 토큰" })}</div>
                <div className="mb-2 text-foreground/50 text-xs">
                  {l.trans({ en: "Fixed in every theme", ko: "어느 테마에서나 고정" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Declared once in libs/<lib>/ui/tokens.css as plain custom properties.",
                    ko: "libs/<lib>/ui/tokens.css에 순수 custom property로 한 번 선언합니다.",
                  })}
                </div>
                <code className={chip}>bg-[var(--kakao)]</code>
              </div>
            </div>
            <div>
              {l.trans({
                en: "Every app whose pages reach that lib picks the file up automatically, ahead of its own stylesheets, so the app still has the last word on any variable both declare. Nothing is imported by hand, and a new app cannot forget it.",
                ko: "그 라이브러리에 닿는 앱은 이 파일을 자동으로, 자기 스타일시트보다 먼저 가져갑니다. 그래서 같은 변수를 둘 다 선언했다면 앱이 최종 결정권을 가집니다. 손으로 import할 것이 없고, 새 앱이 빠뜨릴 수도 없습니다.",
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
                en: "Why not a Tailwind @theme extension? The color vocabulary is closed per stylesheet, so bg-kakao would generate no CSS. Reference the variable as bg-[var(--kakao)], a form the color lint rules allow on purpose.",
                ko: "왜 Tailwind @theme 확장이 아닐까요? 색 어휘는 스타일시트 단위로 닫혀 있어서 bg-kakao는 CSS를 만들지 않습니다. 변수는 bg-[var(--kakao)]로 참조하세요. 색상 lint 규칙이 일부러 허용하는 형태입니다.",
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
                en: "Fonts are declared once, in the root layout, and then used like any other Tailwind class. Hand the .fonts() stage of the rootLayout() chain an array; each entry takes three fields:",
                ko: "폰트는 루트 레이아웃에서 한 번 선언하고, 그다음부터는 다른 Tailwind 클래스처럼 씁니다. rootLayout() 체인의 .fonts() 단계에 배열을 넘기며, 항목마다 세 필드를 적습니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={fontFieldRows} />
            <Code.Snippet
              className="w-full"
              title="apps/myapp/page/_layout.tsx"
              language="typescript"
              code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "pretendard",
      default: true,
      paths: [
        { src: "/libs/shared/fonts/Pretendard-Regular.woff2", weight: 400 },
        { src: "/libs/shared/fonts/Pretendard-SemiBold.woff2", weight: 600 },
        { src: "/libs/shared/fonts/Pretendard-Bold.woff2", weight: 700 },
      ],
    },
    {
      name: "lemonmilk",
      paths: [{ src: "/fonts/LemonMilk-Bold.woff2", weight: 700 }],
    },
  ])
  .render(({ children }) => children);`}
            />
            <div>
              {l.trans({
                en: "Each name is now a class. Text without one uses the default font, Pretendard here:",
                ko: "이제 각 이름이 클래스가 됩니다. 클래스를 주지 않은 글자는 기본 폰트, 여기서는 Pretendard를 씁니다:",
              })}
            </div>
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
  });
