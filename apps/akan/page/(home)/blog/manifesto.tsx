import { usePage } from "@apps/akan/client";

const principles = [
  {
    title: { en: "Write the business once", ko: "비즈니스를 한 번만 쓴다" },
    desc: {
      en: "A page, signal, service, store, document, and deployment artifact should not each need a separate explanation of the same intent.",
      ko: "page, signal, service, store, document, deployment artifact마다 같은 의도를 따로 설명하지 않아도 되어야 합니다.",
    },
  },
  {
    title: { en: "Reduce wiring", ko: "와이어링을 줄인다" },
    desc: {
      en: "Framework work should make product work smaller, not ask teams to spend their best hours connecting tools together.",
      ko: "프레임워크는 제품 개발을 작게 만들어야지, 팀의 가장 좋은 시간을 도구 연결에 쓰게 해서는 안 됩니다.",
    },
  },
  {
    title: { en: "Make style a shared language", ko: "스타일을 공용 언어로 만든다" },
    desc: {
      en: "When every module follows a familiar shape, code written by another person or agent reads like code from your own hand.",
      ko: "모든 모듈이 익숙한 형태를 따르면 다른 사람이나 에이전트가 쓴 코드도 내가 쓴 코드처럼 읽힙니다.",
    },
  },
];

const timeline = [
  {
    year: "2021",
    title: { en: "A meta-framework begins", ko: "메타프레임워크로 시작" },
    desc: {
      en: "Akan.js started by composing Nx, NestJS, Next.js, Webpack, and other proven tools into one product-oriented workspace.",
      ko: "Akan.js는 Nx, NestJS, Next.js, Webpack 등 검증된 도구들을 하나의 제품 중심 workspace로 엮는 방식에서 시작했습니다.",
    },
  },
  {
    year: "2021-2024",
    title: { en: "Conventions tested in real apps", ko: "실제 앱으로 검증한 컨벤션" },
    desc: {
      en: "For four years, dozens of business applications were built and operated on top of those conventions until common service patterns became clear.",
      ko: "4년 동안 수십 개의 비즈니스 앱을 개발하고 운영하며 실제 서비스에서 반복되는 패턴을 컨벤션으로 다듬었습니다.",
    },
  },
  {
    year: "2025",
    title: { en: "The lower framework moves into Akan", ko: "하단 프레임워크를 Akan으로 흡수" },
    desc: {
      en: "Akan.js began replacing the lower framework layers so the runtime, data layer, API surface, and developer experience could be designed as one system.",
      ko: "Akan.js는 하단 프레임워크 계층을 직접 대체하기 시작했고, runtime, data layer, API surface, developer experience를 하나의 시스템으로 설계할 수 있게 되었습니다.",
    },
  },
];

