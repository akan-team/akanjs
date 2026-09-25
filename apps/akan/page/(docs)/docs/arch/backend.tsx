import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide
        id="business-service-overview"
        title={l.trans({ en: "Business Service Architecture", ko: "비즈니스 서비스 아키텍처" })}
      >
        <Docs.Title>{l.trans({ en: "Business Service Architecture", ko: "비즈니스 서비스 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan business service is the server-side execution layer for business behavior. When a customer places an order, a manager adds stock, a reservation status changes, or a nightly report is generated, the business service decides what runs now, what changes stored data, what should run in the background, and which clients need to be notified.",
              ko: "Akan 비즈니스 서비스는 비즈니스 동작이 서버 측에서 실행되는 계층입니다. 고객이 주문하고, 관리자가 재고를 추가하고, 예약 상태가 바뀌고, 야간 리포트가 생성될 때 비즈니스 서비스는 지금 실행할 작업, 저장 데이터를 바꿀 작업, 백그라운드로 넘길 작업, 다른 클라이언트에 알려야 할 변경을 결정합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Request actions", ko: "요청 액션" }),
                desc: l.trans({
                  en: "The user clicks a button and expects a clear result, such as submit order, add stock, or approve request.",
                  ko: "사용자가 버튼을 누르고 주문 제출, 재고 추가, 요청 승인처럼 명확한 결과를 기대하는 작업입니다.",
                }),
              },
              {
                title: l.trans({ en: "Business services", ko: "비즈니스 서비스" }),
                desc: l.trans({
                  en: "Rules and orchestration live here: stock rules, payment status, reservation conflicts, and external APIs.",
                  ko: "재고 규칙, 결제 상태, 예약 충돌, 외부 API 연동 같은 규칙과 조율이 여기에 놓입니다.",
                }),
              },
              {
                title: l.trans({ en: "Background work", ko: "백그라운드 작업" }),
                desc: l.trans({
                  en: "Slow, repeated, scheduled, or non-blocking tasks can run after the screen receives a quick response.",
                  ko: "느리거나 반복되거나 예약되었거나 화면을 막을 필요가 없는 작업은 빠른 응답 후 실행할 수 있습니다.",
                }),
              },
              {
                title: l.trans({ en: "Realtime updates", ko: "실시간 업데이트" }),
                desc: l.trans({
                  en: "When dashboards, devices, or other users should see a change, the business service publishes the updated result.",
                  ko: "대시보드, 장비, 다른 사용자가 변경을 봐야 할 때 비즈니스 서비스는 변경된 결과를 전달합니다.",
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

      <Scroll.Slide
        id="request-to-business-action"
        title={l.trans({ en: "Request To Business Action", ko: "요청에서 비즈니스 액션까지" })}
      >
        <Docs.Title>{l.trans({ en: "Request To Business Action", ko: "요청에서 비즈니스 액션까지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The most common business service path starts from a UI action. A generated client helper calls a signal endpoint, the endpoint delegates the business decision to a service, and the result updates stored data or returns a useful response to the screen.",
              ko: "가장 흔한 비즈니스 서비스 경로는 UI 액션에서 시작합니다. 생성된 클라이언트 헬퍼가 signal endpoint를 호출하고, endpoint는 비즈니스 판단을 service에 맡기며, 결과는 저장 데이터를 바꾸거나 화면에 필요한 응답으로 돌아갑니다.",
            })}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Example: Article Server Module", ko: "예시: Article 서버 모듈" })}
              </div>
              <div className="mt-1 text-base-content/70 text-sm">
                {l.trans({
                  en: "A business service module can be read from right to left: traffic reaches the API port, signal exposes callable endpoints and auth boundaries, service makes the business decision, and document handles storage details.",
                  ko: "비즈니스 서비스 모듈은 오른쪽에서 왼쪽으로 읽으면 이해하기 쉽습니다. 트래픽이 API 포트에 도달하고, signal이 호출 가능한 endpoint와 auth 경계를 노출하고, service가 비즈니스 판단을 하며, document가 저장 세부사항을 처리합니다.",
                })}
              </div>
            </div>
            <div className="grid items-stretch gap-3 xl:grid-cols-[1.4fr_auto_1fr_auto_1fr]">
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-mono font-semibold text-base-content">Article.document.ts</div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Defines the archive rulebook: schema, query filters, sort options, and document-level helpers.",
                    ko: "문서고의 처리 규칙을 정의합니다. schema, query filter, sort option, document-level helper를 담당합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3">
                  <div className="text-base-content/60 text-xs">schema from Article.constant.ts</div>
                  <div className="mt-2 rounded-lg border border-base-300 bg-base-200 p-3 font-mono text-base-content/70 text-xs">
                    title
                    <br />
                    authors
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="rounded-lg border border-base-300 bg-base-100 p-3">
                    <div className="font-mono text-base-content text-xs">methods</div>
                    <div className="mt-1 text-base-content/70 text-xs">addAuthor</div>
                  </div>
                  <div className="rounded-lg border border-base-300 bg-base-100 p-3">
                    <div className="font-mono text-base-content text-xs">statics</div>
                    <div className="mt-1 text-base-content/70 text-xs">findAllByAuthorName</div>
                  </div>
                </div>
              </div>
              <div className="hidden items-center justify-center text-primary xl:flex">
                <div className="h-px w-10 bg-primary/40" />
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-mono font-semibold text-base-content">Article.service.ts</div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Owns business logic: who can change an article, how authors are added, and which document methods to call.",
                    ko: "게시글을 누가 바꿀 수 있는지, 작성자를 어떻게 추가할지, 어떤 document method를 호출할지 같은 비즈니스 로직을 가집니다.",
                  })}
                </div>
              </div>
              <div className="hidden items-center justify-center text-primary xl:flex">
                <div className="h-px w-10 bg-primary/40" />
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="font-mono font-semibold text-primary">Article.signal.ts</div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Exposes callable endpoints through 8282/api and applies auth boundaries before delegating to service logic.",
                    ko: "8282/api를 통해 호출 가능한 endpoint를 노출하고, service 로직에 위임하기 전에 auth 경계를 적용합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-base-100 p-3 font-mono text-base-content/70 text-xs">
                  endpoint
                  <br />
                  slice
                  <br />
                  internal
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-base-300 bg-base-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-mono font-semibold text-base-content">API endpoint port</div>
                <div className="mt-1 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Signal endpoints are exposed through the API port, so generated clients can call business actions through the same surface.",
                    ko: "Signal endpoint는 API 포트를 통해 노출되므로, 생성된 client는 같은 surface로 비즈니스 액션을 호출할 수 있습니다.",
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-base-300 bg-base-100 px-4 py-2 font-mono text-base-content/70 text-sm">
                8282/api
              </div>
            </div>
            <div className="mt-4 space-y-1">
              {[
                {
                  title: l.trans({ en: "signal: phone operator", ko: "signal: 전화 상담원" }),
                  desc: l.trans({
                    en: "Receives calls for specific requests, filters spam or unsafe calls, manages operational pressure, and sends valid work to the right service.",
                    ko: "특정 요청을 하는 연락을 받고, 스팸전화나 위험한 요청을 필터링하며, 전화가 너무 많이 몰릴 때 운영적으로 조절하고, 유효한 일을 알맞은 service에 전달합니다.",
                  }),
                },
                {
                  title: l.trans({ en: "service: business owner", ko: "service: 업무 담당자" }),
                  desc: l.trans({
                    en: "Performs the actual work, decides how it should be done, and exchanges work with other domain owners when needed.",
                    ko: "실제 일을 수행하고, 일을 어떻게 처리할지 정리하며, 필요하면 다른 도메인 담당자와 업무를 주고받습니다.",
                  }),
                },
                {
                  title: l.trans({ en: "document: archive rulebook", ko: "document: 문서고와 처리 규칙" }),
                  desc: l.trans({
                    en: "Defines the document form, processing order, and organization rules used while the work is stored and handled.",
                    ko: "일을 진행하는 문서 양식, 처리 순서, 문서 정리 방법을 정해둔 문서고와 같습니다.",
                  }),
                },
              ].map(({ title, desc }) => (
                <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                  <span className="font-bold text-base-content">{title}: </span>

                  <span className="text-base-content/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service-layer" title={l.trans({ en: "Service Layer", ko: "서비스 계층" })}>
        <Docs.Title>{l.trans({ en: "Service Layer", ko: "서비스 계층" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service is the business owner who performs the actual work. It decides how the work should be done, combines rules, saved data, other services, external APIs, and side effects into one meaningful business action.",
              ko: "service는 실제 일을 하는 업무 담당자입니다. 일이 어떻게 수행되어야 하는지 결정하고, 규칙, 저장 데이터, 다른 서비스, 외부 API, 부수 효과를 하나의 의미 있는 비즈니스 액션으로 조합합니다.",
            })}
          </div>
          <div className="space-y-1 px-4">
            {[
              {
                title: l.trans({ en: "Product stock", ko: "상품 재고" }),
                desc: l.trans({
                  en: "Check whether stock can be added, reserved, or reduced before updating inventory.",
                  ko: "재고를 추가, 예약, 차감해도 되는지 확인한 뒤 재고를 업데이트합니다.",
                }),
              },
              {
                title: l.trans({ en: "Payment flow", ko: "결제 흐름" }),
                desc: l.trans({
                  en: "Coordinate a payment provider, order status, receipt record, and notification.",
                  ko: "결제 제공자, 주문 상태, 영수증 기록, 알림을 함께 조율합니다.",
                }),
              },
              {
                title: l.trans({ en: "Reservation rule", ko: "예약 규칙" }),
                desc: l.trans({
                  en: "Prevent overlapping bookings and decide whether a time slot can be confirmed.",
                  ko: "예약 시간이 겹치지 않도록 막고, 해당 시간대를 확정할 수 있는지 판단합니다.",
                }),
              },
              {
                title: l.trans({ en: "Report generation", ko: "리포트 생성" }),
                desc: l.trans({
                  en: "Gather data from several models and prepare a summary that can be viewed or exported.",
                  ko: "여러 모델의 데이터를 모아 화면에서 보거나 내보낼 수 있는 요약을 준비합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="space-x-2 rounded-xl border border-base-300 bg-base-100">
                <span className="font-bold text-base-content">{title}: </span>
                <span className="text-base-content/70">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "A good rule of thumb: if the code answers a business question, put it in service logic. If it only draws a screen or stores temporary UI state, keep it on the UI side.",
              ko: "간단한 기준은 이렇습니다. 코드가 비즈니스 질문에 답한다면 service 로직에 두고, 화면을 그리거나 임시 UI 상태만 다룬다면 UI 쪽에 둡니다.",
            })}
          </Docs.Alert>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}
            </div>
            <div className="mt-1 text-base-content/70 text-sm">
              {l.trans({
                en: "A service can receive the tools it needs instead of creating them by hand. This is how one business owner asks another domain owner, shared API, signal, or runtime adaptor for help.",
                ko: "service는 필요한 도구를 직접 만들지 않고 주입받을 수 있습니다. 이는 한 업무 담당자가 다른 도메인 담당자, 공유 API, signal, 런타임 adaptor에게 도움을 요청하는 방식입니다.",
              })}
            </div>
            <div className="mt-4 space-y-1">
              {[
                {
                  title: "service",
                  desc: l.trans({
                    en: "Inject another domain service, such as admin using security or ticket using notification.",
                    ko: "admin이 security를 쓰거나 ticket이 notification을 쓰는 것처럼 다른 도메인 service를 주입합니다.",
                  }),
                },
                {
                  title: "use / env",
                  desc: l.trans({
                    en: "Inject configured values or external APIs such as storage, email, payment, or device APIs.",
                    ko: "storage, email, payment, device API 같은 설정값이나 외부 API를 주입합니다.",
                  }),
                },
                {
                  title: "signal",
                  desc: l.trans({
                    en: "Inject a server signal when service logic needs to publish or call signal-level behavior.",
                    ko: "service 로직이 signal 수준의 동작을 publish하거나 호출해야 할 때 server signal을 주입합니다.",
                  }),
                },
                {
                  title: "plug",
                  desc: l.trans({
                    en: "Plug connects a service or runtime object to an adaptor role, such as queue, cache, storage, scheduler, or websocket.",
                    ko: "plug는 service나 runtime 객체를 queue, cache, storage, scheduler, websocket 같은 adaptor role에 연결합니다.",
                  }),
                },
                {
                  title: "adaptor",
                  desc: l.trans({
                    en: "An adaptor is a replaceable runtime connector. The same service can use solid, redis, local, or cloud-backed implementations.",
                    ko: "adaptor는 교체 가능한 런타임 연결자입니다. 같은 service가 solid, redis, local, cloud 기반 구현을 사용할 수 있습니다.",
                  }),
                },
                {
                  title: "memory",
                  desc: l.trans({
                    en: "Use memory for service-owned runtime state that may live locally or through a cache adaptor.",
                    ko: "memory는 service가 소유하는 런타임 상태를 로컬 또는 cache adaptor를 통해 보관할 때 사용합니다.",
                  }),
                },
              ].map(({ title, desc }) => (
                <div key={title} className="rounded-xl border border-base-300 bg-base-200 px-4 py-0">
                  <span className="font-mono font-semibold text-primary">{title}: </span>

                  <span className="text-base-content/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="signal-surface" title={l.trans({ en: "Signal Surface", ko: "Signal 표면" })}>
        <Docs.Title>{l.trans({ en: "Signal Surface", ko: "Signal 표면" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A signal is like a phone operator for the business service. It receives calls from pages and generated clients, filters invalid or unsafe requests, manages the callable surface, and passes valid work to the right service.",
              ko: "signal은 비즈니스 서비스의 전화 상담원과 비슷합니다. page와 생성된 client의 연락을 받고, 유효하지 않거나 위험한 요청을 필터링하고, 호출 가능한 표면을 관리하며, 유효한 일을 알맞은 service에 전달합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "endpoint",
                desc: l.trans({
                  en: "User-callable actions exposed through the API surface. Endpoint can be HTTP-like query/mutation, or WebSocket-style message/pubsub.",
                  ko: "API surface를 통해 사용자가 호출할 수 있는 액션입니다. endpoint는 HTTP 성격의 query/mutation 또는 WebSocket 성격의 message/pubsub로 나뉩니다.",
                }),
              },
              {
                title: "slice",
                desc: l.trans({
                  en: "Screen-readable list/detail surface. Slice combines guards, params, searches, and document filters so UI can load consistent screen data.",
                  ko: "화면이 읽는 목록/상세 데이터 surface입니다. slice는 guard, param, search, document filter를 묶어 UI가 일관된 화면 데이터를 불러오게 합니다.",
                }),
              },
              {
                title: "internal",
                desc: l.trans({
                  en: "Server-only work that can be scheduled, queued, or executed by internal processes without exposing it as a public UI action.",
                  ko: "공개 UI 액션으로 노출하지 않고 schedule, queue, internal process로 실행할 수 있는 서버 전용 작업입니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Endpoint transport", ko: "Endpoint 전송 방식" })}
              </div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Use query/mutation for request-response API work. Use message/pubsub when the screen needs WebSocket behavior, realtime messages, or room-based publish/subscribe.",
                  ko: "요청-응답 API 작업에는 query/mutation을 사용합니다. 화면에 WebSocket 동작, 실시간 메시지, room 기반 publish/subscribe가 필요하면 message/pubsub를 사용합니다.",
                })}
              </div>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Operation controls", ko: "운영 제어" })}
              </div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Signal is also where request guards, parameters, search inputs, message inputs, cache hints, and throttling-style operational boundaries are described.",
                  ko: "signal은 request guard, parameter, search input, message input, cache hint, throttling 성격의 운영 경계를 설명하는 위치이기도 합니다.",
                })}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "How To Choose A Signal Shape", ko: "Signal 형태 선택하기" })}
            </div>
            <div className="mt-1 text-base-content/70 text-sm">
              {l.trans({
                en: "Start from the product behavior. Does the user need an answer now, a live conversation, a broadcast to many screens, or a background job that finishes later?",
                ko: "제품 동작에서 시작하세요. 사용자가 지금 답을 받아야 하는지, 열린 연결로 대화해야 하는지, 여러 화면에 알림을 보내야 하는지, 나중에 끝나는 백그라운드 작업인지에 따라 선택합니다.",
              })}
            </div>
            <Docs.Mermaid
              title="Signal shape choice"
              chart={`flowchart TB
  need["What does the screen need?"] --> now["Answer now"]
  need --> live["Keep talking while open"]
  need --> many["Notify many screens"]
  need --> later["Finish later"]
  now --> api["Use query or mutation"]
  live --> message["Use message"]
  many --> pubsub["Use pubsub"]
  later --> internal["Use process or schedule"]`}
            />
            <div className="mt-4 space-y-1">
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Answer now", ko: "지금 답하기" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Use query or mutation when the screen asks once and expects one result. Good for loading a list, saving a form, approving a request, or adding stock.",
                    ko: "화면이 한 번 요청하고 한 번의 결과를 기대한다면 query 또는 mutation을 사용합니다. 목록 불러오기, 폼 저장, 요청 승인, 재고 추가에 적합합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-base-content/70 text-xs">
                  screen calls 8282/api, business service returns result
                </div>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Keep talking", ko: "연결을 유지하며 대화" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Use message when an open screen needs a WebSocket-style conversation with the server, such as device control, live operation panels, or guided workflows.",
                    ko: "열려 있는 화면이 서버와 WebSocket 방식으로 대화해야 한다면 message를 사용합니다. 장비 제어, 실시간 운영 패널, 단계형 작업 흐름에 적합합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-base-content/70 text-xs">
                  open connection, send message, receive reply
                </div>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Notify many screens", ko: "여러 화면에 알림" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Use pubsub when one business change should be pushed to multiple open screens, dashboards, devices, or users.",
                    ko: "하나의 비즈니스 변경을 여러 열린 화면, 대시보드, 장비, 사용자에게 밀어줘야 한다면 pubsub를 사용합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-base-content/70 text-xs">
                  service changes data, publish, subscribers update
                </div>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Finish later", ko: "나중에 끝내기" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Use process, cron, interval, timeout, initialize, or destroy when work is queued, scheduled, repeated, or tied to server lifecycle.",
                    ko: "작업이 queue에 들어가거나, 예약되거나, 반복되거나, 서버 생명주기와 연결된다면 process, cron, interval, timeout, initialize, destroy를 사용합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3 font-mono text-base-content/70 text-xs">
                  request or schedule, worker, save or publish result
                </div>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="business-service-scenarios"
        title={l.trans({ en: "Business Service Scenarios", ko: "비즈니스 서비스 시나리오" })}
      >
        <Docs.Title>{l.trans({ en: "Business Service Scenarios", ko: "비즈니스 서비스 시나리오" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Choose the business service path from the product situation. Some screens need a direct answer, some need a background worker, and some need to notify open screens after the data changes.",
              ko: "제품 상황에서 비즈니스 서비스 경로를 고르세요. 어떤 화면은 즉시 답이 필요하고, 어떤 작업은 백그라운드 worker가 필요하며, 어떤 변경은 데이터가 바뀐 뒤 열린 화면에 알려야 합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Simple request and response", ko: "단순 요청/응답" }),
                desc: l.trans({
                  en: "Use this when the user clicks once and expects the result now, such as add stock, approve request, cancel reservation, or save profile.",
                  ko: "사용자가 한 번 클릭하고 지금 결과를 기대할 때 사용합니다. 재고 추가, 요청 승인, 예약 취소, 프로필 저장이 여기에 해당합니다.",
                }),
                shape: "endpoint(query/mutation), service, document, response",
                config: l.trans({
                  en: "Signal exposes the action as an endpoint. Service checks rules and updates data. The screen receives the result immediately.",
                  ko: "Signal은 액션을 endpoint로 노출합니다. Service는 규칙을 확인하고 데이터를 변경합니다. 화면은 결과를 즉시 받습니다.",
                }),
                code: `export class StockEndpoint extends endpoint(srv.stock, ({ mutation }) => ({
  addStock: mutation(cnst.Stock)
    .param("productId", ID)
    .param("amount", Int)
    .exec(async function (productId, amount) {
      return await this.stockService.addStock(productId, amount);
    }),
})) {}

export class StockService extends serve(db.stock, () => ({})) {
  async addStock(productId: string, amount: number) {
    const stock = await this.stockModel.getByProductId(productId);
    return await stock.addAmount(amount).save();
  }
}`,
              },
              {
                title: l.trans({ en: "Background operation", ko: "백그라운드 작업" }),
                desc: l.trans({
                  en: "Use this when the business should run on a schedule, such as expiring old reservations, syncing partner data, or retrying failed device work every few minutes.",
                  ko: "오래된 예약 만료, 파트너 데이터 동기화, 실패한 장비 작업 재시도처럼 일정에 따라 반복 실행해야 하는 작업에 사용합니다.",
                }),
                shape: "cron signal, batch runtime, service checks targets, saved result",
                config: l.trans({
                  en: "Internal signal declares the cron schedule. The batch runtime runs it repeatedly. Service finds the work that is due and applies the business rule.",
                  ko: "Internal signal이 cron 일정을 선언합니다. Batch runtime이 이를 반복 실행합니다. Service는 처리 시점이 된 대상을 찾고 비즈니스 규칙을 적용합니다.",
                }),
                code: `export class ReservationInternal extends internal(srv.reservation, ({ cron }) => ({
  expireOldReservations: cron("*/10 * * * *", { serverMode: "batch" }).exec(async function () {
    await this.reservationService.expireOldReservations();
    return true;
  }),
})) {}

export class ReservationService extends serve(db.reservation, () => ({})) {
  async expireOldReservations() {
    const reservations = await this.reservationModel.queryExpiredPending();
    for (const reservation of reservations) {
      await reservation.set({ status: "expired" }).save();
    }
  }
}`,
              },
              {
                title: l.trans({ en: "Report generation", ko: "리포트 생성" }),
                desc: l.trans({
                  en: "Use this when the user asks for a heavy export, monthly summary, settlement file, or analytics report.",
                  ko: "사용자가 무거운 내보내기, 월간 요약, 정산 파일, 분석 리포트를 요청할 때 사용합니다.",
                }),
                shape: "endpoint starts report, process builds file, slice shows status",
                config: l.trans({
                  en: "Endpoint starts the report job. Internal process builds the file or summary. Slice lets the screen read progress, status, and download result.",
                  ko: "Endpoint가 리포트 작업을 시작합니다. Internal process가 파일이나 요약을 생성합니다. Slice는 화면이 진행률, 상태, 다운로드 결과를 읽게 합니다.",
                }),
                code: `export class SalesReportInternal extends internal(srv.salesReport, ({ process }) => ({
  buildMonthlyReport: process(Boolean)
    .msg("reportId", ID)
    .exec(async function (reportId) {
      await this.salesReportService.buildMonthlyReport(reportId);
      return true;
    }),
})) {}
// [!code collapse:9]
export class SalesReportSlice extends slice(srv.salesReport, {}, (init) => ({ 
  byMonth: init()
    .param("month", String)
    .exec(function (month) {
      return this.salesReportService.queryByMonth(month);
    }),
})) {}

export class SalesReportEndpoint extends endpoint(srv.salesReport, ({ mutation }) => ({
  createMonthlyReport: mutation(cnst.SalesReport)
    .param("month", String)
    .exec(async function (month) {
      return await this.salesReportService.queueMonthlyReport(month);
    }),
})) {}

export class SalesReportService extends serve(db.salesReport, ({ signal }) => ({
  salesReportSignal: signal<sig.SalesReport>(),
})) {
  async queueMonthlyReport(month: string) {
    const report = await this.createMonthlyReport({ month, status: "queued" });
    await this.salesReportSignal.buildMonthlyReport(report.id);
    return report;
  }

  async buildMonthlyReport(reportId: string) {
    const report = await this.salesReportModel.getSalesReport(reportId);
    // build file
    return await report.setReady().save();
  }
}`,
              },
              {
                title: l.trans({ en: "Realtime chat", ko: "실시간 채팅" }),
                desc: l.trans({
                  en: "Use this when a message written by one user should appear on other open chat screens immediately.",
                  ko: "한 사용자가 보낸 메시지가 다른 사용자의 열린 채팅 화면에 즉시 보여야 할 때 사용합니다.",
                }),
                shape: "message/mutation saves chat, pubsub publishes to room, open chat screens update",
                config: l.trans({
                  en: "Endpoint receives the chat action and service saves the message. Pubsub publishes the saved chat to the chat room so every open screen can append it.",
                  ko: "Endpoint가 채팅 액션을 받고 service가 메시지를 저장합니다. Pubsub는 저장된 채팅을 채팅방에 전달해 열린 화면들이 메시지를 바로 추가할 수 있게 합니다.",
                }),
                code: `export class ChatRoomSlice extends slice(srv.chatRoom, {}, (init) => ({
  chats: init()
    .param("roomId", ID)
    .exec(function (roomId) {
      return this.chatRoomService.queryChats(roomId);
    }),
})) {}

export class ChatRoomEndpoint extends endpoint(srv.chatRoom, ({ mutation, pubsub }) => ({
  sendChat: mutation(cnst.Chat)
    .param("roomId", ID)
    .param("text", String)
    .exec(async function (roomId, text) {
      return await this.chatRoomService.sendChat(roomId, text);
    }),
  chatAdded: pubsub(cnst.Chat)
    .room("roomId", ID)
    .exec(async () => {
      // The runtime delivers the published chat to subscribers in this room.
    }),
})) {}

export class ChatRoomService extends serve(db.chatRoom, ({ signal }) => ({
  chatRoomSignal: signal<sig.ChatRoom>(),
})) {
  async sendChat(roomId: string, text: string) {
    // add or save Chat
    await this.chatRoomSignal.chatAdded(roomId, chat);
    return chat;
  }
}`,
              },
            ].map(({ title, desc, shape, config, code }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-200 p-3 font-mono text-base-content/70 text-xs">
                  {shape}
                </div>
                <div className="mt-3 text-base-content/70 text-sm">{config}</div>
                <Docs.CodeSnippet className="mt-3 w-full" code={code} title={title} />
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
