import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade", rscPatchHeadSafe: true })
  .head(({ lang }) => {
    const title = lang === "ko" ? "아키텍처: UI 레시피 레이어 | Akan.js" : "Architecture: UI Recipe Layer | Akan.js";
    const description =
      lang === "ko"
        ? "프레임워크와 앱 레시피, 언제 쓸지, 그리고 룩을 덮어쓰는 방법."
        : "Framework and app recipes, when to reach for one, and how a look is overridden.";
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

    const termRows = [
      {
        name: "recipe",
        desc: l.trans({
          en: "A function that returns the class string for one look, built with recipe(tv({ … })).",
          ko: "모양 하나의 클래스 문자열을 돌려주는 함수입니다. recipe(tv({ … }))로 만듭니다.",
        }),
      },
      {
        name: "variant",
        desc: l.trans({
          en: "One named axis of a recipe (variant, size, side) and the values it can take.",
          ko: "recipe의 이름 붙은 축 하나(variant, size, side)와 그 축이 가질 수 있는 값들입니다.",
        }),
      },
      {
        name: "semantic token",
        desc: l.trans({
          en: "A color named for its role (primary, background, destructive) instead of its value.",
          ko: "값이 아니라 역할로 이름 붙인 색입니다. primary, background, destructive 같은 이름입니다.",
        }),
      },
      {
        name: "slot",
        desc: l.trans({
          en: "A named place (button, badge, input) where a route's _overrides.tsx can swap a recipe.",
          ko: "라우트의 _overrides.tsx가 recipe를 갈아 끼울 수 있는 이름 붙은 자리(button, badge, input)입니다.",
        }),
      },
    ];

    const layerRows = [
      {
        name: "tokens",
        desc: l.trans({
          en: "CSS variables in styles.css. Theme-aware, server/client agnostic. What is this color?",
          ko: "styles.css의 CSS 변수입니다. 테마를 따르고 서버/클라이언트를 가리지 않습니다. 이 색은 무엇인가?",
        }),
      },
      {
        name: "recipes",
        desc: l.trans({
          en: "Variant factories that compose tokens. Server-safe, no use client. How does it look?",
          ko: "토큰을 조합하는 변형 팩토리입니다. 서버에서도 안전하고 use client가 없습니다. 어떻게 보이는가?",
        }),
      },
      {
        name: "components",
        desc: l.trans({
          en: "Consume recipes and add interaction and state; use client only when needed. How does it behave?",
          ko: "recipe를 쓰고 상호작용과 상태를 더합니다. use client는 필요할 때만. 어떻게 동작하는가?",
        }),
      },
    ];

    const recipeAxes = [
      {
        recipe: "buttonRecipe",
        example: 'buttonRecipe({ variant: "outline", size: "sm" })',
        axes: [
          {
            axis: "variant",
            fallback: "primary",
            values: [
              "default",
              "primary",
              "secondary",
              "accent",
              "neutral",
              "outline",
              "ghost",
              "destructive",
              "success",
              "warning",
              "info",
              "link",
            ],
          },
          { axis: "size", fallback: "md", values: ["xs", "sm", "md", "lg", "icon"] },
          { axis: "shape", fallback: "default", values: ["default", "square", "circle"] },
          { axis: "outline", fallback: "", values: ["true"] },
        ],
      },
      {
        recipe: "badgeRecipe",
        example: 'badgeRecipe({ variant: "success" })',
        axes: [
          {
            axis: "variant",
            fallback: "default",
            values: [
              "default",
              "primary",
              "secondary",
              "accent",
              "neutral",
              "success",
              "warning",
              "info",
              "error",
              "outline",
            ],
          },
          { axis: "size", fallback: "md", values: ["xs", "sm", "md", "lg"] },
          { axis: "outline", fallback: "", values: ["true"] },
        ],
      },
      {
        recipe: "inputRecipe",
        example: 'inputRecipe({ tone: "error" }, "w-full")',
        axes: [
          { axis: "kind", fallback: "field", values: ["field", "area"] },
          { axis: "size", fallback: "md", values: ["xs", "sm", "md", "lg", "xl"] },
          { axis: "tone", fallback: "default", values: ["default", "primary", "error"] },
        ],
      },
    ];

    const recipeRows = recipeAxes.map(({ recipe, example, axes }) => ({
      name: recipe,
      desc: (
        <div className="space-y-1">
          {axes.map(({ axis, fallback, values }) => (
            <div key={axis}>
              <code className="mr-2 text-foreground">{axis}</code>
              {values.map((value, idx) => (
                <span key={value}>
                  {idx > 0 ? " · " : ""}
                  <span className={value === fallback ? "font-semibold text-foreground" : undefined}>{value}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ),
      example,
    }));

    const onRecipe = { recipe: true, variant: false, inline: false };
    const whenGroups = [
      {
        label: l.trans({ en: "A class set you would otherwise repeat", ko: "안 그러면 반복하게 될 클래스 묶음" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "Repeated or variant-like surface", ko: "반복되거나 variant 같은 표면" })}
              </span>
            ),
            desc: l.trans({
              en: "A status pill, a hero, a bubble or a tile: extract a recipe.",
              ko: "상태 pill, 히어로, 버블, 타일 같은 것입니다. recipe로 뽑아냅니다.",
            }),
            marks: onRecipe,
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "Class chosen from a fixed set by data", ko: "데이터로 고정된 집합에서 고르는 클래스" })}
              </span>
            ),
            desc: l.trans({
              en: "Tone, size, side or status decides the class: make it a variant of a recipe.",
              ko: "tone, size, side, status가 클래스를 정합니다. recipe의 variant로 만듭니다.",
            }),
            marks: { recipe: false, variant: true, inline: false },
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({
                  en: "Styling a server component or raw element",
                  ko: "서버 컴포넌트나 raw 엘리먼트 꾸미기",
                })}
              </span>
            ),
            desc: l.trans({
              en: "A recipe is server-safe, so a server page can call it directly.",
              ko: "recipe는 서버에서도 안전하므로 서버 페이지가 직접 호출할 수 있습니다.",
            }),
            marks: onRecipe,
          },
        ],
      },
      {
        label: l.trans({ en: "A class you write once", ko: "한 번만 쓰는 클래스" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "Genuinely one-off className", ko: "정말 일회성인 className" })}
              </span>
            ),
            desc: l.trans({
              en: "Keep it inline. Do not over-abstract.",
              ko: "인라인으로 둡니다. 과하게 추상화하지 마세요.",
            }),
            marks: { recipe: false, variant: false, inline: true },
          },
        ],
      },
    ];

    const overrideGroups = [
      {
        label: l.trans({ en: "Inside the route subtree", ko: "라우트 서브트리 안에서" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "Framework client components", ko: "프레임워크 클라이언트 컴포넌트" })}
              </span>
            ),
            desc: l.trans({
              en: "Button, Badge, Input, Dropdown, Pagination … read the slot, so they re-skin.",
              ko: "Button, Badge, Input, Dropdown, Pagination …은 슬롯을 읽으므로 새 모양으로 바뀝니다.",
            }),
            marks: { swapped: true, canonical: false },
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "Server components (Unit, View)", ko: "서버 컴포넌트(Unit, View)" })}
              </span>
            ),
            desc: l.trans({
              en: "They keep the canonical recipe.",
              ko: "canonical recipe를 그대로 씁니다.",
            }),
            marks: { swapped: false, canonical: true },
          },
          {
            name: "buttonRecipe(...)",
            desc: l.trans({
              en: "A raw call in your own JSX keeps the canonical recipe; import your own recipe there instead.",
              ko: "내 JSX 안의 직접 호출은 canonical recipe를 씁니다. 거기서는 내 recipe를 직접 import합니다.",
            }),
            marks: { swapped: false, canonical: true },
          },
        ],
      },
    ];

    const questions = [
      {
        title: l.trans({ en: "Q1. Does the theme differ?", ko: "Q1. 테마가 다른가?" }),
        sub: l.trans({ en: "Color · radius · font", ko: "색 · 각도 · 폰트" }),
        yes: l.trans({
          en: "Override token values in the app's page/styles.css.",
          ko: "앱의 page/styles.css에서 토큰 값을 override합니다.",
        }),
        no: l.trans({ en: "Keep the Akan defaults.", ko: "akan 기본값을 씁니다." }),
      },
      {
        title: l.trans({ en: "Q2. Does a component look differ?", ko: "Q2. 컴포넌트의 look이 다른가?" }),
        sub: l.trans({ en: "Same structure, different skin", ko: "구조는 같고 겉모습만 다름" }),
        yes: l.trans({
          en: "Write an app recipe and inject it through the recipes of _overrides.tsx.",
          ko: "앱 recipe를 쓰고 _overrides.tsx의 recipes로 주입합니다.",
        }),
        no: l.trans({ en: "Use it as it is.", ko: "그대로 씁니다." }),
      },
      {
        title: l.trans({ en: "Q3. Does structure or behavior differ?", ko: "Q3. 구조나 동작이 다른가?" }),
        sub: l.trans({ en: "For example, modal → drawer", ko: "예: 모달 → 드로어" }),
        yes: l.trans({
          en: "Write a component override that reassembles the headless parts.",
          ko: "headless 부품을 다시 조립하는 component override를 씁니다.",
        }),
        no: l.trans({ en: "Not needed.", ko: "필요 없습니다." }),
      },
      {
        title: l.trans({ en: "A surface the lib does not have?", ko: "lib에 없는 표면인가?" }),
        sub: l.trans({ en: "A chat bubble, a tile", ko: "챗 버블, 타일" }),
        yes: l.trans({
          en: "Add a new app recipe. It is an extension with no lib counterpart, so nothing conflicts.",
          ko: "앱 recipe를 새로 추가합니다. lib에 대응물이 없는 확장이라 충돌하지 않습니다.",
        }),
        no: l.trans({ en: "Use the lib's recipe.", ko: "lib의 recipe를 씁니다." }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="recipe-layer" title={l.trans({ en: "Recipe Layer", ko: "레시피 레이어" })}>
          <Docs.Title>{l.trans({ en: "Recipe Layer", ko: "레시피 레이어" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A primary button needs about a dozen classes. Written out on every button, those dozen classes drift apart, and changing the look means editing every copy. A recipe names that look once, and every button asks for it by name.",
                ko: "primary 버튼 하나에는 클래스가 열 개쯤 필요합니다. 버튼마다 그 열 개를 적으면 조금씩 어긋나고, 모양을 바꾸려면 모든 사본을 고쳐야 합니다. recipe는 그 모양에 한 번 이름을 붙이고, 모든 버튼이 그 이름으로 가져다 쓰게 합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Technically, a recipe is a variant factory built on tailwind-variants, and it sits between the token layer and the components. Each layer answers one question and knows only the layer below it:",
                ko: "기술적으로 recipe는 tailwind-variants 기반의 변형 팩토리이고, 토큰 계층과 컴포넌트 사이에 있습니다. 계층마다 질문 하나에 답하고, 바로 아래 계층만 압니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Layer", ko: "계층" })}
              descLabel={l.trans({ en: "What it does", ko: "하는 일" })}
              items={layerRows}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Why a recipe works on both sides", ko: "recipe가 양쪽에서 동작하는 이유" })}
            </Docs.SubSubTitle>
            <Docs.Figure
              title={l.trans({ en: "One recipe, callable from both sides", ko: "recipe 하나를 양쪽에서 호출" })}
              image="recipe-both-sides"
              prompt={`
              On the left, one rounded rectangle traced as the red accent, labelled "buttonRecipe" with a smaller
              second line "no use client". On the right, two rounded rectangles stacked one above the other with
              clear space between them: the upper one labelled "Server Component", the lower one labelled "Client
              Component". One plain black arrow runs from the left rectangle to each of the two right rectangles.
              Nothing else.
            `}
              alt={l.trans({
                en: "buttonRecipe carries no use client, so a server component and a client component can both call it and get the same class string.",
                ko: "buttonRecipe에는 use client가 없으므로 서버 컴포넌트와 클라이언트 컴포넌트가 모두 호출해 같은 클래스 문자열을 받습니다.",
              })}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    A recipe module never carries <code>{'"use client"'}</code>. It is a plain function that returns a
                    className string, so both server and client components can call it. A server page can style a raw{" "}
                    <code>{"<Link>"}</code> or <code>{"<div>"}</code> with <code>buttonRecipe()</code> directly.
                  </span>
                ),
                ko: (
                  <span>
                    recipe 모듈에는 절대 <code>{'"use client"'}</code>를 붙이지 않습니다. className 문자열을 돌려주는
                    순수 함수라서 서버 컴포넌트와 클라이언트 컴포넌트 모두 호출할 수 있습니다. 서버 페이지도 raw{" "}
                    <code>{"<Link>"}</code>나 <code>{"<div>"}</code>를 <code>buttonRecipe()</code>로 바로 꾸밀 수
                    있습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="framework-recipes" title={l.trans({ en: "Framework Recipes", ko: "프레임워크 레시피" })}>
          <Docs.Title>{l.trans({ en: "Framework Recipes", ko: "프레임워크 레시피" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "akanjs/ui ships buttonRecipe, badgeRecipe and inputRecipe from a server-safe module, and the Button, Badge and Input components use the same recipes inside. So a raw element styled with a recipe looks exactly like the component.",
                ko: "akanjs/ui는 서버에서도 안전한 모듈에서 buttonRecipe, badgeRecipe, inputRecipe를 제공하고, Button, Badge, Input 컴포넌트도 안에서 같은 recipe를 씁니다. 그래서 recipe로 꾸민 raw 엘리먼트는 컴포넌트와 똑같이 보입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Pass the variants as the first argument and any extra classes as the second. The recipe merges them with tailwind-merge for you, so you never wrap it in cn():",
                ko: "첫 번째 인자로 variant를, 두 번째 인자로 추가 클래스를 넘깁니다. recipe가 tailwind-merge로 알아서 합쳐 주므로 cn()으로 감쌀 필요가 없습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              language="typescript"
              code={`import { buttonRecipe, badgeRecipe, Link } from "akanjs/ui";

// Server component: style a raw element straight from the recipe.
<Link className={buttonRecipe({ variant: "primary", size: "lg" })}>Save</Link>;
<span className={badgeRecipe({ variant: "success" })}>Active</span>;

// Extra classes go in the 2nd arg — merged internally, no cn() needed.
<button className={buttonRecipe({ variant: "outline" }, "w-full rounded-2xl")} />;`}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "What each framework recipe accepts", ko: "프레임워크 recipe가 받는 값" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable
              type="recipe"
              descLabel={l.trans({ en: "Axes and values", ko: "축과 값" })}
              items={recipeRows}
            />
            <div className="text-foreground/60 text-sm">
              {l.trans({
                en: "Bold values are the defaults. outline is a flag: it keeps the variant's color and draws it as an outline.",
                ko: "굵은 값이 기본값입니다. outline은 플래그로, variant의 색을 유지한 채 외곽선으로 그립니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Every variant class is a semantic token (bg-primary, text-success-foreground …), so every value follows the theme automatically.",
                ko: "모든 variant 클래스는 시맨틱 토큰(bg-primary, text-success-foreground …)이라서, 어떤 값이든 자동으로 테마를 따라갑니다.",
              })}
            </div>
            <Docs.Alert type="info">
              {l.trans({
                en: "Recipes live in their own folder (akanjs/ui/recipe/, one recipe per file) precisely so they are not client-only. Exported from a 'use client' component file, a recipe called from a server component would throw 'client-only export'. The separate folder removes that boundary.",
                ko: "recipe를 별도 폴더(akanjs/ui/recipe/, 파일당 recipe 하나)에 두는 이유가 바로 client-only가 되지 않게 하려는 것입니다. 'use client' 컴포넌트 파일에서 export하면 서버 컴포넌트에서 호출할 때 'client-only export' 에러가 납니다. 폴더를 분리하면 그 경계가 사라집니다.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="app-recipes" title={l.trans({ en: "App-Level Recipes", ko: "앱 레벨 레시피" })}>
          <Docs.Title>{l.trans({ en: "App-Level Recipes", ko: "앱 레벨 레시피" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Your app has repeating surfaces the framework knows nothing about: a gradient hero, an icon tile, a chat bubble. Instead of inlining the same class string everywhere, give each one an app recipe:",
                ko: "앱에는 프레임워크가 모르는 반복 표면이 있습니다. 그라디언트 히어로, 아이콘 타일, 챗 버블 같은 것입니다. 같은 클래스 문자열을 곳곳에 인라인하지 말고, 각각에 앱 recipe를 만드세요:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Add one file per recipe under the app's ui/Recipe/. App ui folders are PascalCase, so it is ui/Recipe/ even though the framework's is the lowercase ui/recipe/.",
                  ko: "앱의 ui/Recipe/ 아래에 recipe마다 파일 하나를 추가합니다. 앱 ui 폴더는 PascalCase라서, 프레임워크의 소문자 ui/recipe/와 달리 ui/Recipe/입니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Build the factory with recipe(tv({ base, variants })). Both are re-exported from akanjs/ui.",
                  ko: "팩토리는 recipe(tv({ base, variants }))로 만듭니다. recipe와 tv 모두 akanjs/ui에서 re-export됩니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Name it <name>Recipe and keep the file free of 'use client'.",
                  ko: "이름은 <name>Recipe로 짓고, 파일에 'use client'를 넣지 않습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Import it from the ui barrel. The folder's index.ts also re-exports the framework recipes, so one import path covers both.",
                  ko: "ui 배럴에서 import합니다. 폴더의 index.ts가 프레임워크 recipe도 재수출하므로 import 경로 하나로 둘 다 씁니다.",
                })}
              </li>
            </ol>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/ui/Recipe/chatBubble.ts"
              language="typescript"
              code={`import { recipe, tv } from "akanjs/ui";
// No "use client" — recipes are server-safe.

export const chatBubbleRecipe = recipe(
  tv({
    base: "max-w-[78%] rounded-3xl p-4 text-sm",
    variants: {
      side: {
        incoming: "rounded-tl-md bg-muted text-foreground/75",
        outgoing: "ml-auto rounded-tr-md bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { side: "incoming" },
  }),
);
export type ChatBubbleVariants = NonNullable<Parameters<typeof chatBubbleRecipe>[0]>;`}
            />
            <div>
              {l.trans({
                en: "The page then stops repeating class strings and reads its variant from data:",
                ko: "그러면 페이지는 클래스 문자열 반복을 멈추고 데이터에서 variant를 읽습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/page/(home)/inbox/chat.tsx"
              language="typescript"
              code={`import { chatBubbleRecipe } from "@apps/myapp/ui";

// Before: the same bubble class was inlined 12 times.
// After: one recipe, driven by data.
{messages.map((message, index) => (
  <div key={index} className={chatBubbleRecipe({ side: message.side })}>
    {message.text}
  </div>
))}`}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: "Call it the same way as a framework recipe: xRecipe(variants, className?). The second argument is merged internally, so no cn() is needed.",
                ko: "호출도 프레임워크 recipe와 같습니다. xRecipe(변형, className?) — 두 번째 인자는 내부에서 병합되므로 cn()이 필요 없습니다.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="when-recipe" title={l.trans({ en: "When To Reach For A Recipe", ko: "언제 레시피를 쓸까" })}>
          <Docs.Title>{l.trans({ en: "When To Reach For A Recipe", ko: "언제 레시피를 쓸까" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Recipes earn their keep when a class set is reused, conditionally composed, or needed from a server component. One-off classes should stay inline. Find your case in the left column:",
                ko: "클래스 묶음이 재사용되거나, 조건에 따라 조합되거나, 서버 컴포넌트에서 필요할 때 recipe가 제값을 합니다. 일회성 클래스는 인라인으로 두세요. 내 경우를 왼쪽 열에서 찾아보세요:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Situation", ko: "상황" })}
              columns={[
                { key: "recipe", label: l.trans({ en: "New recipe", ko: "새 recipe" }) },
                { key: "variant", label: l.trans({ en: "Variant", ko: "variant" }) },
                { key: "inline", label: l.trans({ en: "Inline", ko: "인라인" }) },
              ]}
              groups={whenGroups}
              markLabel={l.trans({ en: "Reach for this", ko: "이것을 씁니다" })}
              emptyLabel={l.trans({ en: "Not this", ko: "이것이 아닙니다" })}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="recipe-override" title={l.trans({ en: "Recipe Override", ko: "레시피 오버라이드" })}>
          <Docs.Title>
            {l.trans({
              en: "Recipe Override — Re-skin Without Rebuilding",
              ko: "레시피 오버라이드 — 재구현 없이 리스킨",
            })}
          </Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Sometimes one section of the app needs a different look, say a neon admin area, but the components should behave exactly as before. A recipe override changes the look and nothing else.",
                ko: "앱의 한 구역만 모양이 달라야 할 때가 있습니다. 네온 스타일의 관리자 구역처럼요. 그래도 컴포넌트의 동작은 그대로여야 합니다. recipe override는 모양만 바꾸고 나머지는 건드리지 않습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "A route's _overrides.tsx can swap a recipe slot (button, badge, input). Every framework client component that consumes that recipe re-skins across the whole route subtree, while its behavior (async states, focus trap, a11y) stays exactly as the framework ships it. Only the className factory changes.",
                ko: "라우트의 _overrides.tsx는 recipe 슬롯(button, badge, input)을 교체할 수 있습니다. 그 recipe를 쓰는 프레임워크 클라이언트 컴포넌트는 라우트 서브트리 전체에서 새 모양이 되지만, 동작(async 상태, 포커스 트랩, a11y)은 프레임워크 그대로입니다. 바뀌는 것은 className 팩토리뿐입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "First, write a recipe with the same variant surface as the one it replaces:",
                ko: "먼저, 교체할 recipe와 같은 variant 표면을 가진 recipe를 씁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/ui/Recipe/neonButton.ts"
              language="typescript"
              code={`import { recipe, tv } from "akanjs/ui";

// Keep buttonRecipe's variant/size surface so the slot can accept it.
export const neonButtonRecipe = recipe(
  tv({
    base: "rounded-none border-2 font-mono uppercase tracking-widest",
    variants: {
      variant: { primary: "border-primary text-primary hover:bg-primary hover:text-primary-foreground", /* … */ },
      size: { md: "h-10 px-4", /* … */ },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }),
);`}
            />
            <div>
              {l.trans({
                en: "Then bind it to the slot in the section's _overrides.tsx. The screens under it do not change a line:",
                ko: "그다음 그 구역의 _overrides.tsx에서 슬롯에 연결합니다. 그 아래 화면 코드는 한 줄도 바뀌지 않습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/page/(section)/_overrides.tsx"
              language="typescript"
              code={`import { neonButtonRecipe } from "@apps/myapp/ui";
import { override } from "akanjs/ui";

// Every <Button> in this route subtree turns neon — call sites stay the same.
export default override({ recipes: { button: neonButtonRecipe } });`}
            />
            <Docs.SubSubTitle>{l.trans({ en: "What the swap reaches", ko: "교체가 닿는 곳" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "Caller", ko: "호출하는 쪽" })}
              columns={[
                { key: "swapped", label: l.trans({ en: "New look", ko: "새 모양" }) },
                { key: "canonical", label: l.trans({ en: "Canonical", ko: "원래 모양" }) },
              ]}
              groups={overrideGroups}
              markLabel={l.trans({ en: "Uses this recipe", ko: "이 recipe를 씀" })}
              emptyLabel={l.trans({ en: "Not this one", ko: "이쪽이 아님" })}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: "The swap recipe must accept the framework recipe's full variant surface, so every call site keeps working. It only reaches components that read the slot; where you call buttonRecipe(...) yourself, import your own recipe instead.",
                ko: "교체 recipe는 프레임워크 recipe의 variant 표면을 전부 받아야 모든 호출부가 계속 동작합니다. 교체는 슬롯을 읽는 컴포넌트에만 닿으므로, buttonRecipe(...)를 직접 부르는 곳에서는 내 recipe를 직접 import하세요.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="customization-decision"
          title={l.trans({ en: "Customization Decision", ko: "커스터마이징 결정" })}
        >
          <Docs.Title>{l.trans({ en: "Three Questions, One Invariant", ko: "세 질문, 하나의 불변" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Customization is decided once, at design-system setup, not per screen. Compare your design spec with the /lab catalog once, then run each difference through the questions below.",
                ko: "커스터마이징은 화면마다가 아니라 디자인 시스템을 셋업할 때 한 번 결정합니다. 디자인 스펙을 /lab 카탈로그와 한 번 대조한 뒤, 다른 점마다 아래 질문에 넣어 보세요.",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {questions.map((question) => (
                <div key={question.title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                  <div className="font-semibold text-primary">{question.title}</div>
                  <div className="mb-2 text-foreground/50 text-xs">{question.sub}</div>
                  <div className="space-y-1 text-foreground/70 text-sm">
                    <div>
                      <strong className="text-foreground">{l.trans({ en: "Yes →", ko: "예 →" })}</strong> {question.yes}
                    </div>
                    <div>
                      <strong className="text-foreground">{l.trans({ en: "No →", ko: "아니오 →" })}</strong>{" "}
                      {question.no}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Docs.Alert type="success">
              {l.trans({
                en: (
                  <span>
                    <strong>The invariant:</strong> the screen code, a plain <code>{"<Button>"}</code>, never changes
                    whatever the answers are. Only config files do.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>변하지 않는 것:</strong> 답이 무엇이든 화면 코드, 즉 그냥 <code>{"<Button>"}</code>은 바뀌지
                    않습니다. 바뀌는 것은 설정 파일뿐입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.Alert type="warning">
              {l.trans({
                en: "App recipes extend: they add surfaces the lib lacks, and never re-define a lib component in parallel. To change a lib component's look, use a recipe override, not a parallel button recipe. When the same className tweak repeats, promote it to a recipe override (app-wide) or a variant.",
                ko: "앱 recipe는 확장입니다. lib에 없는 표면을 더할 뿐, lib 컴포넌트를 병행해서 다시 정의하지 않습니다. lib 컴포넌트의 look을 바꾸려면 병행 버튼 recipe가 아니라 recipe override를 쓰세요. 같은 className 조정이 반복되면 recipe override(앱 전역)나 variant로 승격하세요.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
