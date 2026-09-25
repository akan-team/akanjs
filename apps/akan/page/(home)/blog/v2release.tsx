import { usePage } from "@apps/akan/client";

const changes = [
  {
    title: { en: "One runtime: Bun", ko: "하나의 런타임: Bun" },
    desc: {
      en: "Akan.js v2 removes the split between Node-based tools and Bun-based execution. The framework, CLI, server runtime, test path, and package workflow now share the same foundation.",
      ko: "Akan.js v2는 Node 기반 도구와 Bun 기반 실행 사이의 분리를 제거했습니다. framework, CLI, server runtime, test path, package workflow가 같은 기반 위에서 움직입니다.",
    },
  },
  {
    title: { en: "Framework layers move inside Akan", ko: "프레임워크 계층을 Akan 내부로" },
    desc: {
      en: "Instead of coordinating NestJS, Next.js, Vite, and other layers from the outside, v2 owns the lower framework path so user-facing behavior can be simpler and more consistent.",
      ko: "NestJS, Next.js, Vite 등 여러 계층을 바깥에서 조율하는 대신, v2는 하단 프레임워크 경로를 직접 소유해 사용자 경험을 더 단순하고 일관되게 만들었습니다.",
    },
  },
  {
    title: { en: "SQLite-first data", ko: "SQLite 우선 데이터 계층" },
    desc: {
      en: "MongoDB powered v1, but v2 starts from SQLite. With WAL mode and modern deployment options, SQLite is often the most practical first database for early and mid-stage services.",
      ko: "v1은 MongoDB를 사용했지만 v2는 SQLite에서 시작합니다. WAL mode와 현대적인 배포 선택지를 고려하면 SQLite는 초/중기 서비스의 첫 데이터베이스로 가장 현실적인 선택인 경우가 많습니다.",
    },
  },
];

