import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="workspace-anatomy" title={l.trans({ en: "Workspace Anatomy", ko: "워크스페이스 구조" })}>
        <Docs.Title>{l.trans({ en: "Workspace Anatomy", ko: "워크스페이스 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An Akan workspace is a Bun-first monorepo. At the workspace root, the first-level entries tell you whether something is a runnable app, shared product library, framework package, or root tooling config.",
              ko: "Akan 워크스페이스는 Bun-first 모노레포입니다. 워크스페이스 루트의 1-depth 항목은 해당 코드가 실행 가능한 앱인지, 공유 제품 라이브러리인지, 프레임워크 패키지인지, 루트 도구 설정인지 알려줍니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Workspace root"
          language="bash"
          code={`.
├── apps/
├── libs/
├── pkgs/
├── biome.json
└── bunfig.toml`}
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              name: "apps/",
              desc: l.trans({
                en: "Runnable and deployable products. Put customer sites, admin portals, brand apps, and app-specific business code here.",
                ko: "실행 및 배포 가능한 제품입니다. 고객 사이트, 관리자 포털, 브랜드 앱, 앱 전용 비즈니스 코드를 여기에 둡니다.",
              }),
            },
            {
              name: "libs/",
              desc: l.trans({
                en: "Shared product libraries used by multiple apps. Put common domains, utilities, UI, auth, upload, billing, or notification features here.",
                ko: "여러 앱이 함께 사용하는 공유 제품 라이브러리입니다. 공통 도메인, 유틸리티, UI, 인증, 업로드, 결제, 알림 기능을 여기에 둡니다.",
              }),
            },
            {
              name: "pkgs/",
              desc: l.trans({
                en: "Framework, CLI, devkit, runtime, and package-level tooling. Use this when code belongs to Akan itself or should behave like an installable package.",
                ko: "프레임워크, CLI, devkit, runtime, 패키지 수준 도구 코드입니다. Akan 자체에 속하거나 설치 가능한 패키지처럼 동작해야 하는 코드를 여기에 둡니다.",
              }),
            },
            {
              name: "biome.json",
              desc: l.trans({
                en: "Repo-wide formatting and linting rules. This keeps TypeScript, JSX, imports, and style decisions consistent across apps, libs, and pkgs.",
                ko: "레포 전체 포맷과 린트 규칙입니다. apps, libs, pkgs 전반의 TypeScript, JSX, import, 스타일 결정을 일관되게 유지합니다.",
              }),
            },
            {
              name: "bunfig.toml",
              desc: l.trans({
                en: "Bun runtime and package manager configuration used by workspace commands and package workflows.",
                ko: "workspace command와 package workflow에서 사용하는 Bun 런타임 및 패키지 매니저 설정입니다.",
              }),
            },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="workspace-commands" title={l.trans({ en: "Workspace Commands", ko: "워크스페이스 명령" })}>
        <Docs.Title>{l.trans({ en: "Workspace Commands", ko: "워크스페이스 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Workspace commands operate at the monorepo level. They help you create a workspace, lint one target, lint the whole workspace, or sync dependencies and configuration across apps and libraries.",
              ko: "워크스페이스 명령은 모노레포 수준에서 동작합니다. 워크스페이스 생성, 특정 대상 린트, 전체 린트, 앱과 라이브러리 전반의 의존성/설정 동기화를 돕습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Workspace command examples"
          language="bash"
          code={`akan create-application
akan create-library
akan create-package
akan lint <app/lib/pkg-name>
akan lintAll`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
