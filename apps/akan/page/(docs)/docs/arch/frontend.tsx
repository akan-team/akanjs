import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="ui-overview" title={l.trans({ en: "UI Architecture", ko: "UI 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "UI Architecture", ko: "UI 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan UI is the user-facing interface layer of the app. When a customer opens a product page, a manager edits stock, or a partner checks orders from another client, the interface decides what appears immediately, what becomes interactive, and how user actions reach the backend.",
              ko: "Akan UI는 앱에서 사용자가 직접 마주하는 인터페이스 계층입니다. 고객이 상품 페이지를 열고, 관리자가 재고를 수정하고, 파트너가 다른 클라이언트에서 주문을 확인할 때 UI는 무엇을 즉시 보여줄지, 무엇을 인터랙티브하게 만들지, 사용자 행동을 백엔드로 어떻게 전달할지 결정합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Fast first screen", ko: "빠른 첫 화면" }),
                desc: l.trans({
                  en: "Server-rendered pages can show catalog, article, or dashboard content before the browser becomes interactive.",
                  ko: "서버 렌더링 페이지는 브라우저가 인터랙티브해지기 전에도 카탈로그, 글, 대시보드 내용을 먼저 보여줄 수 있습니다.",
                }),
              },
              {
                title: l.trans({ en: "Interactive work", ko: "인터랙티브 작업" }),
                desc: l.trans({
                  en: "Client components handle forms, filters, stock changes, realtime dashboards, and browser/device APIs.",
                  ko: "클라이언트 컴포넌트는 폼, 필터, 재고 변경, 실시간 대시보드, 브라우저/디바이스 API를 처리합니다.",
                }),
              },
              {
                title: l.trans({ en: "Generated helpers", ko: "생성된 헬퍼" }),
                desc: l.trans({
                  en: "Generated fetch, store, and model namespaces reduce hand-written API and state glue.",
                  ko: "생성된 fetch, store, model namespace가 직접 작성해야 하는 API/상태 연결 코드를 줄여줍니다.",
                }),
              },
              {
                title: l.trans({ en: "Many client surfaces", ko: "여러 클라이언트 표면" }),
                desc: l.trans({
                  en: "Customer web, admin console, partner site, and mobile apps can share backend logic while showing different screens.",
                  ko: "고객 웹, 관리자 콘솔, 파트너 사이트, 모바일 앱은 백엔드 로직을 공유하면서 서로 다른 화면을 보여줄 수 있습니다.",
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
        id="server-side-rendering"
        title={l.trans({ en: "What Is Server-Side Rendering?", ko: "서버사이드 렌더링이란?" })}
      >
        <Docs.Title>{l.trans({ en: "What Is Server-Side Rendering?", ko: "서버사이드 렌더링이란?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Server-side rendering means the server prepares the first visible HTML before the browser finishes loading the full app. Users can see useful content earlier, even before every button, input, and realtime feature becomes interactive.",
              ko: "서버사이드 렌더링은 브라우저가 전체 앱을 모두 불러오기 전에 서버가 먼저 보이는 HTML을 준비해 보내는 방식입니다. 모든 버튼, 입력, 실시간 기능이 동작 가능해지기 전에도 사용자는 유용한 콘텐츠를 더 빨리 볼 수 있습니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "The server prepares", ko: "서버가 먼저 준비" }),
                desc: l.trans({
                  en: "The server reads route, params, language, and initial data, then prepares the page users will see first.",
                  ko: "서버는 route, params, language, 초기 데이터를 읽고 사용자가 처음 볼 페이지를 준비합니다.",
                }),
                example: "product list, article body, reservation summary",
              },
              {
                title: l.trans({ en: "The browser shows", ko: "브라우저가 먼저 표시" }),
                desc: l.trans({
                  en: "The browser can paint meaningful content quickly, so users are not staring at an empty app shell.",
                  ko: "브라우저는 의미 있는 콘텐츠를 빠르게 그릴 수 있어, 사용자는 빈 앱 껍데기만 보고 기다리지 않아도 됩니다.",
                }),
                example: "title, price, first rows, policy text",
              },
              {
                title: l.trans({ en: "The client activates", ko: "클라이언트가 활성화" }),
                desc: l.trans({
                  en: "After the first view appears, client components attach event handlers for typing, clicking, filtering, and live updates.",
                  ko: "첫 화면이 보인 뒤 클라이언트 컴포넌트가 입력, 클릭, 필터링, 실시간 업데이트를 위한 이벤트 핸들러를 붙입니다.",
                }),
                example: "forms, filters, modals, st, fetch",
              },
            ].map(({ title, desc, example }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-200 px-3 py-2 font-mono text-base-content/70 text-xs">
                  {example}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4">
              <div className="font-bold text-base-content">{l.trans({ en: "SSR Timeline", ko: "SSR 동작 흐름" })}</div>
              <div className="mt-1 text-base-content/70 text-sm">
                {l.trans({
                  en: "The important point is that viewing and interacting do not have to happen at the exact same moment.",
                  ko: "중요한 점은 화면을 보는 순간과 조작할 수 있는 순간이 꼭 같은 시점일 필요는 없다는 것입니다.",
                })}
              </div>
            </div>
            <div className="grid items-stretch gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="rounded-xl border border-info/30 bg-info/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-bold text-info">{l.trans({ en: "Server", ko: "서버" })}</div>
                  <div className="rounded-full bg-info/10 px-3 py-1 font-mono text-info text-xs">01</div>
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Prepare first HTML from route, params, language, and initial data.",
                    ko: "route, params, language, 초기 데이터로 첫 HTML을 준비합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-info/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                  article title, product list
                </div>
              </div>
              <div className="hidden items-center text-primary xl:flex">
                <div className="h-px w-10 bg-primary/40" />
                <span className="px-2 font-mono">→</span>
                <div className="h-px w-10 bg-primary/40" />
              </div>
              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-bold text-success">{l.trans({ en: "Browser View", ko: "브라우저 표시" })}</div>
                  <div className="rounded-full bg-success/10 px-3 py-1 font-mono text-success text-xs">02</div>
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Paint useful content quickly so the user can understand the page.",
                    ko: "사용자가 페이지를 이해할 수 있도록 유용한 콘텐츠를 빠르게 그립니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-success/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                  Time to View
                </div>
              </div>
              <div className="hidden items-center text-primary xl:flex">
                <div className="h-px w-10 bg-primary/40" />
                <span className="px-2 font-mono">→</span>
                <div className="h-px w-10 bg-primary/40" />
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-bold text-primary">{l.trans({ en: "Client Areas", ko: "클라이언트 영역" })}</div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 font-mono text-primary text-xs">03</div>
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Activate forms, filters, modals, realtime updates, st, and fetch actions.",
                    ko: "폼, 필터, 모달, 실시간 업데이트, st, fetch 액션을 활성화합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                  Time to Interaction
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Business Example", ko: "비즈니스 예시" })}
            </div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "On a shopping page, customers should see product names, prices, and the first list quickly. The add-to-cart button, stock filter, and recommendation carousel can become interactive after the first view is already visible.",
                ko: "쇼핑 페이지에서는 고객이 상품명, 가격, 첫 목록을 빠르게 봐야 합니다. 장바구니 버튼, 재고 필터, 추천 캐러셀은 첫 화면이 이미 보인 뒤 인터랙티브해져도 됩니다.",
              })}
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "SSR is not the opposite of client-side UI. It is the first step of the experience: show useful content early, then let client components handle the parts that need interaction.",
              ko: "SSR은 클라이언트 UI의 반대 개념이 아닙니다. 사용자 경험의 첫 단계입니다. 유용한 콘텐츠를 먼저 보여주고, 상호작용이 필요한 부분은 클라이언트 컴포넌트가 맡습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="rendering-boundary" title={l.trans({ en: "Rendering Boundary", ko: "렌더링 경계" })}>
        <Docs.Title>{l.trans({ en: "Rendering Boundary", ko: "렌더링 경계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before deciding server-side or client-side, think about two moments in the user experience: when the user can see useful content, and when the user can interact with it.",
              ko: "서버사이드와 클라이언트사이드를 나누기 전에 사용자 경험의 두 순간을 먼저 생각하세요. 사용자가 유용한 내용을 볼 수 있는 순간과, 그 화면을 실제로 조작할 수 있는 순간입니다.",
            })}
          </div>
          <div className="space-y-1">
            <div className="rounded-2xl border border-info/30 bg-info/5 p-5">
              <div className="font-bold text-info">Time to View</div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "How quickly users can see meaningful content. A customer should see product names, prices, article text, or reservation details before every button becomes interactive.",
                  ko: "사용자가 의미 있는 내용을 얼마나 빨리 볼 수 있는지입니다. 모든 버튼이 동작 가능해지기 전이라도 고객은 상품명, 가격, 글 본문, 예약 정보를 먼저 볼 수 있어야 합니다.",
                })}
              </div>
              <div className="mt-3 rounded-lg border border-info/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                Server-side rendering helps here
              </div>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="font-bold text-primary">Time to Interaction</div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "How quickly users can type, click, filter, open modals, or receive realtime updates. These actions need browser-side state and event handlers.",
                  ko: "사용자가 입력, 클릭, 필터링, 모달 열기, 실시간 업데이트 수신을 얼마나 빨리 할 수 있는지입니다. 이런 작업에는 브라우저 쪽 상태와 이벤트 핸들러가 필요합니다.",
                })}
              </div>
              <div className="mt-3 rounded-lg border border-primary/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                Client-side components help here
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Why Both Sides Exist", ko: "왜 두 방식을 함께 쓰는가" })}
            </div>
            <div className="mt-2 space-y-1">
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Server-side first content", ko: "서버사이드 첫 콘텐츠" })}
                </div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Good for content users should understand immediately: catalog lists, article pages, pricing, profile summaries, and policy text.",
                    ko: "사용자가 즉시 이해해야 하는 콘텐츠에 좋습니다. 카탈로그 목록, 글 페이지, 가격, 프로필 요약, 정책 문구가 여기에 해당합니다.",
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Client-side working areas", ko: "클라이언트사이드 작업 영역" })}
                </div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Good for parts that must react to the user: stock forms, filters, chat input, dashboards, maps, camera, or local device APIs.",
                    ko: "사용자 행동에 반응해야 하는 부분에 좋습니다. 재고 폼, 필터, 채팅 입력, 대시보드, 지도, 카메라, 로컬 디바이스 API가 여기에 해당합니다.",
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "A Simpler Way To Decide", ko: "더 쉬운 결정 순서" })}
              </div>
              <div className="mt-1 text-base-content/70 text-sm">
                {l.trans({
                  en: "Start with what the user should see first, then add browser-side work only where the user actually interacts.",
                  ko: "사용자가 먼저 봐야 하는 것부터 시작하고, 실제로 상호작용이 필요한 영역에만 브라우저 작업을 추가합니다.",
                })}
              </div>
            </div>
            <div className="space-y-1">
              {[
                {
                  step: "01",
                  title: l.trans({ en: "Show stable content", ko: "안정적인 콘텐츠 표시" }),
                  desc: l.trans({
                    en: "Render product names, article text, prices, summaries, and first lists on the server.",
                    ko: "상품명, 글 본문, 가격, 요약, 첫 목록은 서버에서 렌더링합니다.",
                  }),
                  example: "page.tsx, layout, first data",
                },
                {
                  step: "02",
                  title: l.trans({ en: "Wrap working areas", ko: "작업 영역 감싸기" }),
                  desc: l.trans({
                    en: 'Use "use client" only around forms, filters, modals, realtime status, or device/browser APIs.',
                    ko: '폼, 필터, 모달, 실시간 상태, 디바이스/브라우저 API 주변에만 "use client"를 사용합니다.',
                  }),
                  example: "Edit, filter, modal, live status",
                },
                {
                  step: "03",
                  title: l.trans({ en: "Connect actions", ko: "액션 연결" }),
                  desc: l.trans({
                    en: "Use st for client state and fetch when the action needs a business answer from the server.",
                    ko: "클라이언트 상태는 st로 다루고, 서버의 비즈니스 응답이 필요하면 fetch를 사용합니다.",
                  }),
                  example: "st.use, st.do, fetch",
                },
              ].map(({ step, title, desc, example }) => (
                <div key={step} className="space-y-1 rounded-xl border border-base-300 bg-base-200 px-4 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-base-content">{title}</div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 font-mono text-primary text-xs">{step}</div>
                  </div>
                  <div className="text-base-content/70 text-sm">{desc}</div>
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                    {example}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Start with a readable screen", ko: "먼저 읽히는 화면으로 시작" }),
                desc: l.trans({
                  en: "If users should immediately see product names, prices, articles, or summaries, keep that part server-rendered.",
                  ko: "사용자가 상품명, 가격, 글, 요약 정보를 즉시 봐야 한다면 그 부분은 서버 렌더링으로 둡니다.",
                }),
              },
              {
                title: l.trans({ en: "Add client only for work", ko: "작업이 필요한 곳만 클라이언트" }),
                desc: l.trans({
                  en: "Use a client component when users type, click, open modals, filter lists, or keep a screen changing after load.",
                  ko: "사용자가 입력, 클릭, 모달 열기, 목록 필터링을 하거나 로드 후 화면이 계속 바뀌어야 할 때 클라이언트 컴포넌트를 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Put use client at the boundary", ko: "경계에 use client 선언" }),
                desc: l.trans({
                  en: 'Do not turn the whole page into a client page by default. Put "use client" on the smallest component that needs interaction.',
                  ko: '기본적으로 전체 페이지를 클라이언트 페이지로 만들지 않습니다. 인터랙션이 필요한 가장 작은 컴포넌트에 "use client"를 둡니다.',
                }),
              },
              {
                title: l.trans({ en: "Mix them per screen area", ko: "화면 영역별로 섞어서 사용" }),
                desc: l.trans({
                  en: "A product page can be mostly server-rendered while only the filter, cart button, or stock form runs in the browser.",
                  ko: "상품 페이지 대부분은 서버 렌더링으로 두고, 필터, 장바구니 버튼, 재고 폼 같은 영역만 브라우저에서 실행할 수 있습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "How To Split One Screen", ko: "한 화면을 나누는 방법" })}
              </div>
              <div className="mt-1 text-base-content/70 text-sm">
                {l.trans({
                  en: "Think of a screen as stable information plus working areas. Keep stable information server-rendered, then wrap only the working areas with a client component.",
                  ko: "화면을 안정적인 정보와 작업 영역으로 나눠 생각하세요. 안정적인 정보는 서버 렌더링으로 두고, 작업이 필요한 영역만 클라이언트 컴포넌트로 감쌉니다.",
                })}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                <div className="font-semibold text-base-content">
                  {l.trans({ en: "Stable information", ko: "안정적인 정보" })}
                </div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: "Use this for content users should see right away: title, price, summary, first list, policy text, or article body.",
                    ko: "사용자가 바로 봐야 하는 제목, 가격, 요약, 첫 목록, 정책 문구, 글 본문에 사용합니다.",
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                  Product title, price, first list, summary
                </div>
              </div>
              <div className="hidden items-center text-primary lg:flex">
                <div className="h-px w-12 bg-primary/40" />
                <span className="px-2 text-sm">add only where needed</span>
                <div className="h-px w-12 bg-primary/40" />
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="font-semibold text-primary">{l.trans({ en: "Working area", ko: "작업 영역" })}</div>
                <div className="mt-2 text-base-content/70 text-sm">
                  {l.trans({
                    en: 'Use "use client" here for forms, filters, modals, live status, stock actions, or anything that needs browser-side state.',
                    ko: '폼, 필터, 모달, 실시간 상태, 재고 액션처럼 브라우저 쪽 상태가 필요한 부분에 "use client"를 사용합니다.',
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-base-100 px-3 py-2 font-mono text-base-content/70 text-xs">
                  Search, add stock, edit form, live status
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Product catalog", ko: "상품 카탈로그" }),
                desc: l.trans({
                  en: "Render the title and first products on the server so customers see content quickly.",
                  ko: "고객이 빠르게 내용을 볼 수 있도록 제목과 첫 상품 목록은 서버에서 렌더링합니다.",
                }),
              },
              {
                title: l.trans({ en: "Stock editor", ko: "재고 수정 화면" }),
                desc: l.trans({
                  en: "Use a client component because the manager changes form values and clicks actions.",
                  ko: "관리자가 폼 값을 바꾸고 액션을 클릭해야 하므로 클라이언트 컴포넌트를 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Live dashboard", ko: "실시간 대시보드" }),
                desc: l.trans({
                  en: "Use client state and realtime updates because the screen keeps changing after load.",
                  ko: "로드 후에도 화면이 계속 바뀌므로 클라이언트 상태와 실시간 업데이트를 사용합니다.",
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

      <Scroll.Slide id="page-composition" title={l.trans({ en: "Page Composition Pattern", ko: "페이지 구성 패턴" })}>
        <Docs.Title>{l.trans({ en: "Page Composition Pattern", ko: "페이지 구성 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A typical business screen combines a server-rendered shell with client-side areas. A product listing page may render the title and first data on the server, then hand the list area to a client zone for pagination, filtering, realtime updates, or user actions.",
              ko: "일반적인 비즈니스 화면은 서버에서 렌더링되는 껍데기와 클라이언트에서 동작하는 영역을 함께 사용합니다. 상품 목록 페이지는 제목과 첫 데이터를 서버에서 렌더링하고, 목록 영역은 페이지네이션, 필터, 실시간 업데이트, 사용자 액션을 위해 클라이언트 zone에 넘길 수 있습니다.",
            })}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
              <div className="flex flex-col justify-between rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div>
                  <div className="text-base-content/60 text-sm">
                    {l.trans({ en: "Example model", ko: "예시 모델" })}
                  </div>
                  <div className="mt-3 w-fit rounded-full border border-primary/30 bg-primary/10 px-5 py-2 font-bold text-primary">
                    Article
                  </div>
                  <div className="mt-4 text-base-content/70 text-sm">
                    {l.trans({
                      en: "A single model creates a predictable UI stack from page entry points to backend calls.",
                      ko: "하나의 모델은 page 진입점부터 backend 호출까지 예측 가능한 UI 계층을 만듭니다.",
                    })}
                  </div>
                </div>
                <div className="mt-6 hidden items-center gap-3 text-primary xl:flex">
                  <div className="h-px flex-1 bg-primary/30" />
                  <span className="font-mono text-xl">→</span>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono font-semibold text-base-content">page</div>
                      <div className="mt-1 text-base-content/70 text-sm">index, new, [id], [id]/edit</div>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">01</div>
                  </div>
                  <div className="mt-2 text-base-content/60 text-xs">
                    {l.trans({
                      en: "Business screens and URL-level entry points.",
                      ko: "비즈니스 화면과 URL 단위 진입점입니다.",
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono font-semibold text-base-content">component</div>
                      <div className="mt-1 text-base-content/70 text-sm">Unit, Edit, View, Util, Zone</div>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">02</div>
                  </div>
                  <div className="mt-2 text-base-content/60 text-xs">
                    {l.trans({
                      en: "Reusable screen parts for display, forms, actions, and client zones.",
                      ko: "표시, 폼, 액션, 클라이언트 zone을 위한 재사용 화면 조각입니다.",
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono font-semibold text-base-content">store</div>
                      <div className="mt-1 text-base-content/70 text-sm">model, modelList, modelForm, modelModal</div>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">03</div>
                  </div>
                  <div className="mt-2 text-base-content/60 text-xs">
                    {l.trans({
                      en: "Client-side state for lists, forms, selected records, and modals.",
                      ko: "목록, 폼, 선택된 데이터, 모달을 위한 클라이언트 상태입니다.",
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono font-semibold text-base-content">fetch</div>
                      <div className="mt-1 text-base-content/70 text-sm">initModel, createModel, updateModel...</div>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">04</div>
                  </div>
                  <div className="mt-2 text-base-content/60 text-xs">
                    {l.trans({
                      en: "Generated calls that connect UI actions to backend signals.",
                      ko: "UI 액션을 백엔드 signal에 연결하는 생성 호출입니다.",
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200 p-4 lg:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono font-semibold text-base-content">backend</span>
                    <div className="h-px flex-1 bg-base-300" />
                    <span className="text-base-content/60 text-xs">
                      {l.trans({ en: "signals, services, database", ko: "signal, service, database" })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Typical Model Screen Flow", ko: "일반적인 모델 화면 흐름" })}
              </div>
              <div className="mt-1 text-base-content/70 text-sm">
                {l.trans({
                  en: "A model usually starts from a list screen. Users create a new record, open a detail page, then move to an edit page when they need to change existing data.",
                  ko: "모델 화면은 보통 목록 화면에서 시작합니다. 사용자는 새 데이터를 만들거나, 상세 화면을 열고, 기존 데이터를 수정해야 할 때 edit 화면으로 이동합니다.",
                })}
              </div>
            </div>
            <div className="grid items-center gap-4 xl:grid-cols-[1fr_auto_1.1fr_auto_1fr]">
              <div className="rounded-2xl border border-info/30 bg-info/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-base-content">index page</div>
                    <div className="text-base-content/60 text-xs">Model</div>
                  </div>
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-1 font-mono text-xs">+New</div>
                </div>
                <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-center text-base-content/70 text-sm">
                  Search bar
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-info/30 bg-info/10 px-2 py-3 text-center text-info text-xs"
                    >
                      Unit
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-center text-base-content/70 text-sm">
                  Pagination
                </div>
              </div>
              <div className="hidden text-center text-primary xl:block">
                <div className="font-mono text-2xl">↗</div>
                <div className="my-12 font-mono text-2xl">↘</div>
              </div>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
                  <div className="mb-3">
                    <div className="font-bold text-base-content">new page</div>
                    <div className="text-base-content/60 text-xs">New Model</div>
                  </div>
                  <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-12 text-center font-semibold text-warning">
                    Edit
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-1 text-sm">cancel</div>
                    <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-primary text-sm">
                      submit
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-base-content">view page</div>
                      <div className="text-base-content/60 text-xs">Model 1</div>
                    </div>
                    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-1 font-mono text-xs">
                      edit
                    </div>
                  </div>
                  <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-12 text-center font-semibold text-success">
                    View
                  </div>
                  <div className="mt-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-center text-base-content/70 text-sm">
                    etc
                  </div>
                </div>
              </div>
              <div className="hidden text-center text-primary xl:block">
                <div className="font-mono text-2xl">→</div>
              </div>
              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
                <div className="mb-3">
                  <div className="font-bold text-base-content">edit page</div>
                  <div className="text-base-content/60 text-xs">Model 1 - Edit</div>
                </div>
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-16 text-center font-semibold text-warning">
                  Edit
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-1 text-sm">cancel</div>
                  <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-primary text-sm">
                    submit
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-base-content/70 text-sm">
              <div>
                {l.trans({
                  en: "Index pages are optimized for discovery: search, scan, paginate, and choose an item.",
                  ko: "Index 페이지는 탐색에 최적화됩니다. 검색하고, 훑어보고, 페이지를 넘기고, 항목을 선택합니다.",
                })}
              </div>
              <div>
                {l.trans({
                  en: "New and edit pages focus on controlled input through Edit components and submit actions.",
                  ko: "New/Edit 페이지는 Edit 컴포넌트와 submit 액션을 통한 입력 제어에 집중합니다.",
                })}
              </div>
              <div>
                {l.trans({
                  en: "View pages present one record clearly, then expose follow-up actions like edit or related utilities.",
                  ko: "View 페이지는 하나의 데이터를 명확히 보여주고, edit 같은 후속 액션이나 관련 유틸리티를 제공합니다.",
                })}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{l.trans({ en: "Product listing", ko: "상품 목록" })}</div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Show the page title and first products quickly, then let the client zone handle filtering, pagination, and updates.",
                  ko: "페이지 제목과 첫 상품 목록을 빠르게 보여주고, 필터링, 페이지네이션, 업데이트는 클라이언트 zone이 처리하게 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Admin stock page", ko: "관리자 재고 화면" })}
              </div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Render product summary on the server, then use a client form to add stock through generated fetch or store helpers.",
                  ko: "상품 요약은 서버에서 렌더링하고, 재고 추가는 생성된 fetch 또는 store 헬퍼를 사용하는 클라이언트 폼에서 처리합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="client-state-st" title={l.trans({ en: "Client State With st", ko: "st 클라이언트 상태관리" })}>
        <Docs.Title>{l.trans({ en: "Client State With st", ko: "st 클라이언트 상태관리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After the page and components are clear, decide what state the browser owns. Use st for working state such as form values, selected rows, loading flags, filters, and derived labels.",
              ko: "page와 component 구조가 정리되면 브라우저가 가져야 할 상태를 정합니다. st는 폼 값, 선택된 행, 로딩 상태, 필터, 파생 라벨처럼 작업 중인 상태에 사용합니다.",
            })}
          </div>
          <Docs.Mermaid
            title="UI action state flow"
            chart={`flowchart LR
  component["Client Component"] --> useField["st.use.field"]
  component --> action["st.do.action"]
  action --> getState["this.get"]
  action --> setState["this.set"]
  setState --> rerender["Component Rerenders"]`}
          />
          <div className="space-y-1">
            {[
              {
                title: "stateBuilder",
                desc: l.trans({
                  en: "Declare writable state that can change while the user works, such as stockDraft and saving.",
                  ko: "사용자가 작업하는 동안 바뀌는 writable state를 선언합니다. stockDraft, saving 같은 값입니다.",
                }),
              },
              {
                title: "derivedState",
                desc: l.trans({
                  en: "Declare values computed from writable state, such as canSubmitStock from stockDraft and saving.",
                  ko: "writable state에서 계산되는 값을 선언합니다. stockDraft와 saving으로 만든 canSubmitStock 같은 값입니다.",
                }),
              },
              {
                title: "st.get / st.set",
                desc: l.trans({
                  en: "Read and update state inside store actions before and after business work.",
                  ko: "store action 안에서 비즈니스 작업 전후의 상태를 읽고 변경합니다.",
                }),
              },
              {
                title: "st.use.field / st.do.setField",
                desc: l.trans({
                  en: "Components subscribe to fields with st.use.*, and model forms use generated setters such as setNameOnProduct.",
                  ko: "컴포넌트는 st.use.*로 field를 구독하고, 모델 폼은 setNameOnProduct 같은 생성 setter를 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Use local component state for tiny UI-only details such as focus, hover, or a one-off input draft. Use st when several components share the value, when an action needs it, or when it should survive across a screen flow.",
              ko: "focus, hover, 일회성 입력 초안처럼 작은 UI 전용 값은 컴포넌트 local state로 충분합니다. 여러 컴포넌트가 공유하거나, action에서 필요하거나, 화면 흐름 동안 유지되어야 하는 값은 st에 둡니다.",
            })}
          </Docs.Alert>
          <Docs.CodeSnippet
            title="Stock store with state and derivedState"
            code={`export class StockStore extends store(
  "stock",
  () => ({
    stockDraft: 0,
    saving: false,
  }),
  ({ computed }) => ({
    canSubmitStock: computed(["stockDraft", "saving"], (stockDraft, saving) => {
      return stockDraft > 0 && !saving;
    }),
  }),
) {
  async addStock(productId: string) {
    const { stockDraft } = this.get();
    this.set({ saving: true });
    await fetch.addStock(productId, stockDraft);
    this.set({ stockDraft: 0, saving: false });
  }
}`}
          />
          <Docs.CodeSnippet
            title="Using st in a component"
            code={`"use client";

import { st } from "@apps/shop/client";

export function StockEditor({ productId }: { productId: string }) {
  const stockDraft = st.use.stockDraft();
  const canSubmitStock = st.use.canSubmitStock();

  return (
    <div>
      <input
        type="number"
        value={stockDraft}
        onChange={(e) => st.do.setStockDraft(Number(e.target.value))}
      />
      <button disabled={!canSubmitStock} onClick={() => st.do.addStock(productId)}>
        Add stock
      </button>
    </div>
  );
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="server-calls-fetch" title={l.trans({ en: "Server Calls With fetch", ko: "fetch 서버 호출" })}>
        <Docs.Title>{l.trans({ en: "Server Calls With fetch", ko: "fetch 서버 호출" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use fetch after the component has collected enough state and the action needs a server-side business decision. The server declares a signal endpoint, Akan generates the client function, and the store action calls it.",
              ko: "컴포넌트가 필요한 상태를 모았고 서버 측 비즈니스 판단이 필요할 때 fetch를 사용합니다. 서버는 signal endpoint를 선언하고, Akan은 클라이언트 함수를 생성하며, store action은 이를 호출합니다.",
            })}
          </div>

          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Call fetch directly", ko: "fetch 직접 호출" })}
              </div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Good for simple initial data or one-off reads where the component does not need to coordinate much state.",
                  ko: "컴포넌트가 많은 상태를 조율하지 않는 단순 초기 데이터나 일회성 조회에 적합합니다.",
                })}
              </div>
              <Docs.Mermaid
                title="Fetch directly flow"
                chart={`flowchart LR
  click["Button Click"] --> fetchCall["fetch.signinManager"]
  fetchCall --> endpoint["Signal Endpoint"]
  endpoint --> service["Business Service"]`}
              />
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Wrap fetch in a store action", ko: "store action으로 감싸기" })}
              </div>
              <div className="mt-2 text-base-content/70 text-sm">
                {l.trans({
                  en: "Good for forms and business actions because the action can read state, call fetch, then update loading, auth, list, or form state.",
                  ko: "폼과 비즈니스 액션에 적합합니다. action이 상태를 읽고 fetch를 호출한 뒤 loading, auth, list, form 상태를 갱신할 수 있습니다.",
                })}
              </div>
              <Docs.Mermaid
                title="Fetch with store action flow"
                chart={`flowchart LR
  click["Button Click"] --> storeAction["st.do.signinManager"]
  storeAction --> formState["this.get().signinForm"]
  formState --> fetchCall["fetch.signinManager"]
  fetchCall --> endpoint["Signal Endpoint"]
  endpoint --> service["Business Service"]`}
              />
            </div>
          </div>
          <Docs.CodeSnippet
            title="Business signal endpoint"
            code={`export class AccountEndpoint extends endpoint(srv.account, ({ mutation }) => ({
  signinManager: mutation(String)
    .body("accountId", String)
    .body("password", String)
    .exec(async function (accountId, password) {
      return await this.accountService.signinManager(accountId, password);
    }),
})) {}`}
          />
          <Docs.CodeSnippet
            title="Calling generated fetch"
            code={`const token = await fetch.signinManager(accountId, password);`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Keep business rules in the service. The client store should collect form state, call fetch, and update UI state; it should not duplicate password, permission, stock, or payment rules.",
              ko: "비즈니스 규칙은 service에 둡니다. 클라이언트 store는 폼 상태를 모으고 fetch를 호출하고 UI 상태를 갱신하는 역할을 맡으며, 비밀번호/권한/재고/결제 규칙을 중복 구현하지 않습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="generated-client" title={l.trans({ en: "Generated Helpers Summary", ko: "생성된 헬퍼 요약" })}>
        <Docs.Title>{l.trans({ en: "Generated Helpers Summary", ko: "생성된 헬퍼 요약" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan exposes app-specific helpers from @apps/<app>/client. After you understand the screen shape, st, and fetch, these helpers become the daily entry points for UI work.",
              ko: "Akan은 @apps/<app>/client에서 앱 전용 헬퍼를 제공합니다. 화면 구조, st, fetch를 이해하고 나면 이 헬퍼들이 UI 작업의 일상적인 진입점이 됩니다.",
            })}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "How They Work Together", ko: "함께 쓰이는 방식" })}
            </div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "A page usually uses usePage for route and language context, Model.* for the domain UI pieces, st for browser-side state, and fetch when a user action needs a server-side business answer.",
                ko: "하나의 page는 보통 usePage로 route와 language context를 읽고, Model.*에서 도메인 UI 조각을 가져오며, 브라우저 상태는 st로 다루고, 사용자 액션이 서버 비즈니스 응답을 필요로 할 때 fetch를 호출합니다.",
              })}
            </div>
            <div className="mt-4 space-y-1">
              {[
                { label: "usePage", detail: "params, l, page context" },
                { label: "Model.*", detail: "Unit, View, Edit, Zone" },
                { label: "st", detail: "state, derived, actions" },
                { label: "fetch", detail: "endpoint calls" },
              ].map(({ label, detail }) => (
                <div key={label} className="rounded-xl border border-base-300 bg-base-200 px-4 py-0">
                  <div className="font-mono font-semibold text-primary">{label}</div>
                  <div className="mt-2 text-base-content/70 text-sm">{detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {[
              {
                title: "st",
                desc: l.trans({
                  en: "Reads and updates client state through generated hooks and actions.",
                  ko: "생성된 hook과 action으로 클라이언트 상태를 읽고 변경합니다.",
                }),
              },
              {
                title: "fetch",
                desc: l.trans({
                  en: "Calls generated endpoints or prepares initial data for pages and zones.",
                  ko: "생성된 endpoint를 호출하거나 page와 zone에 필요한 초기 데이터를 준비합니다.",
                }),
              },
              {
                title: "Model.*",
                desc: l.trans({
                  en: "Gives each domain a predictable place for Unit, View, Edit, Zone, and Util components.",
                  ko: "각 도메인에서 Unit, View, Edit, Zone, Util 컴포넌트를 찾는 예측 가능한 진입점입니다.",
                }),
              },
              {
                title: "usePage",
                desc: l.trans({
                  en: "Provides language, params, and page context for business screens.",
                  ko: "비즈니스 화면에서 언어, params, page context를 사용할 수 있게 합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "You do not need to introduce all helpers at once. Start from the page and component, then add st only when state is shared, and add fetch only when the action needs a business response from the server.",
              ko: "모든 헬퍼를 한 번에 도입할 필요는 없습니다. page와 component에서 시작하고, 상태가 공유될 때 st를 추가하며, 액션이 서버의 비즈니스 응답을 필요로 할 때 fetch를 추가하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="i18n" title={l.trans({ en: "i18n", ko: "다국어" })}>
        <Docs.Title>{l.trans({ en: "i18n", ko: "다국어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Akan pages usually read the language helper from usePage, then render dictionary keys with l("model.dictKey"). This keeps UI text close to each domain dictionary instead of scattering raw strings through components.',
              ko: 'Akan page는 보통 usePage에서 language helper를 가져오고, l("model.dictKey") 방식으로 dictionary key를 렌더링합니다. 이렇게 하면 UI 문구를 컴포넌트 곳곳에 직접 흩뿌리지 않고 각 도메인 dictionary 가까이에 둘 수 있습니다.',
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Declare text once", ko: "문구를 한 곳에 선언" }),
                desc: l.trans({
                  en: "Dictionary files hold the English and Korean text for a domain.",
                  ko: "dictionary 파일은 도메인별 영어/한국어 문구를 보관합니다.",
                }),
                example: "user.dictionary.ts",
              },
              {
                title: l.trans({ en: "Use keys in UI", ko: "UI에서 key 사용" }),
                desc: l.trans({
                  en: 'Components render l("user.signWithGoogle") instead of hard-coded text.',
                  ko: '컴포넌트는 하드코딩 문구 대신 l("user.signWithGoogle")를 렌더링합니다.',
                }),
                example: 'l("user.signWithGoogle")',
              },
              {
                title: l.trans({ en: "Share across clients", ko: "클라이언트 간 공유" }),
                desc: l.trans({
                  en: "Customer, admin, partner, and mobile screens can reuse the same business vocabulary.",
                  ko: "고객, 관리자, 파트너, 모바일 화면이 같은 비즈니스 용어를 재사용할 수 있습니다.",
                }),
                example: "web, admin, mobile",
              },
            ].map(({ title, desc, example }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
                <div className="mt-3 rounded-lg border border-base-300 bg-base-200 px-3 py-2 font-mono text-base-content/70 text-xs">
                  {example}
                </div>
              </div>
            ))}
          </div>
          <Docs.CodeSnippet
            title="user.dictionary.ts"
            code={`import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:4]

import type { User } from "./user.constant";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["User", "사용자"]).desc(["User", "사용자"])) // [!code collapse:4]
  .model<User>((t) => ({
    name: t(["Name", "이름"]).desc(["Name", "이름"]),
  }))
  .translate({
    signWithGoogle: ["Sign in with Google", "구글로 시작하기"],
  });`}
          />
          <Docs.CodeSnippet
            title="UserSigninButton.tsx"
            code={`"use client"; // [!code collapse:2]

import { usePage } from "@apps/shop/client";

export function UserSigninButton() {
  const { l } = usePage();

  return (
    <button>
      {l("user.signWithGoogle")}
    </button>
  );
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="client-targets" title={l.trans({ en: "Client Targets", ko: "클라이언트 대상" })}>
        <Docs.Title>{l.trans({ en: "Client Targets", ko: "클라이언트 대상" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The same company may have a customer web site, an admin console, a partner portal, and a mobile field app. Akan UI architecture treats these as different client surfaces that can share backend logic while presenting different screens.",
              ko: "같은 회사도 고객 웹사이트, 관리자 콘솔, 파트너 포털, 모바일 현장 앱을 함께 가질 수 있습니다. Akan UI 아키텍처는 이들을 서로 다른 클라이언트 표면으로 다루면서도 백엔드 로직은 공유할 수 있게 합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Web SSR", ko: "웹 SSR" }),
                desc: l.trans({
                  en: "Use for public pages, landing pages, docs, product catalogs, and content that should appear quickly or be indexed well.",
                  ko: "공개 페이지, 랜딩 페이지, 문서, 상품 카탈로그처럼 빠르게 보여야 하거나 검색 노출이 중요한 콘텐츠에 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Web CSR", ko: "웹 CSR" }),
                desc: l.trans({
                  en: "Use for app-like screens where most value comes after login: admin consoles, editors, realtime dashboards, and internal tools.",
                  ko: "로그인 이후의 상호작용이 핵심인 앱형 화면에 사용합니다. 관리자 콘솔, 편집기, 실시간 대시보드, 내부 도구가 여기에 해당합니다.",
                }),
              },
              {
                title: l.trans({ en: "Multi-client web", ko: "다중 클라이언트 웹" }),
                desc: l.trans({
                  en: "Use when customer, admin, and partner screens need different routes, layouts, and permissions while sharing the same business services.",
                  ko: "고객, 관리자, 파트너 화면이 서로 다른 route, layout, permission을 가지면서 같은 비즈니스 서비스를 공유해야 할 때 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Mobile target", ko: "모바일 대상" }),
                desc: l.trans({
                  en: "Use for field apps, mobile webviews, or device-oriented screens that still talk to the same generated fetch and business services.",
                  ko: "현장 앱, 모바일 웹뷰, 장비 중심 화면처럼 같은 generated fetch와 비즈니스 서비스에 연결되는 모바일 표면에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Client target is a product decision before it is an infrastructure decision. First decide who uses the screen and what they need to do; Runtime And Infra explains where that client is deployed and routed.",
              ko: "클라이언트 대상은 인프라 결정이기 전에 제품 결정입니다. 먼저 누가 그 화면을 쓰고 무엇을 해야 하는지 정하세요. 해당 클라이언트가 어디에 배포되고 라우팅되는지는 Runtime And Infra에서 다룹니다.",
            })}
          </Docs.Alert>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Final Practical Checklist", ko: "마지막 실용 체크리스트" })}
            </div>
            <div className="mt-4 space-y-1">
              {[
                l.trans({
                  en: "Start with server-rendered pages when users should see meaningful content quickly.",
                  ko: "사용자가 의미 있는 내용을 빠르게 봐야 한다면 서버 렌더링 페이지로 시작하세요.",
                }),
                l.trans({
                  en: "Use client components only where interaction, state, realtime behavior, or browser/device APIs are needed.",
                  ko: "상호작용, 상태, 실시간 동작, 브라우저/디바이스 API가 필요한 부분에만 클라이언트 컴포넌트를 사용하세요.",
                }),
                l.trans({
                  en: "Keep domain UI close to model modules, and use ui/ for app-wide reusable visual components.",
                  ko: "도메인 UI는 모델 모듈 가까이에 두고, 앱 전체에서 재사용되는 시각 컴포넌트는 ui/에 두세요.",
                }),
                l.trans({
                  en: "Let generated fetch and st handle server communication and client state before writing custom API glue.",
                  ko: "직접 API 연결 코드를 만들기 전에 생성된 fetch와 st가 서버 통신과 클라이언트 상태를 처리하게 하세요.",
                }),
              ].map((desc) => (
                <div
                  key={desc}
                  className="rounded-xl border border-base-300 bg-base-100 px-4 py-0 text-base-content/70 text-sm"
                >
                  {desc}
                </div>
              ))}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