export default function Page() {
  const { l } = usePage();

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
        <header>
          <div className="mb-12 flex items-center justify-between gap-4">
            <p className="font-semibold text-base-content/50 text-sm uppercase tracking-[0.2em]">
              {l.trans({ en: "Akan.js Manifesto", ko: "Akan.js Manifesto" })}
            </p>
          </div>

          <p className="mb-4 text-base-content/50 text-sm">
            {l.trans({ en: "Why we build Akan.js", ko: "왜 Akan.js를 만드는가" })}
          </p>
          <h1 className="font-black text-4xl leading-tight tracking-tight md:text-5xl">
            {l.trans({
              en: "Developers should spend their lives on work that matters",
              ko: "개발자는 중요한 일에 인생을 써야 한다",
            })}
          </h1>
          <p className="mt-6 text-base-content/70 text-lg leading-8">
            {l.trans({
              en: "Akan.js exists because modern software teams lose too much time to project boundaries, duplicated source code, framework glue, and style mismatches. We want one clear way to describe a business and let the system carry that intent across web, app-oriented clients, servers, databases, and deployment.",
              ko: "Akan.js는 현대 소프트웨어 팀이 프로젝트 경계, 중복된 소스코드, 프레임워크 접착 작업, 서로 다른 코딩 스타일에 너무 많은 시간을 잃고 있다는 문제의식에서 출발했습니다. 우리는 비즈니스를 설명하는 하나의 명확한 방법을 만들고, 그 의도가 web, app-oriented client, server, database, deployment까지 흐르게 하고 싶습니다.",
            })}
          </p>
        </header>

        <section className="mt-12 rounded-3xl bg-base-200 p-6 md:p-8">
          <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
            {l.trans({ en: "The problem", ko: "문제의식" })}
          </p>
          <h2 className="mt-3 font-bold text-2xl">
            {l.trans({ en: "Too much work is not product work", ko: "너무 많은 일이 제품을 위한 일이 아니다" })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "A business usually needs a frontend, backend, database model, mobile surface, admin screen, deployment pipeline, test setup, and monitoring path. The intent is often the same, but each layer asks developers to repeat it in a different language.",
                ko: "하나의 비즈니스에는 보통 frontend, backend, database model, mobile surface, admin screen, deployment pipeline, test setup, monitoring path가 필요합니다. 의도는 같은데 각 계층은 개발자에게 그것을 다른 언어로 반복해서 설명하라고 요구합니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "As teams grow, style differences become another hidden tax. People spend time asking where code should live, how a feature should be named, how data should move, and why another module looks different from the one they just touched.",
                ko: "팀이 커질수록 코딩 스타일의 차이는 또 다른 숨은 비용이 됩니다. 사람들은 코드가 어디에 있어야 하는지, 기능 이름을 어떻게 붙여야 하는지, 데이터가 어떻게 이동해야 하는지, 왜 방금 본 모듈과 다른 모듈의 모양이 다른지 묻는 데 시간을 씁니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "That time has a human cost. Developers should not waste evenings and vacations on avoidable wiring and configuration. We should do the necessary work well, then go live our lives.",
                ko: "그 시간에는 인간적인 비용이 있습니다. 개발자는 피할 수 있는 와이어링과 설정 때문에 밤과 휴가를 낭비해서는 안 됩니다. 필요한 일을 제대로 하고, 그 다음에는 우리의 삶을 살아야 합니다.",
              })}
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">
            {l.trans({ en: "Convention is a communication tool", ko: "컨벤션은 의사소통 도구다" })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "Ruby on Rails gave the industry a powerful phrase: convention over configuration. Akan.js takes that idea seriously for both human programmers and AI coding agents.",
                ko: "Ruby on Rails는 업계에 convention over configuration이라는 강력한 문장을 남겼습니다. Akan.js는 이 개념이 인간 프로그래머와 AI 코딩 에이전트 모두에게 필요하다고 봅니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "When a workspace is shaped by shared rules, communication gets cheaper. A service, signal, document, store, and page each have a known role. You can open an unfamiliar feature and still know where to start.",
                ko: "workspace가 공유된 규칙으로 정렬되어 있으면 의사소통 비용이 줄어듭니다. service, signal, document, store, page는 각자의 역할을 갖습니다. 낯선 기능을 열어도 어디서 시작해야 하는지 알 수 있습니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "For AI agents, convention is even more direct leverage. Predictable files and contracts reduce search space, lower error rates, and save tokens because the agent can infer the next shape from the existing one.",
                ko: "AI 에이전트에게 컨벤션은 더 직접적인 레버리지입니다. 예측 가능한 파일과 계약은 탐색 공간을 줄이고, 오류율을 낮추며, 기존 형태에서 다음 형태를 추론할 수 있게 해 토큰 사용량을 크게 줄입니다.",
              })}
            </p>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {principles.map((principle) => (
            <div key={principle.title.en} className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
              <h3 className="font-bold text-lg">{l.trans(principle.title)}</h3>
              <p className="mt-3 text-base-content/70 text-sm leading-6">{l.trans(principle.desc)}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">
            {l.trans({ en: "From meta-framework to runtime", ko: "메타프레임워크에서 런타임으로" })}
          </h2>
          <div className="mt-6 space-y-4">
            {timeline.map((item) => (
              <div key={item.year} className="rounded-2xl bg-base-200 p-5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-black text-2xl text-primary">{item.year}</span>
                  <h3 className="font-bold text-lg">{l.trans(item.title)}</h3>
                </div>
                <p className="mt-3 text-base-content/70 leading-7">{l.trans(item.desc)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-primary border-l-4 pl-5">
          <h2 className="font-bold text-2xl">
            {l.trans({ en: "What Akan.js is trying to protect", ko: "Akan.js가 지키려는 것" })}
          </h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "Akan.js is not only a faster stack or a different folder rule. It is an attempt to protect developer attention. Source code should be reusable, business intent should stay unified, and product teams should not burn their lives on accidental complexity.",
              ko: "Akan.js는 단지 더 빠른 스택이나 다른 폴더 규칙이 아닙니다. 개발자의 주의력을 지키려는 시도입니다. 소스코드는 재사용 가능해야 하고, 비즈니스 의도는 통합되어 있어야 하며, 제품 팀은 우연한 복잡성 때문에 삶을 태워서는 안 됩니다.",
            })}
          </p>
        </section>
      </article>
    </main>
  );
}