const migrationNotes = [
  {
    label: { en: "v1", ko: "v1" },
    items: [
      {
        en: "NestJS and Next.js shaped much of the server and web experience.",
        ko: "NestJS와 Next.js가 server와 web 경험의 많은 부분을 구성했습니다.",
      },
      {
        en: "Vite and Node.js ecosystem assumptions were part of the operating model.",
        ko: "Vite와 Node.js 생태계의 전제가 운영 모델에 포함되어 있었습니다.",
      },
      {
        en: "MongoDB was the default document database choice.",
        ko: "MongoDB가 기본 document database 선택지였습니다.",
      },
    ],
  },
  {
    label: { en: "v2", ko: "v2" },
    items: [
      { en: "Bun is the required runtime and package foundation.", ko: "Bun이 필수 runtime이자 package 기반입니다." },
      {
        en: "Akan replaces more lower framework behavior directly.",
        ko: "Akan이 더 많은 하단 프레임워크 동작을 직접 대체합니다.",
      },
      {
        en: "SQLite becomes the first-class local and service database path.",
        ko: "SQLite가 local 및 service database의 우선 경로가 됩니다.",
      },
    ],
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
              {l.trans({ en: "Akan.js v2", ko: "Akan.js v2" })}
            </p>
          </div>

          <p className="mb-4 text-base-content/50 text-sm">{l.trans({ en: "Release note", ko: "릴리즈 노트" })}</p>
          <h1 className="font-black text-4xl leading-tight tracking-tight md:text-5xl">
            {l.trans({ en: "Akan.js v2 is here", ko: "Akan.js v2가 나왔습니다" })}
          </h1>
          <p className="mt-6 text-base-content/70 text-lg leading-8">
            {l.trans({
              en: "Version 2 is the release where Akan.js stops being a wrapper around many lower frameworks and becomes a Bun-first full-stack runtime. The goal is a more consistent developer experience: fewer moving parts, fewer duplicated assumptions, and one runtime path from local development to production builds.",
              ko: "버전 2는 Akan.js가 여러 하단 프레임워크를 감싸는 구조를 넘어 Bun-first 풀스택 런타임으로 전환한 릴리즈입니다. 목표는 더 일관된 개발자 경험입니다. 움직이는 부품을 줄이고, 중복된 전제를 줄이고, 로컬 개발부터 production build까지 하나의 runtime path를 갖는 것입니다.",
            })}
          </p>
        </header>

        <section className="mt-12 grid gap-4">
          {changes.map((change) => (
            <div key={change.title.en} className="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm">
              <h2 className="font-bold text-2xl">{l.trans(change.title)}</h2>
              <p className="mt-3 text-base-content/70 leading-7">{l.trans(change.desc)}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-3xl bg-base-200 p-6 md:p-8">
          <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
            {l.trans({ en: "Why Bun-only", ko: "왜 Bun-only인가" })}
          </p>
          <h2 className="mt-3 font-bold text-2xl">
            {l.trans({ en: "A clear runtime is part of the product", ko: "명확한 런타임은 제품의 일부다" })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "Akan.js v1 operated on top of NestJS, Next.js, and Vite. That gave the project reach, but it also meant Akan had to negotiate with multiple framework lifecycles, build systems, and runtime assumptions.",
                ko: "Akan.js v1은 NestJS, Next.js, Vite 위에서 운영되었습니다. 그 덕분에 빠르게 넓은 범위를 다룰 수 있었지만, 동시에 Akan은 여러 프레임워크의 lifecycle, build system, runtime assumption을 계속 조율해야 했습니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "In v2, we chose not to support the Node.js environment as a first-class runtime. That is a deliberate product decision. A framework that promises one way to build web, app-oriented clients, APIs, services, and data should also give teams one comfortable execution model.",
                ko: "v2에서는 Node.js 환경을 first-class runtime으로 지원하지 않기로 했습니다. 이것은 의도적인 제품 결정입니다. web, app-oriented client, API, service, data를 하나의 방식으로 만들겠다고 약속하는 프레임워크라면 실행 모델도 하나로 쾌적하게 제공해야 한다고 판단했습니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "Bun lets Akan own more of that experience directly: package installation, scripts, server execution, SQLite access, tests, and production artifacts can all align around the same toolchain.",
                ko: "Bun은 Akan이 그 경험을 더 직접적으로 소유할 수 있게 해줍니다. package installation, script, server execution, SQLite access, test, production artifact가 같은 toolchain을 중심으로 정렬됩니다.",
              })}
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">{l.trans({ en: "What changed from v1", ko: "v1에서 달라진 점" })}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {migrationNotes.map((column) => (
              <div key={column.label.en} className="rounded-2xl bg-base-200 p-5">
                <h3 className="font-black text-primary text-xl">{l.trans(column.label)}</h3>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-base-content/75 leading-7">
                  {column.items.map((item) => (
                    <li key={item.en}>{l.trans(item)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Why SQLite first", ko: "왜 SQLite first인가" })}</h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "Akan.js v1 used MongoDB. It was flexible and familiar for document-oriented application work. But for v2, we wanted the default database to match the way many services actually begin: small team, fast iteration, local-first development, simple operations, and enough performance headroom to grow.",
                ko: "Akan.js v1은 MongoDB를 사용했습니다. 문서 중심 애플리케이션 개발에는 유연하고 익숙한 선택이었습니다. 하지만 v2에서는 많은 서비스가 실제로 시작하는 방식에 더 맞는 기본 데이터베이스를 원했습니다. 작은 팀, 빠른 반복, local-first 개발, 단순한 운영, 그리고 성장할 수 있는 충분한 성능 여유입니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "SQLite with WAL mode is no longer just a toy database for prototypes. For many early and mid-stage products, it can handle practical read/write workloads while keeping deployment and local development dramatically simpler.",
                ko: "WAL mode의 SQLite는 더 이상 프로토타입용 장난감 데이터베이스가 아닙니다. 많은 초/중기 제품에서 실용적인 read/write workload를 감당하면서 배포와 로컬 개발을 훨씬 단순하게 유지할 수 있습니다.",
              })}
            </p>
            <p>
              {l.trans({
                en: "This choice also fits Akan's philosophy. Start with the simplest reliable path, keep business code close to the product, and avoid operational complexity until the product has truly earned it.",
                ko: "이 선택은 Akan의 철학과도 맞습니다. 신뢰할 수 있는 가장 단순한 경로에서 시작하고, 비즈니스 코드를 제품 가까이에 두며, 제품이 정말로 필요로 하기 전까지 운영 복잡성을 끌어오지 않는 것입니다.",
              })}
            </p>
          </div>
        </section>

        <section className="mt-12 border-primary border-l-4 pl-5">
          <h2 className="font-bold text-2xl">{l.trans({ en: "The direction of v2", ko: "v2의 방향" })}</h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "Akan.js v2 is about concentration. One runtime, one convention-driven workspace, one business definition flowing through pages, APIs, services, data, and deployable artifacts. The stack is smaller so the product surface can get bigger.",
              ko: "Akan.js v2의 핵심은 집중입니다. 하나의 runtime, 하나의 convention-driven workspace, 하나의 비즈니스 정의가 page, API, service, data, deployable artifact로 흐르는 구조입니다. 스택은 작아지고, 제품의 가능성은 더 커집니다.",
            })}
          </p>
        </section>
      </article>
    </main>
  );
}
