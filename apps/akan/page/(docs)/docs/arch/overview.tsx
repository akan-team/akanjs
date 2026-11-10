import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade", rscPatchHeadSafe: true })
  .head(({ lang }) => {
    const title = lang === "ko" ? "아키텍처: 아키텍처 개요 | Akan.js" : "Architecture: Architecture Overview | Akan.js";
    const description =
      lang === "ko"
        ? "앱 하나가 웹·앱·서버·DB에 닿는 방식과 런타임 조각들이 대화하는 구조."
        : "How one app reaches web, app, server and database, and how the runtime pieces talk.";
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
    return (
      <Scroll>
        <Scroll.Slide id="architecture-overview" title={l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}>
          <Docs.Title>{l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Why does one product need a frontend repository, a backend repository, a mobile project, and an infra chart before a customer can place a single order? Akan starts from the behavior instead. A customer sees a screen, takes an action, business rules decide what should happen, data changes, other clients may be notified, and the same app is packaged for web, mobile, cloud, or edge.",
                ko: "고객이 주문 하나를 넣기까지, 왜 frontend 저장소와 backend 저장소와 모바일 프로젝트와 인프라 차트가 따로 필요할까요? Akan은 그 대신 동작에서 출발합니다. 고객이 화면을 보고, 액션을 수행하면, 비즈니스 규칙이 무엇이 일어나야 하는지 결정하고, 데이터가 바뀌며, 다른 클라이언트에 알림이 갈 수 있고, 같은 앱이 web, mobile, cloud, edge로 패키징됩니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "This page is the map, not the territory. Each area below owns a different kind of decision, and the product stays legible as long as those decisions stay where they belong. Three rules hold across all of them:",
                ko: "이 페이지는 지도이지 영토가 아닙니다. 아래의 각 영역은 서로 다른 종류의 결정을 담당하고, 그 결정들이 제자리에 있는 한 제품 구조는 읽히는 상태로 남습니다. 모든 영역에 공통으로 적용되는 규칙은 세 가지입니다:",
              })}
            </div>
            <div className="my-4 space-y-3">
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{l.trans({ en: "Behavior First", ko: "동작이 먼저" })}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Write business behavior first, then let generated helpers reduce API and state glue.",
                    ko: "비즈니스 동작을 먼저 작성하고, API와 상태 연결 코드는 생성된 helper로 줄입니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">
                    {l.trans({ en: "One Service, Many Clients", ko: "하나의 service, 여러 클라이언트" })}
                  </strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "One business service layer serves every client surface: SSR web, CSR web, admin, partner, and mobile.",
                    ko: "SSR web, CSR web, admin, partner, mobile 같은 모든 클라이언트 표면이 하나의 비즈니스 service 계층을 공유합니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{l.trans({ en: "Deploy Later", ko: "배포는 나중에" })}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Choose the deployment shape after the product needs it: local first, then cloud, edge, or hybrid.",
                    ko: "배포 형태는 제품 요구가 생긴 뒤에 고릅니다. local에서 시작하고, 이후 cloud, edge, hybrid로 넓힙니다.",
                  })}
                </div>
              </div>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="many-surfaces" title={l.trans({ en: "One App, Many Surfaces", ko: "하나의 앱, 여러 표면" })}>
          <Docs.Title>{l.trans({ en: "One App, Many Surfaces", ko: "하나의 앱, 여러 표면" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Akan is designed for products that rarely have only one screen. A store customer page, an admin console, a partner client, a mobile app, and an edge device workflow present different interfaces while sharing the same rules and the same data.",
                ko: "Akan은 화면이 하나뿐인 제품보다 표면이 여럿인 제품을 위해 설계되었습니다. 스토어 고객 페이지, 관리자 콘솔, 파트너 클라이언트, 모바일 앱, 엣지 장비 워크플로우는 서로 다른 인터페이스를 보여주면서 같은 규칙과 같은 데이터를 공유합니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({ en: "Surface map", ko: "표면 지도" })}
              image="surface-map"
              prompt={`
              A large rounded square in the centre holding a small gear and a small database cylinder, its outline
              traced as the red accent, labelled "Shared Business Service" with a smaller second line "signal · service
              · document". Five surfaces sit in a loose, evenly spaced ring around it, each joined to it by a thin
              two-headed arrow: a browser whose page shows a small shopping bag, labelled "Store"; a browser whose page
              shows a small table grid, labelled "Admin Console"; a browser whose page shows two overlapping circles,
              labelled "Partner Client"; a phone labelled "Mobile App"; a small box with a short antenna and one dot on
              its face, labelled "Edge Device".
            `}
              alt={l.trans({
                en: "A store page, an admin console, a partner client, a mobile app and an edge device all reach one shared business service — signal, service and document — through fetch, st, Model and usePage.",
                ko: "스토어 페이지, 관리자 콘솔, 파트너 클라이언트, 모바일 앱, 엣지 장비가 모두 fetch, st, Model, usePage를 거쳐 하나의 공유 business service(signal, service, document)에 닿습니다.",
              })}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: "The point is not to force every client to look the same. The point is to let different clients reuse the same business truth while presenting the right workflow for each audience.",
                ko: "핵심은 모든 클라이언트를 똑같이 보이게 만드는 것이 아닙니다. 서로 다른 클라이언트가 각 사용자군에 맞는 워크플로우를 보여주면서도 같은 비즈니스 진실을 재사용하게 만드는 것입니다.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="runtime-conversation"
          title={l.trans({ en: "The Main Runtime Conversation", ko: "주요 런타임 대화" })}
        >
          <Docs.Title>{l.trans({ en: "The Main Runtime Conversation", ko: "주요 런타임 대화" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Almost every Akan feature is one conversation between the interface and the business service. The interface shows useful content and captures intent; the business service receives a safe request, decides the rule, changes data, and may trigger background or realtime follow-up work.",
                ko: "거의 모든 Akan 기능은 인터페이스와 비즈니스 service 사이의 대화 하나입니다. 인터페이스는 유용한 콘텐츠를 보여주고 의도를 수집하며, 비즈니스 service는 안전한 요청을 받아 규칙을 판단하고 데이터를 바꾸며, 필요하면 백그라운드나 실시간 후속 작업을 일으킵니다.",
              })}
            </div>
            <Docs.Sequence
              title={l.trans({ en: "One request, end to end", ko: "요청 하나의 전 구간" })}
              actors={{
                user: { label: l.trans({ en: "User", ko: "사용자" }), tone: "muted" },
                screen: {
                  label: l.trans({ en: "Screen", ko: "화면" }),
                  lines: [
                    l.trans({ en: "Page and client", ko: "페이지와 client" }),
                    l.trans({ en: "components", ko: "component" }),
                  ],
                },
                helpers: { label: "Helpers", lines: ["fetch · st · Model", "· usePage"] },
                signal: { label: "signal" },
                service: { label: "service" },
                document: { label: "document" },
              }}
              messages={[
                {
                  from: "user",
                  to: "screen",
                  label: l.trans({ en: "reads the SSR first view,", ko: "SSR 첫 화면을 읽고," }),
                  lines: [l.trans({ en: "then types, clicks, filters", ko: "입력·클릭·필터" })],
                },
                { from: "screen", to: "helpers", label: l.trans({ en: "intent", ko: "의도" }) },
                { from: "helpers", to: "signal", label: "fetch.endpoint(args)" },
                {
                  from: "signal",
                  to: "service",
                  label: l.trans({ en: "valid work only", ko: "검증을 통과한 작업만" }),
                  note: l.trans({
                    en: "endpoint · slice · internal — guards and boundaries run here",
                    ko: "endpoint · slice · internal — guard와 경계가 여기서 실행됩니다",
                  }),
                },
                {
                  from: "service",
                  to: "document",
                  label: l.trans({ en: "load and write", ko: "조회와 쓰기" }),
                  note: l.trans({
                    en: "rules · external APIs · DI · background · realtime",
                    ko: "규칙 · 외부 API · DI · 백그라운드 · realtime",
                  }),
                },
                {
                  from: "document",
                  to: "service",
                  dashed: true,
                  label: l.trans({ en: "documents", ko: "문서" }),
                  note: l.trans({
                    en: "schema · query · sort · methods · statics",
                    ko: "schema · query · sort · 메서드 · static",
                  }),
                },
                { from: "service", to: "signal", dashed: true, label: l.trans({ en: "result", ko: "결과" }) },
                {
                  from: "signal",
                  to: "helpers",
                  dashed: true,
                  label: l.trans({ en: "typed response", ko: "타입이 붙은 응답" }),
                },
                { from: "helpers", to: "screen", dashed: true, label: l.trans({ en: "st state", ko: "st 상태" }) },
                { from: "screen", to: "user", dashed: true, label: l.trans({ en: "re-render", ko: "재렌더" }) },
              ]}
            />
            <div>
              {l.trans({
                en: "SSR is what makes the first view appear early; client components take over for typing, clicking, filtering, chat, maps, camera, and local state. st holds the client state a response lands in, Model namespaces keep model usage typed, and usePage resolves i18n on both sides. Where that conversation actually executes — one process, a cloud cluster, an edge node, or a mobile package — is a runtime and infra decision, not a change to any of the code above.",
                ko: "첫 화면을 빠르게 띄우는 것은 SSR이고, 입력·클릭·필터·채팅·지도·카메라·로컬 상태는 client component가 이어받습니다. st는 응답이 도착할 클라이언트 상태를 들고, Model namespace는 모델 사용을 타입으로 묶으며, usePage는 서버와 클라이언트 양쪽에서 i18n을 해결합니다. 이 대화가 실제로 어디서 실행되는지 — 프로세스 하나인지, cloud cluster인지, edge 노드인지, mobile package인지 — 는 runtime과 infra의 결정이지 위 코드의 변경이 아닙니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="architecture-areas" title={l.trans({ en: "Architecture Areas", ko: "아키텍처 영역" })}>
          <Docs.Title>{l.trans({ en: "Architecture Areas", ko: "아키텍처 영역" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The detailed architecture pages explain each area more deeply. This overview keeps the map small: each area owns a different kind of decision, and the product becomes clear when those decisions stay in the right place.",
                ko: "세부 아키텍처 문서는 각 영역을 더 깊게 설명합니다. 이 overview는 지도를 작게 유지합니다. 각 영역은 서로 다른 종류의 결정을 담당하고, 그 결정들이 올바른 위치에 있을 때 제품 구조가 명확해집니다.",
              })}
            </div>
            <Docs.LinkGrid
              items={[
                {
                  href: "/docs/arch/frontend",
                  title: l.trans({ en: "UI Architecture", ko: "UI 아키텍처" }),
                  desc: l.trans({
                    en: "Design the first screen and decide what runs on the client.",
                    ko: "첫 화면을 설계하고 무엇을 클라이언트에서 돌릴지 정합니다.",
                  }),
                },
                {
                  href: "/docs/arch/ui-composition",
                  title: l.trans({ en: "UI Composition", ko: "UI 구성" }),
                  desc: l.trans({
                    en: "Build a list, a detail view, or a create and edit form.",
                    ko: "목록, 상세 화면, 생성·수정 폼을 만듭니다.",
                  }),
                },
                {
                  href: "/docs/arch/backend",
                  title: l.trans({ en: "Business Service", ko: "비즈니스 서비스" }),
                  desc: l.trans({
                    en: "Write server rules, APIs, queues, cron, and realtime work.",
                    ko: "서버 규칙, API, 큐, cron, 실시간 작업을 씁니다.",
                  }),
                },
                {
                  href: "/docs/arch/infra",
                  title: l.trans({ en: "Runtime And Infra", ko: "런타임과 인프라" }),
                  desc: l.trans({
                    en: "Choose local, cloud, edge, database, and deployment shape.",
                    ko: "local, cloud, edge, 데이터베이스, 배포 형태를 고릅니다.",
                  }),
                },
                {
                  href: "/docs/arch/mobile",
                  title: l.trans({ en: "Native App Architecture", ko: "네이티브 앱 아키텍처" }),
                  desc: l.trans({
                    en: "Package the CSR client as an iOS, Android or desktop app.",
                    ko: "CSR 클라이언트를 iOS·Android·데스크톱 앱으로 패키징합니다.",
                  }),
                },
                {
                  href: "/docs/arch/css",
                  title: l.trans({ en: "CSS And Styling", ko: "CSS와 스타일링" }),
                  desc: l.trans({
                    en: "Set theme tokens, fonts, and consistent component style.",
                    ko: "테마 토큰, 폰트, 일관된 컴포넌트 스타일을 정합니다.",
                  }),
                },
                {
                  href: "/docs/arch/ui-recipe",
                  title: l.trans({ en: "UI Recipe Layer", ko: "UI 레시피 레이어" }),
                  desc: l.trans({
                    en: "Stop re-implementing the same card or button look.",
                    ko: "같은 카드·버튼 모양을 매번 다시 만들지 않습니다.",
                  }),
                },
                {
                  href: "/docs/arch/agentic",
                  title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
                  desc: l.trans({
                    en: "Let an AI agent read and drive a screen.",
                    ko: "AI 에이전트가 화면을 읽고 조작하게 합니다.",
                  }),
                },
              ]}
            />
            <div>
              {l.trans({
                en: "You do not need to read every architecture page before building. Start from the decision you are facing, then move to the page that owns that decision.",
                ko: "무언가를 만들기 전에 모든 아키텍처 문서를 먼저 읽을 필요는 없습니다. 지금 마주한 결정에서 시작해, 그 결정을 담당하는 페이지로 가면 됩니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
