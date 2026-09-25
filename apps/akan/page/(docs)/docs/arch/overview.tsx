import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="architecture-overview" title={l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}>
        <Docs.Title>{l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan architecture starts from the product behavior, not from a separate frontend, backend, mobile, and infrastructure checklist. A customer sees a screen, takes an action, business rules decide what should happen, data changes, other clients may be notified, and the same app can be packaged for web, mobile, cloud, or edge environments.",
              ko: "Akan 아키텍처는 분리된 frontend, backend, mobile, infrastructure 체크리스트가 아니라 제품 동작에서 시작합니다. 고객이 화면을 보고, 액션을 수행하면, 비즈니스 규칙이 무엇이 일어나야 하는지 결정하고, 데이터가 바뀌며, 다른 클라이언트에 알림이 갈 수 있고, 같은 앱은 web, mobile, cloud, edge 환경으로 패키징될 수 있습니다.",
            })}
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="font-bold text-primary">{l.trans({ en: "Core Philosophy", ko: "핵심 철학" })}</div>
            <div className="mt-2 space-y-1">
              {[
                l.trans({
                  en: "Write business behavior first, then let generated helpers reduce API and state glue.",
                  ko: "비즈니스 동작을 먼저 작성하고, API와 상태 연결 코드는 생성된 헬퍼로 줄입니다.",
                }),
                l.trans({
                  en: "Use one business service layer for many client surfaces: SSR web, CSR web, admin, partner, and mobile.",
                  ko: "SSR web, CSR web, admin, partner, mobile 같은 여러 클라이언트 표면이 하나의 비즈니스 서비스 계층을 공유하게 합니다.",
                }),
                l.trans({
                  en: "Choose the deployment shape after the product needs it: local first, then cloud, edge, or hybrid.",
                  ko: "배포 형태는 제품 요구가 생긴 뒤 선택합니다. 먼저 local에서 시작하고, 이후 cloud, edge, hybrid로 확장합니다.",
                }),
              ].map((desc) => (
                <div
                  key={desc}
                  className="rounded-lg border border-primary/20 bg-base-100 px-4 py-2 text-base-content/70 text-sm"
                >
                  {desc}
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="many-surfaces" title={l.trans({ en: "One App, Many Surfaces", ko: "하나의 앱, 여러 표면" })}>
        <Docs.Title>{l.trans({ en: "One App, Many Surfaces", ko: "하나의 앱, 여러 표면" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan is designed for products that rarely have only one screen. A store customer page, an admin console, a partner client, a mobile app, and an edge device workflow can present different interfaces while sharing the same rules and data.",
              ko: "Akan은 하나의 화면만 가지는 제품보다 여러 표면을 가진 제품을 위해 설계되었습니다. 스토어 고객 페이지, 관리자 콘솔, 파트너 클라이언트, 모바일 앱, 엣지 장비 워크플로우는 서로 다른 인터페이스를 보여주면서 같은 규칙과 데이터를 공유할 수 있습니다.",
            })}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4 font-bold text-base-content">{l.trans({ en: "Surface Map", ko: "표면 지도" })}</div>
            <div className="space-y-1">
              <div className="rounded-xl border border-base-300 bg-base-200 px-4 py-2">
                <span className="font-mono font-semibold text-primary">UI surfaces: </span>
                <span className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "SSR pages, CSR pages, admin clients, partner clients, and mobile CSR clients.",
                    ko: "SSR page, CSR page, admin client, partner client, mobile CSR client입니다.",
                  })}
                </span>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 px-4 py-2">
                <span className="font-mono font-semibold text-primary">Client helpers: </span>
                <span className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Generated fetch, st, Model, and usePage helpers connect screens to business behavior.",
                    ko: "생성된 fetch, st, Model, usePage helper가 화면을 비즈니스 동작에 연결합니다.",
                  })}
                </span>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
                <span className="font-mono font-semibold text-primary">Shared business service: </span>
                <span className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Signal receives calls, service decides rules, and document handles stored data.",
                    ko: "signal이 호출을 받고, service가 규칙을 결정하며, document가 저장 데이터를 처리합니다.",
                  })}
                </span>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 px-4 py-2">
                <span className="font-mono font-semibold text-primary">Runtime shape: </span>
                <span className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "The same product can run locally, in cloud clusters, near devices at the edge, or inside mobile packages.",
                    ko: "같은 제품은 local, cloud cluster, edge, mobile package 안에서 실행될 수 있습니다.",
                  })}
                </span>
              </div>
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "The point is not to force every client to look the same. The point is to let different clients reuse the same business truth while presenting the right workflow for each audience.",
              ko: "핵심은 모든 클라이언트를 똑같이 보이게 만드는 것이 아닙니다. 서로 다른 클라이언트가 각 사용자군에 맞는 워크플로우를 보여주면서도 같은 비즈니스 진실을 재사용하게 만드는 것입니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="runtime-conversation"
        title={l.trans({ en: "The Main Runtime Conversation", ko: "주요 런타임 대화" })}
      >
        <Docs.Title>{l.trans({ en: "The Main Runtime Conversation", ko: "주요 런타임 대화" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most Akan features can be understood as a conversation between the interface and the business service. The interface shows useful content and captures intent. The business service receives a safe request, decides the rule, changes data, and may trigger background or realtime follow-up work.",
              ko: "대부분의 Akan 기능은 인터페이스와 비즈니스 서비스 사이의 대화로 이해할 수 있습니다. 인터페이스는 유용한 콘텐츠를 보여주고 의도를 수집합니다. 비즈니스 서비스는 안전한 요청을 받고, 규칙을 판단하고, 데이터를 바꾸며, 필요하면 백그라운드나 실시간 후속 작업을 실행합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "User sees or acts", ko: "사용자가 보고 행동" }),
                desc: l.trans({
                  en: "SSR helps the first view appear early. Client components handle typing, clicking, filtering, chat, maps, camera, and local state.",
                  ko: "SSR은 첫 화면을 빠르게 보여주고, client component는 입력, 클릭, 필터, 채팅, 지도, 카메라, 로컬 상태를 처리합니다.",
                }),
              },
              {
                title: l.trans({
                  en: "Generated helpers call the service surface",
                  ko: "생성 헬퍼가 서비스 표면 호출",
                }),
                desc: l.trans({
                  en: "fetch calls signal endpoints, st manages client state, Model namespaces keep model usage typed, and usePage handles i18n.",
                  ko: "fetch는 signal endpoint를 호출하고, st는 클라이언트 상태를 관리하며, Model namespace는 모델 사용을 타입화하고, usePage는 i18n을 처리합니다.",
                }),
              },
              {
                title: l.trans({ en: "Signal routes intent", ko: "Signal이 의도 라우팅" }),
                desc: l.trans({
                  en: "Signal is the callable surface for endpoint, slice, and internal work. It applies boundaries before sending valid work to services.",
                  ko: "signal은 endpoint, slice, internal 작업을 호출 가능한 표면으로 노출합니다. 유효한 작업을 service에 보내기 전에 경계를 적용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Service decides business behavior", ko: "Service가 비즈니스 판단" }),
                desc: l.trans({
                  en: "Services coordinate rules, stored data, external APIs, dependency injection, background work, and realtime publication.",
                  ko: "service는 규칙, 저장 데이터, 외부 API, 의존성 주입, 백그라운드 작업, 실시간 발행을 조율합니다.",
                }),
              },
              {
                title: l.trans({ en: "Document and runtime complete the loop", ko: "Document와 runtime이 루프 완성" }),
                desc: l.trans({
                  en: "Documents define schema, query, sort, methods, and statics. Runtime and infra decide where the work is reached and executed.",
                  ko: "document는 schema, query, sort, method, static을 정의합니다. runtime과 infra는 작업이 어디로 도착하고 어디서 실행될지 결정합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="architecture-areas" title={l.trans({ en: "Architecture Areas", ko: "아키텍처 영역" })}>
        <Docs.Title>{l.trans({ en: "Architecture Areas", ko: "아키텍처 영역" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The detailed architecture pages explain each area more deeply. This overview keeps the map small: each area owns a different kind of decision, and the product becomes clear when those decisions stay in the right place.",
              ko: "세부 아키텍처 문서는 각 영역을 더 깊게 설명합니다. 이 overview는 지도를 작게 유지합니다. 각 영역은 서로 다른 종류의 결정을 담당하고, 그 결정들이 올바른 위치에 있을 때 제품 구조가 명확해집니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "UI Architecture", ko: "UI 아키텍처" }),
                desc: l.trans({
                  en: "Explains first view, SSR, rendering boundary, client components, st, fetch, generated helpers, i18n, and client targets.",
                  ko: "첫 화면, SSR, 렌더링 경계, client component, st, fetch, generated helper, i18n, client target을 설명합니다.",
                }),
                href: "/docs/arch/frontend",
              },
              {
                title: l.trans({ en: "Business Service Architecture", ko: "비즈니스 서비스 아키텍처" }),
                desc: l.trans({
                  en: "Explains signal, service, document, request/response work, cron/background work, report generation, and realtime scenarios.",
                  ko: "signal, service, document, request/response 작업, cron/background 작업, 리포트 생성, 실시간 시나리오를 설명합니다.",
                }),
                href: "/docs/arch/backend",
              },
              {
                title: l.trans({ en: "Infra Architecture", ko: "인프라 아키텍처" }),
                desc: l.trans({
                  en: "Explains local, cloud cluster, edge, master, traffic paths, database mode, and growth stages.",
                  ko: "local, cloud cluster, edge, master, traffic path, database mode, growth stage를 설명합니다.",
                }),
                href: "/docs/arch/infra",
              },
              {
                title: l.trans({ en: "Mobile Architecture", ko: "모바일 아키텍처" }),
                desc: l.trans({
                  en: "Explains CSR web inside Capacitor, multi-client basePath targets, local CSR testing, pageConfig, and Android/iOS packaging.",
                  ko: "Capacitor 안에서 실행되는 CSR web, multi-client basePath target, 로컬 CSR 테스트, pageConfig, Android/iOS 패키징을 설명합니다.",
                }),
                href: "/docs/arch/mobile",
              },
              {
                title: l.trans({ en: "Styling Foundation", ko: "스타일링 기반" }),
                desc: l.trans({
                  en: "Explains Tailwind CSS, DaisyUI, design system thinking, theme declaration, and font declaration.",
                  ko: "Tailwind CSS, DaisyUI, 디자인 시스템 사고, 테마 선언, 폰트 선언을 설명합니다.",
                }),
                href: "/docs/arch/css",
              },
            ].map(({ title, desc, href }) => (
              <Link
                key={href}
                href={href}
                className="block rounded-xl border border-base-300 bg-base-100 px-4 py-2 hover:border-primary/40"
              >
                <span className="font-bold text-base-content">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </Link>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="reading-guide"
        title={l.trans({ en: "How To Read The Architecture Docs", ko: "아키텍처 문서 읽는 순서" })}
      >
        <Docs.Title>{l.trans({ en: "How To Read The Architecture Docs", ko: "아키텍처 문서 읽는 순서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You do not need to read every architecture page before building. Start from the decision you are facing, then move to the page that owns that decision.",
              ko: "무언가를 만들기 전에 모든 아키텍처 문서를 먼저 읽을 필요는 없습니다. 지금 마주한 결정에서 시작하고, 그 결정을 담당하는 페이지로 이동하면 됩니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                need: l.trans({
                  en: "I need to design the first screen or client behavior",
                  ko: "첫 화면이나 클라이언트 동작을 설계해야 한다",
                }),
                page: "UI Architecture",
                href: "/docs/arch/frontend",
              },
              {
                need: l.trans({
                  en: "I need server-side rules, APIs, queue, cron, or realtime work",
                  ko: "서버 규칙, API, queue, cron, realtime 작업이 필요하다",
                }),
                page: "Business Service Architecture",
                href: "/docs/arch/backend",
              },
              {
                need: l.trans({
                  en: "I need to choose local, cloud, edge, database, or deployment shape",
                  ko: "local, cloud, edge, database, deployment 형태를 골라야 한다",
                }),
                page: "Infra Architecture",
                href: "/docs/arch/infra",
              },
              {
                need: l.trans({
                  en: "I need to package a CSR client as Android or iOS",
                  ko: "CSR 클라이언트를 Android 또는 iOS로 패키징해야 한다",
                }),
                page: "Mobile Architecture",
                href: "/docs/arch/mobile",
              },
              {
                need: l.trans({
                  en: "I need consistent component style, theme, or font rules",
                  ko: "일관된 컴포넌트 스타일, 테마, 폰트 규칙이 필요하다",
                }),
                page: "Styling Foundation",
                href: "/docs/arch/css",
              },
            ].map(({ need, page, href }) => (
              <div key={href} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="text-base-content/70 text-sm">{need} </span>
                <span className="text-base-content/40 text-sm">→ </span>
                <Link href={href} className="font-mono font-semibold text-primary text-sm">
                  {page}
                </Link>
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
