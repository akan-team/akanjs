import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, type IntroItem, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const terms: IntroItem[] = [
    {
      name: "barrel",
      desc: l.trans({
        en: "A folder's `index.ts` that re-exports its files, so callers import one path: `@apps/myapp/ui`.",
        ko: "폴더 안 파일을 다시 export하는 `index.ts`입니다. 쓰는 쪽은 `@apps/myapp/ui` 경로 하나로 import합니다.",
      }),
    },
    {
      name: '"use client"',
      desc: l.trans({
        en: "The first line that makes a file a client component. Without it, a component renders on the server.",
        ko: "파일을 클라이언트 컴포넌트로 만드는 첫 줄입니다. 이 줄이 없으면 컴포넌트는 서버에서 그려집니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "namespace component", ko: "묶음 컴포넌트" })}</span>,
      desc: l.trans({
        en: "Several components exported as one object, used as `Only.Web` or `Chart.Bar`.",
        ko: "여러 컴포넌트를 객체 하나로 묶어 export한 것입니다. `Only.Web`, `Chart.Bar`처럼 씁니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "sidecar", ko: "보조 파일" })}</span>,
      desc: l.trans({
        en: "A camelCase helper or type file that serves one component, like `swipeCard.util.ts`.",
        ko: "컴포넌트 하나를 돕는 camelCase 헬퍼나 타입 파일입니다. `swipeCard.util.ts`가 그 예입니다.",
      }),
    },
  ];

  const placeColumns = [
    { key: "ui", label: "ui/", code: true },
    { key: "module", label: "lib/<model>/", code: true },
    { key: "webkit", label: "webkit/", code: true },
  ];
  const inUi = { ui: true, module: false, webkit: false };

  const placeGroups = [
    {
      label: l.trans({
        en: "Draws JSX or defines a look, bound to no model — ui/",
        ko: "JSX를 그리거나 모양을 정의하고 모델에 묶이지 않음 — ui/",
      }),
      rows: [
        {
          name: (
            <span className="font-sans">
              {l.trans({ en: "landing hero · admin header", ko: "랜딩 히어로 · 관리자 헤더" })}
            </span>
          ),
          desc: l.trans({
            en: "Belongs to one app, so it lives in `apps/<app>/ui`.",
            ko: "한 앱에만 속하므로 `apps/<app>/ui`에 둡니다.",
          }),
          marks: inUi,
        },
        {
          name: "Only.Admin · Only.Web",
          desc: l.trans({
            en: "An auth gate or responsive wrapper several apps share, so it lives in `libs/<lib>/ui`.",
            ko: "여러 앱이 함께 쓰는 권한 게이트와 반응형 래퍼이므로 `libs/<lib>/ui`에 둡니다.",
          }),
          marks: inUi,
        },
        {
          name: "Chart · MapView · Editor",
          desc: l.trans({
            en: "Wraps a third-party package that pages and module files may not import directly.",
            ko: "페이지와 모듈 파일이 직접 import할 수 없는 외부 패키지를 감쌉니다.",
          }),
          marks: inUi,
        },
        {
          name: "cardRecipe · panelRecipe",
          desc: l.trans({
            en: "A look several screens share. Not a component or a hook, but it lives in `ui/Recipe/`.",
            ko: "여러 화면이 함께 쓰는 모양입니다. 컴포넌트도 hook도 아니지만 `ui/Recipe/`에 둡니다.",
          }),
          marks: inUi,
        },
      ],
    },
    {
      label: l.trans({ en: "Goes somewhere else", ko: "다른 곳에 두는 것" }),
      rows: [
        {
          name: (
            <span className="font-sans">{l.trans({ en: "a card for one order", ko: "주문 하나를 그리는 카드" })}</span>
          ),
          desc: l.trans({
            en: "It is bound to a model, so it is `Order.Unit.tsx` in `lib/order/`.",
            ko: "모델에 묶여 있으므로 `lib/order/`의 `Order.Unit.tsx`입니다.",
          }),
          marks: { ui: false, module: true, webkit: false },
        },
        {
          name: "useGeoLocation",
          desc: l.trans({
            en: "A hook or browser helper with no markup of its own.",
            ko: "자기 마크업이 없는 hook이나 브라우저 헬퍼입니다.",
          }),
          marks: { ui: false, module: false, webkit: true },
        },
      ],
    },
  ];

  const folderItems: IntroItem[] = [
    {
      name: "AutoClose.tsx",
      desc: l.trans({
        en: "One component per file, and the file name is the export name. PascalCase.",
        ko: "파일 하나에 컴포넌트 하나이고, 파일 이름이 곧 export 이름입니다. PascalCase로 씁니다.",
      }),
    },
    {
      name: "swipeCard.util.ts",
      desc: l.trans({
        en: "A sidecar in camelCase with a role suffix. Only its component imports it, by relative path.",
        ko: "역할 접미사를 붙인 camelCase 보조 파일입니다. 자기 컴포넌트만 상대 경로로 import합니다.",
      }),
    },
    {
      name: "Only/index.tsx",
      desc: l.trans({
        en: 'A namespace component. You write this `index.tsx` yourself, with no "use client".',
        ko: '묶음 컴포넌트입니다. 이 `index.tsx`는 직접 작성하며 "use client"를 달지 않습니다.',
      }),
    },
    {
      name: "Chart/index_.tsx",
      desc: l.trans({
        en: 'The "use client" + `lazy()` half of a heavy component, next to a server-safe `index.tsx`.',
        ko: '무거운 컴포넌트를 `lazy()`로 불러오는 "use client" 쪽 파일입니다. 옆에 서버에서 안전한 `index.tsx`를 둡니다.',
      }),
    },
    {
      name: "Recipe/",
      desc: l.trans({
        en: "Tailwind-variant looks such as `panelRecipe`, one per file, re-exported from `Recipe/index.ts`.",
        ko: "`panelRecipe` 같은 Tailwind variant 레시피입니다. 파일 하나에 하나씩 두고 `Recipe/index.ts`에서 다시 export합니다.",
      }),
    },
    {
      name: "tokens.css",
      desc: l.trans({
        en: "Libs only. `:root` colors that must not follow the theme, used as `bg-[var(--kakao)]`.",
        ko: "lib 전용입니다. 테마를 따라가면 안 되는 `:root` 색을 두고, `bg-[var(--kakao)]`처럼 씁니다.",
      }),
    },
    {
      name: "index.ts",
      desc: l.trans({
        en: "The barrel. It is written for you, so never edit it by hand.",
        ko: "barrel입니다. 자동으로 만들어지므로 손으로 고치지 않습니다.",
      }),
    },
  ];

  const importColumns = [
    { key: "file", label: l.trans({ en: "File in ui/", ko: "ui/의 파일" }), code: true },
    { key: "use", label: l.trans({ en: "How to use it", ko: "쓰는 법" }) },
  ];
  const importRows = [
    {
      file: "ui/AutoClose.tsx",
      use: l.trans({
        en: '`import { AutoClose } from "@apps/myapp/ui"`',
        ko: '`import { AutoClose } from "@apps/myapp/ui"`',
      }),
    },
    {
      file: "ui/Only/index.tsx",
      use: l.trans({
        en: '`import { Only } from "@libs/shared/ui"`, then `<Only.Web>`.',
        ko: '`import { Only } from "@libs/shared/ui"` 한 뒤 `<Only.Web>`으로 씁니다.',
      }),
    },
    {
      file: "ui/Recipe/panel.ts",
      use: l.trans({
        en: '`import { panelRecipe } from "@apps/myapp/ui"`, through `Recipe/index.ts`.',
        ko: '`Recipe/index.ts`를 거쳐 `import { panelRecipe } from "@apps/myapp/ui"`로 씁니다.',
      }),
    },
    {
      file: "ui/swipeCard.util.ts",
      use: l.trans({
        en: "Not in the barrel. `SwipeCard.tsx` imports it as `./swipeCard.util`.",
        ko: "barrel에 없습니다. `SwipeCard.tsx`가 `./swipeCard.util`로 import합니다.",
      }),
    },
  ];

  const mistakeColumns = [
    { key: "mistake", label: l.trans({ en: "Mistake", ko: "실수" }) },
    { key: "fix", label: l.trans({ en: "Fix", ko: "고치는 법" }) },
  ];
  const mistakeRows = [
    {
      mistake: l.trans({
        en: '"use client" on a component that only renders markup',
        ko: '마크업만 그리는 컴포넌트에 "use client"를 단다',
      }),
      fix: l.trans({
        en: "Delete it unless the file uses a hook, handler, the store, a browser global or client-only package.",
        ko: "hook, 이벤트 핸들러, store, 브라우저 전역 객체, 클라이언트 전용 패키지를 쓰지 않는다면 지웁니다.",
      }),
    },
    {
      mistake: l.trans({ en: "A card that takes one `Order` in `ui/`", ko: "`Order` 하나를 받는 카드를 `ui/`에 둔다" }),
      fix: l.trans({ en: "Move it to `lib/order/Order.Unit.tsx`.", ko: "`lib/order/Order.Unit.tsx`로 옮깁니다." }),
    },
    {
      mistake: l.trans({
        en: "Importing a component by its file path",
        ko: "컴포넌트를 파일 경로로 import한다",
      }),
      fix: l.trans({
        en: "Use `@apps/myapp/ui`, not `@apps/myapp/ui/AutoClose`. The deep path fails lint.",
        ko: "`@apps/myapp/ui/AutoClose` 대신 `@apps/myapp/ui`를 씁니다. 깊은 경로는 lint 오류입니다.",
      }),
    },
    {
      mistake: l.trans({ en: "Adding a line to `ui/index.ts` by hand", ko: "`ui/index.ts`에 직접 줄을 추가한다" }),
      fix: l.trans({
        en: "Leave it. Add, rename or delete the component file instead.",
        ko: "그대로 둡니다. 대신 컴포넌트 파일을 추가하거나, 이름을 바꾸거나, 지웁니다.",
      }),
    },
    {
      mistake: l.trans({
        en: 'Building `Only = { … }` in a "use client" file',
        ko: '"use client" 파일에서 `Only = { … }`를 만든다',
      }),
      fix: l.trans({
        en: "Build the object in a directive-free `index.tsx`.",
        ko: '"use client"가 없는 `index.tsx`에서 객체를 만듭니다.',
      }),
    },
    {
      mistake: l.trans({
        en: "An `async` component in `ui/`",
        ko: "`ui/`에 `async` 컴포넌트를 쓴다",
      }),
      fix: l.trans({
        en: "Await in the page and pass the result down as a prop.",
        ko: "page에서 await하고, 결과를 prop으로 넘깁니다.",
      }),
    },
    {
      mistake: l.trans({
        en: "Importing a third-party package in a page or `*.Unit.tsx`",
        ko: "page나 `*.Unit.tsx`에서 외부 패키지를 import한다",
      }),
      fix: l.trans({
        en: "Wrap it in a lib `ui/` component and import that.",
        ko: "lib의 `ui/` 컴포넌트로 감싸고, 그 컴포넌트를 import합니다.",
      }),
    },
    {
      mistake: l.trans({
        en: "The same card classes copied into many files",
        ko: "같은 카드 클래스를 여러 파일에 복사한다",
      }),
      fix: l.trans({
        en: "Add one recipe in `ui/Recipe/` and call it everywhere.",
        ko: "`ui/Recipe/`에 레시피 하나를 만들고 모든 곳에서 호출합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="ui-overview" title={l.trans({ en: "UI Folder Overview", ko: "ui 폴더 개요" })}>
        <Docs.Title>{l.trans({ en: "UI Folder Overview", ko: "ui 폴더 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>ui/</code> holds components that draw a piece of screen and are not bound to one model. Pages
                  and module components import them by name instead of repeating the markup.
                </span>
              ),
              ko: (
                <span>
                  <code>ui/</code>에는 화면 조각을 그리되 특정 모델에 묶이지 않는 컴포넌트를 둡니다. 페이지와 모듈
                  컴포넌트는 마크업을 반복하지 않고 이름으로 가져다 씁니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "App UI", ko: "앱 UI" })}</div>
              <div className="mt-1 text-foreground/70 text-sm">
                {l.trans({
                  en: "Components one app owns, such as an admin header, a landing hero, a dashboard widget or an app-only interaction. Keep the folder shallow.",
                  ko: "관리자 헤더, 랜딩 히어로, 대시보드 위젯, 그 앱에만 있는 인터랙션처럼 한 앱이 가진 컴포넌트입니다. 폴더는 얕게 유지합니다.",
                })}
              </div>
              <code className={chip}>@apps/myapp/ui</code>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "Library UI", ko: "라이브러리 UI" })}</div>
              <div className="mt-1 text-foreground/70 text-sm">
                {l.trans({
                  en: "Components several apps share, such as auth gates, responsive wrappers, editor pieces or common form fields.",
                  ko: "권한 게이트, 반응형 래퍼, 에디터 조각, 공통 폼 필드처럼 여러 앱이 함께 쓰는 컴포넌트입니다.",
                })}
              </div>
              <code className={chip}>@libs/shared/ui</code>
            </div>
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={terms} />

          <Docs.SubSubTitle>{l.trans({ en: "Does it belong in ui/?", ko: "ui/에 둘까요?" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Ask two questions: does it draw JSX or define a look, and does it take one model? Yes, then no, means ui/.",
              ko: "두 가지를 물어보세요. JSX를 그리거나 모양을 정의하는가, 모델 하나를 받는가. 앞은 예, 뒤는 아니오일 때만 ui/에 둡니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Code", ko: "코드" })}
            columns={placeColumns}
            groups={placeGroups}
            markLabel={l.trans({ en: "Goes here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="recommended-shape" title={l.trans({ en: "Recommended Shape", ko: "권장 구조" })}>
        <Docs.Title>{l.trans({ en: "Recommended Shape", ko: "권장 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The rule is simple: <strong>one file, one export, and the file name is the export name.</strong> A
                  typical <code>ui/</code> folder looks like this:
                </span>
              ),
              ko: (
                <span>
                  규칙은 단순합니다. <strong>파일 하나에 export 하나, 파일 이름이 곧 export 이름입니다.</strong> 보통의{" "}
                  <code>ui/</code> 폴더는 이렇게 생겼습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui"
            language="bash"
            showLineNumbers={false}
            code={`apps/myapp/ui/
├── AutoClose.tsx
├── HomeHeader.tsx
├── SwipeCard.tsx
├── swipeCard.util.ts
├── Only/
│   ├── index.tsx
│   └── Web.tsx
├── Recipe/
│   ├── index.ts
│   └── panel.ts
└── index.ts`}
          />
          <Docs.IntroTable type={l.trans({ en: "Entry", ko: "항목" })} items={folderItems} />

          <Docs.SubSubTitle>
            {l.trans({ en: "A server component by default", ko: "기본은 서버 컴포넌트" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A component that only renders markup has no <code>{'"use client"'}</code>, so it arrives as HTML and
                  adds nothing to the bundle:
                </span>
              ),
              ko: (
                <span>
                  마크업만 그리는 컴포넌트에는 <code>{'"use client"'}</code>가 없습니다. 그래서 HTML로만 도착하고
                  번들에는 아무것도 더하지 않습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/HomeHeader.tsx"
            code={`import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface HomeHeaderProps {
  className?: string;
  title: ReactNode;
  right?: ReactNode;
}
export const HomeHeader = ({ className, title, right }: HomeHeaderProps) => {
  return (
    <header className={cn("flex justify-between py-4", className)}>
      <h1 className="font-bold text-2xl">{title}</h1>
      {right}
    </header>
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Props interface right above.</strong> <code>interface HomeHeaderProps</code> sits directly
                    over the component with no blank line, and <code>className</code> comes first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Props 인터페이스는 바로 위에.</strong> <code>interface HomeHeaderProps</code>는 빈 줄 없이
                    컴포넌트 바로 위에 두고, <code>className</code>을 맨 앞에 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The caller's class merges last.</strong> <code>cn(base, className)</code> lets a page adjust
                    the look without a second prop.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출한 쪽의 class는 마지막에.</strong> <code>cn(base, className)</code>으로 합치면 페이지가
                    prop을 더 만들지 않고도 모양을 조정할 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Slots, not strings.</strong> <code>title</code> and <code>right</code> are{" "}
                    <code>ReactNode</code>, so the page passes translated text or another component.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>문자열 대신 슬롯.</strong> <code>title</code>과 <code>right</code>는 <code>ReactNode</code>
                    이므로, 페이지가 번역된 문구나 다른 컴포넌트를 넘길 수 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "When it needs the browser", ko: "브라우저가 필요할 때" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>AutoClose</code> uses <code>useEffect</code> and <code>window</code>, so it earns{" "}
                  <code>{'"use client"'}</code> on line 1:
                </span>
              ),
              ko: (
                <span>
                  <code>AutoClose</code>는 <code>useEffect</code>와 <code>window</code>를 쓰므로 첫 줄에{" "}
                  <code>{'"use client"'}</code>가 필요합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/AutoClose.tsx"
            code={`"use client";
import { useEffect } from "react";

interface AutoCloseProps {
  timeout?: number;
}
export const AutoClose = ({ timeout = 0 }: AutoCloseProps) => {
  useEffect(() => {
    const timer = setTimeout(() => window.close(), timeout);
    return () => clearTimeout(timer);
  }, [timeout]);
  return null;
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Defaults in the destructuring.</strong> Write <code>timeout = 0</code>, never{" "}
                    <code>defaultProps</code> or <code>React.FC</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기본값은 구조 분해에서.</strong> <code>timeout = 0</code>으로 쓰고,{" "}
                    <code>defaultProps</code>나 <code>React.FC</code>는 쓰지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An effect cleans up after itself.</strong> Returning <code>clearTimeout</code> stops the
                    close when the component unmounts first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>effect는 스스로 정리합니다.</strong> <code>clearTimeout</code>을 반환하면 컴포넌트가 먼저
                    사라질 때 닫기가 취소됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>No async component in ui/.</strong> React has no async client component, so an{" "}
                  <code>async</code> one breaks as soon as a client parent renders it. Await in the page and pass the
                  result down as a prop; lint rejects the async form.
                </span>
              ),
              ko: (
                <span>
                  <strong>ui/에는 async 컴포넌트를 두지 않습니다.</strong> React에는 async 클라이언트 컴포넌트가 없어서,
                  클라이언트 부모가 그리는 순간 깨집니다. page에서 await하고 결과를 prop으로 넘기세요. async 형태는
                  lint가 막습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="barrel-optimization" title={l.trans({ en: "Import From The Barrel", ko: "barrel에서 import" })}>
        <Docs.Title>{l.trans({ en: "Import From The Barrel", ko: "barrel에서 import" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Everything in <code>ui/</code> is imported through the folder's barrel, never through a file path. A
                  page uses <code>AutoClose</code> like this:
                </span>
              ),
              ko: (
                <span>
                  <code>ui/</code>의 컴포넌트는 파일 경로가 아니라 폴더의 barrel을 거쳐 import합니다. 페이지에서는{" "}
                  <code>AutoClose</code>를 이렇게 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/signin/done.tsx"
            code={`import { AutoClose } from "@apps/myapp/ui";
import { page } from "akanjs/client";

export default page().render(() => <AutoClose timeout={1000} />);`}
          />
          <div>
            {l.trans({
              en: "What each kind of file in ui/ turns into at the import site:",
              ko: "ui/의 파일 종류마다 import하는 쪽에서는 이렇게 보입니다:",
            })}
          </div>
          <Docs.Table columns={importColumns} rows={importRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Top-level PascalCase names only.</strong> A file or folder directly under <code>ui/</code>{" "}
                    with a PascalCase name is exported; a camelCase sidecar stays private.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>맨 위의 PascalCase 이름만.</strong> <code>ui/</code> 바로 아래에 있는 PascalCase 파일과
                    폴더만 export되고, camelCase 보조 파일은 밖으로 나가지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never edit <code>ui/index.ts</code>.
                    </strong>{" "}
                    Add or rename the component file; <code>akan start</code> updates the barrel on save, and{" "}
                    <code>akan sync</code> does it otherwise.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>ui/index.ts</code>는 고치지 않습니다.
                    </strong>{" "}
                    컴포넌트 파일을 추가하거나 이름을 바꾸세요. <code>akan start</code> 중에는 저장할 때 barrel이
                    갱신되고, 그 밖에는 <code>akan sync</code>를 실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No deep paths.</strong> <code>@apps/myapp/ui/AutoClose</code> goes past the barrel, and lint
                    rejects it in pages and module files.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>깊은 경로는 쓰지 않습니다.</strong> <code>@apps/myapp/ui/AutoClose</code>는 barrel을
                    건너뛰는 경로라서, 페이지와 모듈 파일에서는 lint 오류입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="composite-components" title={l.trans({ en: "Composite Components", ko: "묶음 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Composite Components", ko: "묶음 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Some components read better as one grouped name, such as <code>Only.Admin</code> or{" "}
                  <code>Only.Web</code>. Give them a folder whose <code>index.tsx</code> exports that one name.
                </span>
              ),
              ko: (
                <span>
                  <code>Only.Admin</code>, <code>Only.Web</code>처럼 이름 하나로 묶어야 더 잘 읽히는 컴포넌트가
                  있습니다. 이런 컴포넌트는 폴더를 만들고, 그 폴더의 <code>index.tsx</code>에서 이름 하나로
                  export합니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Each member is an ordinary component file. <code>Web</code> reads the store, so it is a client file:
                </span>
              ),
              ko: (
                <span>
                  멤버는 각각 평범한 컴포넌트 파일입니다. <code>Web</code>은 store를 읽으므로 클라이언트 파일입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/ui/Only/Web.tsx"
            code={`"use client";
import { st } from "@libs/shared/client";
import type { ReactNode } from "react";

interface WebProps {
  children: ReactNode;
}
export const Web = ({ children }: WebProps) => {
  const innerWidth = st.use.innerWidth({ agent: false });
  return innerWidth > 768 ? children : null;
};`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The folder's <code>index.tsx</code> gathers the members into one object, with no{" "}
                  <code>{'"use client"'}</code>:
                </span>
              ),
              ko: (
                <span>
                  폴더의 <code>index.tsx</code>는 멤버를 객체 하나로 모으고, <code>{'"use client"'}</code>를 달지
                  않습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/ui/Only/index.tsx"
            code={`import { Admin } from "./Admin";
import { Dev } from "./Dev";
import { Mobile } from "./Mobile";
import { Show } from "./Show";
import { User } from "./User";
import { Web } from "./Web";

export const Only = {
  Admin,
  Mobile,
  Show,
  User,
  Web,
  Dev,
};`}
          />
          <div>
            {l.trans({
              en: "A page imports the one name and picks a member:",
              ko: "페이지는 이름 하나를 import하고 멤버를 골라 씁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/_index.tsx"
            code={`import { usePage } from "@apps/myapp/client";
import { HomeHeader } from "@apps/myapp/ui";
import { Only } from "@libs/shared/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  return (
    <Only.Web>
      <HomeHeader title={l.trans({ en: "Welcome", ko: "환영합니다" })} />
    </Only.Web>
  );
});`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{"{ agent: false }"}</code> keeps the width private.
                    </strong>{" "}
                    The component still subscribes to <code>innerWidth</code>, but the in-page agent cannot read it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{"{ agent: false }"}</code>는 너비를 감춥니다.
                    </strong>{" "}
                    컴포넌트는 <code>innerWidth</code>를 그대로 구독하지만, 인페이지 에이전트는 이 값을 읽지 못합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      This <code>index.tsx</code> is yours.
                    </strong>{" "}
                    Unlike the generated <code>ui/index.ts</code>, a folder's namespace file is ordinary source you
                    write and edit.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      이 <code>index.tsx</code>는 직접 쓰는 파일입니다.
                    </strong>{" "}
                    자동으로 만들어지는 <code>ui/index.ts</code>와 달리, 폴더의 묶음 파일은 직접 작성하고 고치는 평범한
                    소스입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Never build the namespace in a <code>{'"use client"'}</code> file.
                  </strong>{" "}
                  A server component receives each export of a client file as one opaque stub, so the whole{" "}
                  <code>Only</code> object arrives as a single stub and <code>Only.Web</code> reads{" "}
                  <code>undefined</code>. Keep the directive on the members and build the object in a directive-free{" "}
                  <code>index.tsx</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    묶음 객체를 <code>{'"use client"'}</code> 파일에서 만들지 마세요.
                  </strong>{" "}
                  서버 컴포넌트는 클라이언트 파일의 export를 각각 속을 볼 수 없는 스텁(stub) 하나로 받으므로,{" "}
                  <code>Only</code> 객체 전체가 스텁 하나가 되어 <code>Only.Web</code>은 <code>undefined</code>가
                  됩니다. <code>{'"use client"'}</code>는 멤버 파일에만 달고, 객체는 이 줄이 없는 <code>index.tsx</code>
                  에서 만드세요.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>
            {l.trans({ en: "Heavy components: the index_.tsx pair", ko: "무거운 컴포넌트: index_.tsx 쌍" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A chart, map or editor pulls in a large package that often touches <code>window</code> on import.
                  Split the folder's entry into two files. First, <code>index_.tsx</code> loads the members with{" "}
                  <code>lazy()</code>:
                </span>
              ),
              ko: (
                <span>
                  차트, 지도, 에디터는 import하는 순간 <code>window</code>를 건드리기 쉬운 큰 패키지를 끌고 옵니다. 이럴
                  때는 폴더의 진입 파일을 둘로 나눕니다. 먼저 <code>index_.tsx</code>가 멤버를 <code>lazy()</code>로
                  불러옵니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/util/ui/Chart/index_.tsx"
            code={`"use client";
import { Loading } from "akanjs/ui";
import { lazy } from "akanjs/webkit";

export const Bar = lazy(() => import("./Bar"), {
  ssr: false,
  loading: () => <Loading.Skeleton />,
});
export const Line = lazy(() => import("./Line"), {
  ssr: false,
  loading: () => <Loading.Skeleton />,
});`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Then <code>index.tsx</code>, with no directive, builds the namespace the rest of the app imports:
                </span>
              ),
              ko: (
                <span>
                  그다음 <code>{'"use client"'}</code>가 없는 <code>index.tsx</code>가 앱의 다른 파일이 import할 묶음을
                  만듭니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/util/ui/Chart/index.tsx"
            code={`import { Bar, Line } from "./index_";

export const Chart = { Bar, Line };`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>ssr: false</code> for browser-only packages.
                    </strong>{" "}
                    The server renders the <code>loading</code> fallback, and the real chart mounts in the browser.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      브라우저 전용 패키지에는 <code>ssr: false</code>.
                    </strong>{" "}
                    서버는 <code>loading</code> 대체 화면을 그리고, 실제 차트는 브라우저에서 마운트됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>lazy()</code> targets use <code>export default</code>.
                    </strong>{" "}
                    <code>./Bar</code> exports its component as the module default.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>lazy()</code> 대상은 <code>export default</code>를 씁니다.
                    </strong>{" "}
                    <code>./Bar</code>는 컴포넌트를 모듈의 default로 export합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the two files apart.</strong> Merging them puts the namespace in a client file, which
                    breaks for the reason in the warning above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 파일을 합치지 않습니다.</strong> 합치면 묶음이 클라이언트 파일에 들어가서, 위 경고와 같은
                    이유로 깨집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One file, one export, one name.</strong> <code>AutoClose.tsx</code> exports{" "}
                    <code>AutoClose</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일 하나, export 하나, 같은 이름.</strong> <code>AutoClose.tsx</code>는{" "}
                    <code>AutoClose</code>를 export합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep app ui/ shallow.</strong> Add a folder only when the components are naturally a grouped
                    API such as <code>Only.Web</code> or <code>Only.Admin</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱 ui/는 얕게.</strong> <code>Only.Web</code>, <code>Only.Admin</code>처럼 자연스럽게 묶이는
                    API일 때만 폴더를 만듭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Import from the barrel.</strong> Use <code>@apps/myapp/ui</code> or{" "}
                    <code>@libs/shared/ui</code>, never a path into a file.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>barrel에서 import.</strong> 파일까지 들어가는 경로 대신 <code>@apps/myapp/ui</code>나{" "}
                    <code>@libs/shared/ui</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Server first.</strong> Add <code>{'"use client"'}</code> only for a hook, an event handler,
                    the store, a browser global or a client-only package.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서버가 먼저.</strong> <code>{'"use client"'}</code>는 hook, 이벤트 핸들러, store, 브라우저
                    전역 객체, 클라이언트 전용 패키지를 쓸 때만 답니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
          <Docs.Table columns={mistakeColumns} rows={mistakeRows} />

          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 문서" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/arch/frontend#client-boundary",
                title: l.trans({ en: "What Earns A Client Component", ko: "클라이언트 컴포넌트는 꼭 필요할 때만" }),
                desc: l.trans({
                  en: 'The five features that need "use client", and everything that does not.',
                  ko: '"use client"가 필요한 다섯 가지 기능과, 필요 없는 나머지 전부입니다.',
                }),
              },
              {
                href: "/cheatsheet/performance/lazy#external",
                title: l.trans({ en: "Lazy Loading", ko: "지연 로딩" }),
                desc: l.trans({
                  en: "The `index_.tsx` pair step by step, with a map widget.",
                  ko: "지도 위젯 예제로 `index_.tsx` 쌍을 단계별로 만듭니다.",
                }),
              },
              {
                href: "/docs/arch/ui-recipe#app-recipes",
                title: l.trans({ en: "App-Level Recipes", ko: "앱 레벨 레시피" }),
                desc: l.trans({
                  en: "How to add a look to `ui/Recipe/` instead of copying classes.",
                  ko: "클래스를 복사하는 대신 `ui/Recipe/`에 모양을 추가하는 법입니다.",
                }),
              },
              {
                href: "/conventions/module/unit",
                title: "Model.Unit.tsx",
                desc: l.trans({
                  en: "Where a component that takes one model goes instead.",
                  ko: "모델 하나를 받는 컴포넌트는 여기에 둡니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
