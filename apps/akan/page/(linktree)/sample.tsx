import { getEnv } from "akanjs/base";
import { usePage } from "akanjs/client";
import { Link, System } from "akanjs/ui";
import {
  FaBookOpen,
  FaBoxOpen,
  FaCheckCircle,
  FaCodeBranch,
  FaExternalLinkAlt,
  FaLayerGroup,
  FaRocket,
  FaShieldAlt,
  FaTerminal,
} from "react-icons/fa";

export default function Page() {
  const appName = getEnv().appName;
  const { l } = usePage();
  return (
    <main className="relative min-h-screen overflow-hidden bg-base-100 text-base-content">
      <div className="absolute -top-48 -left-48 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -right-40 -bottom-56 h-112 w-md rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-base-100 shadow-lg shadow-primary/20">
              <img
                src="/logo.png"
                alt={l.trans({ en: "Akan.js logo", ko: "Akan.js 로고" })}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="font-semibold text-primary text-sm tracking-[0.25em]">Akan.js</p>
              <p className="text-base-content/60 text-xs">
                {l.trans({ en: "Full-stack TypeScript framework", ko: "풀스택 타입스크립트 프레임워크" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <System.ThemeToggle themes={["light", "dark"]} />
            <System.SelectLanguage languages={["en", "ko"]} />
            <Link href="https://akanjs.com" target="_blank">
              <button className="btn btn-sm border-base-content/10 bg-base-content/10 text-base-content hover:border-primary hover:bg-primary hover:text-base-100">
                {l.trans({ en: "Official Site", ko: "공식 사이트" })}
                <FaExternalLinkAlt />
              </button>
            </Link>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.04fr_0.96fr] lg:py-10">
          <div>
            <div className="badge mb-6 border-primary/20 bg-primary/10 px-4 py-3 text-primary">
              <FaCheckCircle />
              {l.trans({ en: "Your app is running", ko: "앱이 실행 중입니다" })}
            </div>
            <h1 className="max-w-4xl font-black text-5xl text-base-content tracking-tight sm:text-6xl lg:text-7xl">
              {l.trans({
                en: "Akan turns business intent into the whole product.",
                ko: "Akan은 비즈니스 의도를 제품 전체로 바꿉니다.",
              })}
            </h1>
            <p className="mt-6 max-w-2xl text-base-content/70 text-lg leading-8">
              {l.trans({
                en: "Agents Write. Keep It Minimal. Always Readable. Nice To Review. Build with less code, fewer repeated decisions, and a clearer path from idea to production.",
                ko: "Agents Write. Keep It Minimal. Always Readable. Nice To Review. 더 적은 코드, 더 적은 반복 결정, 더 선명한 출시 경로로 만드세요.",
              })}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="badge badge-lg border-base-content/10 bg-base-content/10 text-base-content">
                Agent-ready
              </span>
              <span className="badge badge-lg border-base-content/10 bg-base-content/10 text-base-content">
                Minimal code
              </span>
              <span className="badge badge-lg border-base-content/10 bg-base-content/10 text-base-content">
                Readable by default
              </span>
              <span className="badge badge-lg border-base-content/10 bg-base-content/10 text-base-content">
                Review-friendly
              </span>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="https://akanjs.com/docs/intro/quickstart" target="_blank">
                <button className="btn border-none bg-primary text-base-100 hover:bg-primary/80">
                  {l.trans({ en: "Read Quick Start", ko: "빠른 시작 읽기" })}
                  <FaBookOpen />
                </button>
              </Link>
              <Link href="https://akanjs.com/docs/intro/practice" target="_blank">
                <button className="btn border-base-content/10 bg-base-content/10 text-base-content hover:border-base-content/20 hover:bg-base-content/15">
                  {l.trans({ en: "Learn By Building", ko: "만들면서 배우기" })}
                  <FaCodeBranch />
                </button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rotate-3 rounded-4xl bg-primary/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-4xl border border-base-content/10 bg-base-content/6 p-5 shadow-2xl backdrop-blur">
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-base-content/10 bg-base-100/70 px-4 py-3">
                <div>
                  <p className="text-base-content/40 text-xs uppercase tracking-[0.24em]">
                    {l.trans({ en: "Akan Acrostic", ko: "Akan 사행시" })}
                  </p>
                  <p className="font-semibold text-base-content text-lg">
                    {l.trans({ en: "A framework for focused builders", ko: "집중하는 빌더를 위한 프레임워크" })}
                  </p>
                </div>
                <div className="rounded-xl bg-primary/10 px-3 py-2 font-medium text-primary text-sm">{appName}</div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-base-content/10 bg-base-100/80 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-base-100 font-black text-primary text-xl">
                      A
                    </div>
                    <div>
                      <p className="font-bold text-base-content">Agents Write</p>
                      <p className="mt-1 text-base-content/60 text-sm leading-6">
                        {l.trans({
                          en: "Business definitions become the source code, so teams and agents can focus on what to build.",
                          ko: "비즈니스 정의가 소스 코드가 되므로, 팀과 에이전트는 무엇을 만들지에 집중할 수 있습니다.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-base-content/10 bg-base-100/80 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-base-100 font-black text-primary text-xl">
                      K
                    </div>
                    <div>
                      <p className="font-bold text-base-content">Keep It Minimal</p>
                      <p className="mt-1 text-base-content/60 text-sm leading-6">
                        {l.trans({
                          en: "One definition flows into web, app, server, database, and infrastructure without repeated logic.",
                          ko: "하나의 정의가 반복 로직 없이 웹, 앱, 서버, 데이터베이스, 인프라로 이어집니다.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-base-content/10 bg-base-100/80 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-base-100 font-black text-primary text-xl">
                      A
                    </div>
                    <div>
                      <p className="font-bold text-base-content">Always Readable</p>
                      <p className="mt-1 text-base-content/60 text-sm leading-6">
                        {l.trans({
                          en: "Strict conventions keep the app easy to understand long after the first version ships.",
                          ko: "엄격한 컨벤션은 첫 버전 출시 후에도 앱을 쉽게 이해할 수 있게 지켜줍니다.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-base-content/10 bg-base-100/80 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-base-100 font-black text-primary text-xl">
                      N
                    </div>
                    <div>
                      <p className="font-bold text-base-content">Nice To Review</p>
                      <p className="mt-1 text-base-content/60 text-sm leading-6">
                        {l.trans({
                          en: "Focused changes make business intent clear, so reviews stay fast and releases stay calm.",
                          ko: "집중된 변경은 비즈니스 의도를 선명하게 만들어 리뷰를 빠르게 하고 배포를 안정적으로 유지합니다.",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mockup-code mt-5 border border-base-content/10 bg-base-100 text-sm shadow-none">
                <pre data-prefix="$">
                  <code className="text-primary">bun run akan start {appName}</code>
                </pre>
                <pre data-prefix="✓">
                  <code className="text-accent">
                    {l.trans({ en: "web, app, server, db, and infra ready", ko: "웹, 앱, 서버, DB, 인프라 준비 완료" })}
                  </code>
                </pre>
                <pre data-prefix="→">
                  <code className="text-base-content/70">
                    {l.trans({
                      en: "edit page/_index.tsx around your business",
                      ko: "비즈니스에 맞게 page/_index.tsx를 수정하세요",
                    })}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pb-8 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-base-content/10 bg-base-content/4 p-6 backdrop-blur">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl">
              <FaTerminal />
            </div>
            <h2 className="font-bold text-base-content text-lg">
              {l.trans({ en: "Agentic By Design", ko: "에이전틱 설계" })}
            </h2>
            <p className="mt-2 text-base-content/60 text-sm leading-6">
              {l.trans({
                en: "Describe the business once and let Akan shape the application surfaces around it.",
                ko: "비즈니스를 한 번 설명하면 Akan이 그 주변의 애플리케이션 표면을 구성합니다.",
              })}
            </p>
          </div>
          <div className="rounded-3xl border border-base-content/10 bg-base-content/4 p-6 backdrop-blur">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl">
              <FaLayerGroup />
            </div>
            <h2 className="font-bold text-base-content text-lg">
              {l.trans({ en: "One Definition", ko: "하나의 정의" })}
            </h2>
            <p className="mt-2 text-base-content/60 text-sm leading-6">
              {l.trans({
                en: "Pages, services, database models, and deployment artifacts stay connected in one workspace.",
                ko: "페이지, 서비스, 데이터베이스 모델, 배포 산출물이 하나의 워크스페이스에서 연결됩니다.",
              })}
            </p>
          </div>
          <div className="rounded-3xl border border-base-content/10 bg-base-content/4 p-6 backdrop-blur">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl">
              <FaRocket />
            </div>
            <h2 className="font-bold text-base-content text-lg">
              {l.trans({ en: "Less To Review", ko: "리뷰할 것이 적습니다" })}
            </h2>
            <p className="mt-2 text-base-content/60 text-sm leading-6">
              {l.trans({
                en: "Smaller code surfaces make intent easier to inspect, approve, and ship.",
                ko: "더 작은 코드 표면은 의도를 확인하고 승인하고 배포하기 쉽게 만듭니다.",
              })}
            </p>
          </div>
          <div className="rounded-3xl border border-base-content/10 bg-base-content/4 p-6 backdrop-blur">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl">
              <FaShieldAlt />
            </div>
            <h2 className="font-bold text-base-content text-lg">
              {l.trans({ en: "Type-Safe Growth", ko: "타입 안전한 성장" })}
            </h2>
            <p className="mt-2 text-base-content/60 text-sm leading-6">
              {l.trans({
                en: "Conventions and contracts keep the stack readable as the product expands.",
                ko: "컨벤션과 계약은 제품이 확장되어도 스택을 읽기 쉽게 유지합니다.",
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-base-content/10 bg-base-content/4 p-5 text-base-content/70 text-sm md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <FaTerminal className="text-primary" />
            <span>
              {l.trans({
                en: "Next: define the business once, then let Akan carry it across every surface.",
                ko: "다음 단계: 비즈니스를 한 번 정의하고, Akan이 모든 표면으로 이어가게 하세요.",
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-base-content/40">
            <FaBoxOpen />
            <span>{l.trans({ en: "Akan.js template", ko: "Akan.js 템플릿" })}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
