import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="recipe-layer" title={l.trans({ en: "Recipe Layer", ko: "레시피 레이어" })}>
        <Docs.Title>{l.trans({ en: "Recipe Layer", ko: "레시피 레이어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A recipe is a variant factory (built on tailwind-variants) that sits between the token layer and the components. Tokens answer 'what is this color'; a recipe answers 'what does this component look like' by composing semantic-token classes into named variants; the component answers 'how does it behave'. Each layer only knows the one below it.",
              ko: "recipe는 토큰 계층과 컴포넌트 사이에 있는 변형 팩토리(tailwind-variants 기반)입니다. 토큰이 '이 색은 무엇인가'를 답한다면, recipe는 시맨틱 토큰 클래스를 이름 붙인 변형으로 조합해 '이 컴포넌트는 어떻게 보이는가'를 답하고, 컴포넌트는 '어떻게 동작하는가'를 답합니다. 각 레이어는 바로 아래 레이어만 압니다.",
            })}
          </div>
          <div className={panelRecipe()}>
            <div className="mb-2 font-bold text-foreground">
              {l.trans({ en: "The three UI layers", ko: "UI 세 계층" })}
            </div>
            <div className="space-y-1">
              {[
                {
                  title: "styles.css",
                  desc: l.trans({
                    en: "Semantic tokens (CSS variables). Theme-aware, server/client agnostic. 'What is this color.'",
                    ko: "시맨틱 토큰(CSS 변수). 테마 인식, 서버/클라 무관. '이 색은 무엇인가.'",
                  }),
                },
                {
                  title: "ui/recipe",
                  desc: l.trans({
                    en: "Variant factories composing tokens. Server-safe (no 'use client'). 'How does it look.'",
                    ko: "토큰을 조합하는 변형 팩토리. 서버-안전('use client' 없음). '어떻게 보이는가.'",
                  }),
                },
                {
                  title: "Components",
                  desc: l.trans({
                    en: "Consume recipes; add interaction/state. 'use client' only when needed. 'How does it behave.'",
                    ko: "recipe를 소비하고 상호작용/상태를 더함. 필요할 때만 'use client'. '어떻게 동작하는가.'",
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
          <Docs.Alert type="info">
            {l.trans({
              en: "A recipe module never carries 'use client'. Because it is a plain function returning a className string, both server components and client components can call it — a server page can style a raw <Link> or <div> with buttonRecipe() directly.",
              ko: "recipe 모듈에는 절대 'use client'를 붙이지 않습니다. className 문자열을 반환하는 순수 함수이므로 서버 컴포넌트와 클라이언트 컴포넌트 모두에서 호출할 수 있습니다 — 서버 페이지가 raw <Link>나 <div>를 buttonRecipe()로 직접 스타일링할 수 있습니다.",
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
              en: "akanjs/ui ships buttonRecipe and badgeRecipe from a server-safe module. Call them anywhere to style raw elements, and pass extra classes as the second argument — the recipe merges them for you with tailwind-merge, so you never wrap it in cn(). The Button and Badge components consume the same recipes internally.",
              ko: "akanjs/ui는 서버-안전 모듈에서 buttonRecipe와 badgeRecipe를 제공합니다. 어디서든 호출해 raw 엘리먼트를 스타일링하고, 추가 클래스는 두 번째 인자로 넘기면 recipe가 tailwind-merge로 합쳐줍니다 — cn()으로 감쌀 필요가 없습니다. Button·Badge 컴포넌트도 내부에서 같은 recipe를 소비합니다.",
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
          <div className="space-y-1">
            {[
              l.trans({
                en: "buttonRecipe variants: primary, secondary, accent, outline, ghost, destructive, success, warning, info, link — plus size xs/sm/md/lg/icon.",
                ko: "buttonRecipe variant: primary, secondary, accent, outline, ghost, destructive, success, warning, info, link — 그리고 size xs/sm/md/lg/icon.",
              }),
              l.trans({
                en: "badgeRecipe variants: default, primary, secondary, accent, success, warning, info, error, outline.",
                ko: "badgeRecipe variant: default, primary, secondary, accent, success, warning, info, error, outline.",
              }),
              l.trans({
                en: "Every variant class is a semantic token (bg-primary, text-success-foreground …), so it stays theme-aware automatically.",
                ko: "모든 variant 클래스는 시맨틱 토큰(bg-primary, text-success-foreground …)이라 자동으로 테마를 따라갑니다.",
              }),
            ].map((desc) => (
              <div key={desc} className={panelRecipe({ padding: "none" }, "px-4 py-2 text-foreground/70 text-sm")}>
                {desc}
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Recipes live in their own folder (akanjs/ui/recipe/, one recipe per file) precisely so they are not client-only. If a recipe were exported from a 'use client' component file, calling it from a server component would throw 'client-only export'. The separate recipe layer removes that boundary.",
              ko: "recipe를 별도 폴더(akanjs/ui/recipe/, 파일당 recipe 하나)에 두는 이유가 바로 client-only가 되지 않게 하기 위해서입니다. recipe를 'use client' 컴포넌트 파일에서 export하면 서버 컴포넌트에서 호출할 때 'client-only export' 에러가 납니다. recipe 레이어를 분리하면 그 경계가 사라집니다.",
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
              en: "When a surface repeats across your app — a gradient hero, an icon tile, a chat bubble — do not inline the same class string everywhere. Add one file per recipe under the app's ui/Recipe/ (server-safe; the folder is PascalCase because the generated ui barrel exports PascalCase names only) and import it from the ui barrel. This mirrors the framework's ui/recipe/ at the app level, and the folder's index.ts also re-exports the framework recipes so one import path covers both.",
              ko: "앱 전반에서 반복되는 표면(그라디언트 히어로, 아이콘 타일, 챗 버블)은 같은 클래스 문자열을 곳곳에 인라인하지 마세요. 앱의 ui/Recipe/ 아래에 recipe당 파일 하나를 추가하고(서버-안전, 생성되는 ui 배럴이 PascalCase 이름만 내보내므로 폴더명은 PascalCase) ui 배럴에서 import합니다. 프레임워크의 ui/recipe/를 앱 레벨에서 미러링하는 구조이고, 폴더의 index.ts가 프레임워크 recipe도 재수출하므로 import 경로 하나로 둘 다 씁니다.",
            })}
          </div>
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
              en: "Convention: build each factory with recipe(tv({ base, variants })) (both re-exported from akanjs/ui), name it <name>Recipe, and keep the file free of 'use client'. Call it as xRecipe(variants, className?) — the second arg is merged internally, no cn() needed. App ui folders are PascalCase, so the folder is ui/Recipe/ even though the framework's is the lowercase ui/recipe/.",
              ko: "규약: 각 팩토리는 recipe(tv({ base, variants }))로 만들고(recipe·tv 모두 akanjs/ui에서 re-export), <name>Recipe로 이름 지으며, 파일에 'use client'를 넣지 않습니다. 호출은 xRecipe(변형, className?) — 두 번째 인자는 내부에서 병합되므로 cn()이 필요 없습니다. 앱 ui 폴더는 PascalCase라서 프레임워크의 소문자 ui/recipe/와 달리 폴더명은 ui/Recipe/입니다.",
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
              en: "Recipes earn their keep when a class set is reused, conditionally composed, or needed from a server component. One-off classes should stay inline.",
              ko: "클래스 묶음이 재사용되거나, 조건부로 조합되거나, 서버 컴포넌트에서 필요할 때 recipe가 값을 합니다. 일회성 클래스는 인라인으로 두세요.",
            })}
          </div>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Repeated or variant-like surface (status pill, hero, bubble, tile) → extract a recipe.",
                ko: "반복되거나 variant스러운 표면(상태 pill, 히어로, 버블, 타일) → recipe로 추출.",
              }),
              l.trans({
                en: "A class chosen from a fixed set by data (tone, size, side, status) → a recipe variant.",
                ko: "데이터에 따라 고정된 집합에서 고르는 클래스(tone, size, side, status) → recipe variant.",
              }),
              l.trans({
                en: "Styling needed from a server component or a raw element → a recipe (server-safe).",
                ko: "서버 컴포넌트나 raw 엘리먼트에서 스타일링이 필요 → recipe(서버-안전).",
              }),
              l.trans({
                en: "A genuinely one-off className → keep it inline; do not over-abstract.",
                ko: "정말 일회성인 className → 인라인 유지; 과하게 추상화하지 마세요.",
              }),
            ].map((desc) => (
              <div key={desc} className={panelRecipe({ padding: "none" }, "px-4 py-2 text-foreground/70 text-sm")}>
                {desc}
              </div>
            ))}
          </div>
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
              en: "A route's _overrides.tsx can swap a recipe slot. Every framework component that consumes that recipe (Button, Badge …) re-skins across the whole route subtree — while its behavior (async states, focus trap, a11y) stays exactly as the framework ships it. Only the className factory changes.",
              ko: "라우트의 _overrides.tsx 는 recipe 슬롯을 교체할 수 있습니다. 그 recipe 를 소비하는 프레임워크 컴포넌트(Button, Badge …)가 라우트 서브트리 전체에서 리스킨되지만, 동작(async 상태, 포커스 트랩, a11y)은 프레임워크 그대로입니다. 바뀌는 건 className 팩토리뿐입니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/Recipe/neonButton.ts"
            language="typescript"
            code={`// buttonRecipe 와 같은 variant/size 표면을 유지해야 슬롯에 주입 가능.
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
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/(section)/_overrides.tsx"
            language="typescript"
            code={`import { neonButtonRecipe } from "@apps/myapp/ui";
import { override } from "akanjs/ui";

// 이 라우트 서브트리의 모든 <Button> 이 네온으로 — 호출 코드는 그대로.
export default override({ recipes: { button: neonButtonRecipe } });`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "The swap recipe must accept the framework recipe's full variant surface so every call site keeps working. It reaches framework components (which read the slot); a raw buttonRecipe(...) call in your own JSX is not affected — import your own recipe there instead.",
              ko: "교체 recipe 는 프레임워크 recipe 의 전체 variant 표면을 받아야 모든 호출부가 계속 동작합니다. 슬롯을 읽는 프레임워크 컴포넌트에 적용되며, 당신 JSX 안의 raw buttonRecipe(...) 직접 호출은 영향받지 않습니다 — 거긴 당신 recipe 를 직접 import 하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="customization-decision"
        title={l.trans({ en: "Customization Decision", ko: "커스터마이징 결정" })}
      >
        <Docs.Title>{l.trans({ en: "Two Questions, One Invariant", ko: "두 질문, 하나의 불변" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Customization is decided once at design-system setup, not per screen. The screen code — a plain <Button> — never changes across any answer; only config files do. Diff your design spec against the /lab catalog once, then classify each delta.",
              ko: "커스터마이징은 화면마다가 아니라 디자인 시스템 셋업 때 한 번 결정합니다. 화면 코드 — 그냥 <Button> — 는 어떤 답에서도 불변이고, 설정 파일만 바뀝니다. 디자인 스펙을 /lab 카탈로그와 한 번 대조한 뒤 델타마다 분류하세요.",
            })}
          </div>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Q1. Theme differs (color · radius · font)? → override token values in app page/styles.css. Else → akan defaults.",
                ko: "Q1. 테마가 다른가(색·각도·폰트)? → 앱 page/styles.css 에서 토큰 값 override. 아니면 → akan 디폴트.",
              }),
              l.trans({
                en: "Q2. Component look differs? → write an app recipe, inject via _overrides.tsx recipes. Else → use as-is.",
                ko: "Q2. 컴포넌트 look 이 다른가? → 앱 recipe 작성 후 _overrides.tsx recipes 로 주입. 아니면 → 그대로 사용.",
              }),
              l.trans({
                en: "Q3. Structure or behavior differs (modal → drawer)? → component override (reassemble headless parts). Else → not needed.",
                ko: "Q3. 구조·동작이 다른가(모달→드로어)? → component override(headless 부품 재조립). 아니면 → 불필요.",
              }),
              l.trans({
                en: "A surface lib doesn't have (chat bubble, tile)? → add a new app recipe (extension — no lib counterpart, so no conflict).",
                ko: "lib 에 없는 표면(챗 버블·타일)? → 앱 recipe 신규 추가(확장 — lib 대응물 없으니 충돌 없음).",
              }),
            ].map((desc) => (
              <div key={desc} className={panelRecipe({ padding: "none" }, "px-4 py-2 text-foreground/70 text-sm")}>
                {desc}
              </div>
            ))}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "App recipes extend (surfaces lib lacks); they never re-define a lib component in parallel. To change a lib component's look, use recipe override — do not create a parallel button recipe. And when the same className tweak repeats, promote it to a recipe override (app-wide) or a variant.",
              ko: "앱 recipe 는 확장(lib 에 없는 표면)이지, lib 컴포넌트를 병행 재정의하는 게 아닙니다. lib 컴포넌트 look 을 바꾸려면 recipe override 를 쓰세요 — 병행 버튼 recipe 금지. 그리고 같은 className 조정이 반복되면 recipe override(앱 전역)나 variant 로 승격하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
}
