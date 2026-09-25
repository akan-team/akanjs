import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="ui-overview" title={l.trans({ en: "UI Folder Overview", ko: "UI 폴더 개요" })}>
        <Docs.Title>{l.trans({ en: "UI Folder Overview", ko: "UI 폴더 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The ui folder contains reusable interface components for an app or library. App UI folders usually stay shallow, like @apps/myapp/ui, while libraries can expose shared components such as @libs/shared/ui.",
              ko: "ui 폴더는 앱이나 라이브러리에서 재사용하는 인터페이스 컴포넌트를 담습니다. 앱 UI 폴더는 보통 @apps/myapp/ui처럼 얕게 유지하고, 라이브러리는 @libs/shared/ui처럼 공유 컴포넌트를 제공합니다.",
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: l.trans({ en: "App UI", ko: "App UI" }),
                desc: l.trans({
                  en: "Use for components that belong to one app, such as an admin header, landing hero, dashboard widget, or app-only interaction.",
                  ko: "admin header, landing hero, dashboard widget처럼 특정 앱에 속한 컴포넌트에 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Library UI", ko: "Library UI" }),
                desc: l.trans({
                  en: "Use for components shared by multiple apps, such as auth gates, responsive wrappers, editor pieces, or common form fields.",
                  ko: "auth gate, responsive wrapper, editor 조각, 공통 form field처럼 여러 앱이 공유하는 컴포넌트에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="recommended-shape" title={l.trans({ en: "Recommended Shape", ko: "권장 구조" })}>
        <Docs.Title>{l.trans({ en: "Recommended Shape", ko: "권장 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The recommended rule is simple: one file, one export, and file name equals export name. This keeps the barrel predictable and makes import optimization work well.",
              ko: "권장 규칙은 단순합니다. 1개 파일은 1개 export를 가지고, 파일명은 export 이름과 같게 둡니다. 이렇게 하면 barrel이 예측 가능해지고 import optimization이 잘 동작합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/ui"
          language="bash"
          code={`apps/myapp/ui/
  AutoClose.tsx
  HomeHeader.tsx`}
        />
        <Code.Snippet
          title="AutoClose.tsx"
          code={`"use client";

import { useEffect } from "react";

interface AutoCloseProps {
  timeout?: number;
}

export const AutoClose = ({ timeout = 0 }: AutoCloseProps) => {
  useEffect(() => {
    setTimeout(() => window.close(), timeout);
  }, [timeout]);

  return null;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="barrel-optimization"
        title={l.trans({ en: "Barrel And Optimized Import", ko: "Barrel과 최적화 import" })}
      >
        <Docs.Title>{l.trans({ en: "Barrel And Optimized Import", ko: "Barrel과 최적화 import" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The ui folder is kept as a barrel folder. Pages import from the barrel, and Akan can optimize the import so a page only fetches the JavaScript bundle for the UI components it actually uses.",
              ko: "ui 폴더는 barrel folder로 유지합니다. 페이지는 barrel에서 import하고, Akan은 import를 최적화해서 페이지가 실제로 사용하는 UI 컴포넌트의 JavaScript bundle만 가져오도록 만들 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This matters in SSR. The server can render the page first, and the browser only hydrates the client components that are needed for that page instead of downloading a large shared UI bundle.",
              ko: "이 점은 SSR에서 중요합니다. 서버가 먼저 페이지를 렌더링하고, 브라우저는 큰 shared UI bundle 전체가 아니라 해당 페이지에 필요한 client component만 hydrate할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="index.ts"
          code={`export { AutoClose } from "./AutoClose";
export { HomeHeader } from "./HomeHeader";
export { Metrics } from "./Metrics";
export { StepBox } from "./StepBox";`}
        />
        <Code.Snippet
          title="page.tsx"
          code={`import { AutoClose } from "@apps/myapp/ui";

export default function Page() {
  return <AutoClose timeout={1000} />;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="composite-components" title={l.trans({ en: "Composite Components", ko: "Composite 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Composite Components", ko: "Composite 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some UI APIs are easier to use as a grouped object. In that case, use a folder with an index file and export one composite name from the library barrel, such as Only.Admin or Only.Web.",
              ko: "일부 UI API는 묶인 객체로 사용하는 편이 더 자연스럽습니다. 이 경우 폴더와 index 파일을 사용하고, library barrel에서는 Only.Admin 또는 Only.Web처럼 하나의 composite 이름으로 export합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Only/Web.tsx"
            code={`"use client";

import { st } from "@libs/shared/client";
import type { ReactNode } from "react";

interface WebProps {
  children: ReactNode;
}

export const Web = ({ children }: WebProps) => {
  const innerWidth = st.use.innerWidth();
  return innerWidth > 768 ? children : null;
};`}
          />
          <Code.Snippet
            title="Only/index.tsx"
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
          <Code.Snippet title="libs/shared/ui/index.ts" code={`export { Only } from "./Only";`} />
          <Code.Snippet
            title="page.tsx"
            code={`import { Only } from "@libs/shared/ui";

export default function Page() {
  return <Only.Web>Desktop content</Only.Web>;
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Prefer one file, one export, and matching names such as AutoClose.tsx exporting AutoClose.",
                ko: "AutoClose.tsx가 AutoClose를 export하는 것처럼 1개 파일, 1개 export, 같은 이름을 우선합니다.",
              }),
              l.trans({
                en: "Keep app UI folders shallow unless a component is naturally a grouped API.",
                ko: "컴포넌트가 자연스럽게 묶인 API가 아니라면 app UI 폴더는 얕게 유지합니다.",
              }),
              l.trans({
                en: "Import from the ui barrel, not from deep component paths, so Akan can optimize the import.",
                ko: "Akan이 import를 최적화할 수 있도록 깊은 component 경로 대신 ui barrel에서 import합니다.",
              }),
              l.trans({
                en: "Use composite folders for APIs that read well as a namespace, such as Only.Web or Only.Admin.",
                ko: "Only.Web 또는 Only.Admin처럼 namespace로 읽히는 API에는 composite folder를 사용합니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
