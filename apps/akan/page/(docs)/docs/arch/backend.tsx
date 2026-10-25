import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "아키텍처: 비즈니스 서비스 | Akan.js" : "Architecture: Business Service | Akan.js";
    const description =
      lang === "ko"
        ? "엔드포인트·슬라이스·인터널의 흐름과 에러의 위치, 에이전트도 같은 엔드포인트를 쓰는 방식."
        : "Endpoint, slice and internal end to end, where an error belongs, and the same calls for agents.";
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

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const layers = [
      {
        file: "signal.ts",
        role: l.trans({ en: "The phone operator", ko: "전화 상담원" }),
        question: l.trans({ en: "May this caller ask at all?", ko: "이 호출자가 물어봐도 되는가?" }),
        desc: l.trans({
          en: "Takes the call, refuses the ones that should never reach the floor, and hands valid work to the right service.",
          ko: "연락을 받고, 현장까지 가서는 안 될 요청을 돌려보내고, 유효한 일을 알맞은 service에 넘깁니다.",
        }),
      },
      {
        file: "service.ts",
        role: l.trans({ en: "The business owner", ko: "업무 담당자" }),
        question: l.trans({ en: "What should happen?", ko: "무엇이 일어나야 하는가?" }),
        desc: l.trans({
          en: "Stock rules, payment status, reservation conflicts and external APIs are combined here into one meaningful action.",
          ko: "재고 규칙, 결제 상태, 예약 충돌, 외부 API 연동이 여기서 하나의 의미 있는 액션으로 합쳐집니다.",
        }),
      },
      {
        file: "document.ts",
        role: l.trans({ en: "The archive and its rulebook", ko: "문서고와 그 처리 규칙" }),
        question: l.trans({
          en: "How is the record stored, and which changes will it accept?",
          ko: "기록은 어떻게 저장되고, 어떤 상태 전이를 받아들이는가?",
        }),
        desc: l.trans({
          en: "The stored form, the query filters, and the state changes a record will accept. A chain method mutates and returns this; the caller saves.",
          ko: "저장 형태, query filter, 그리고 레코드가 받아들일 상태 전이를 정합니다. chain method는 값을 바꾸고 this를 돌려주며, 저장은 호출한 쪽이 합니다.",
        }),
      },
    ];

    const termRows = [
      {
        name: "guard",
        desc: l.trans({
          en: "A class that decides who may make a call. Every endpoint names its own in the signal file.",
          ko: "누가 이 호출을 해도 되는지 판단하는 클래스입니다. endpoint마다 signal 파일에서 직접 붙입니다.",
        }),
      },
      {
        name: "generated CRUD",
        desc: l.trans({
          en: "The create, read, update and remove endpoints every model already has. You never write them.",
          ko: "모든 모델이 이미 가진 생성, 조회, 수정, 삭제 endpoint입니다. 직접 쓰지 않습니다.",
        }),
      },
      {
        name: "chain method",
        desc: l.trans({
          en: "A state change on the document: it checks, mutates and returns this. The caller saves.",
          ko: "document에 두는 상태 전이 method입니다. 검사하고, 값을 바꾸고, this를 돌려줍니다. 저장은 호출한 쪽이 합니다.",
        }),
      },
      {
        name: "adaptor",
        desc: l.trans({
          en: "A singleton that wraps an outside system, such as a POS terminal, and is plugged into a service.",
          ko: "POS 단말기 같은 외부 시스템을 감싸는 싱글턴입니다. service에 plug로 꽂아 씁니다.",
        }),
      },
      {
        name: "room",
        desc: l.trans({
          en: "A pubsub channel. Every screen subscribed to it receives what the server publishes there.",
          ko: "pubsub 채널입니다. 그곳을 구독한 화면은 서버가 publish하는 것을 모두 받습니다.",
        }),
      },
    ];

    const shapes = [
      {
        name: "query / mutation",
        desc: l.trans({
          en: "The screen asks once and expects one result: load a list, save a form, approve a request, add stock.",
          ko: "화면이 한 번 묻고 한 번의 결과를 기대합니다. 목록 불러오기, 폼 저장, 요청 승인, 재고 추가입니다.",
        }),
      },
      {
        name: "message",
        desc: l.trans({
          en: "An open screen keeps a websocket conversation going: device control, a live operation panel, a guided workflow.",
          ko: "열린 화면이 websocket 대화를 이어갑니다. 장비 제어, 실시간 운영 패널, 단계형 작업 흐름입니다.",
        }),
      },
      {
        name: "pubsub",
        desc: l.trans({
          en: "One business change is pushed into a room that many screens, dashboards, devices or users subscribe to.",
          ko: "하나의 비즈니스 변경을 여러 화면, 대시보드, 장비, 사용자가 구독하는 room으로 밀어줍니다.",
        }),
      },
      {
        name: "process / cron / interval",
        desc: l.trans({
          en: "The work is queued, scheduled, repeated, or tied to the server lifecycle rather than to a caller.",
          ko: "작업이 queue에 들어가거나, 예약되거나, 반복되거나, 호출자가 아니라 서버 생명주기에 묶입니다.",
        }),
      },
    ];

    const published = { on: true, off: false };
    const leftOut = { on: false, off: true };
    const mcpGroups = [
      {
        label: l.trans({ en: "Decided by the guards", ko: "guard가 정하는 것" }),
        rows: [
          {
            name: "guards: [Admin]",
            desc: l.trans({
              en: "An endpoint that declares a real guard is published to agents.",
              ko: "실질 guard를 선언한 endpoint는 에이전트에게 게시됩니다.",
            }),
            marks: published,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "no guards", ko: "guards 없음" })}</span>,
            desc: l.trans({
              en: "Refused. A missing guards array now costs visibility as well as authorization.",
              ko: "거부됩니다. guards 배열을 빠뜨리면 권한뿐 아니라 노출까지 잃습니다.",
            }),
            marks: leftOut,
          },
          {
            name: "mutation · [Public]",
            desc: l.trans({
              en: "A mutation whose only guard is Public is refused too.",
              ko: "guard가 Public뿐인 mutation도 거부됩니다.",
            }),
            marks: leftOut,
          },
        ],
      },
      {
        label: l.trans({ en: "Decided by the shape", ko: "형태가 정하는 것" }),
        rows: [
          {
            name: "pubsub · message",
            desc: l.trans({ en: "Refused.", ko: "거부됩니다." }),
            marks: leftOut,
          },
          {
            name: "fileUpload: true",
            desc: l.trans({ en: "A file upload is refused.", ko: "파일 업로드는 거부됩니다." }),
            marks: leftOut,
          },
          {
            name: "Any · Binary",
            desc: l.trans({
              en: "An endpoint returning Any or Binary is refused.",
              ko: "Any나 Binary를 반환하는 endpoint는 거부됩니다.",
            }),
            marks: leftOut,
          },
        ],
      },
      {
        label: l.trans({ en: "Your own choice", ko: "직접 고르는 것" }),
        rows: [
          {
            name: "mcp: false",
            desc: l.trans({
              en: "Takes the endpoint off the shelf without touching its guards. Right for a step of a UI-driven state machine: perfectly guarded, still no business of a model.",
              ko: "guard를 건드리지 않고 endpoint를 선반에서만 내립니다. guard는 완벽하지만 모델이 건드릴 일은 아닌, UI가 이끄는 상태 기계의 한 단계에 맞는 답입니다.",
            }),
            marks: leftOut,
          },
        ],
      },
    ];

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
                en: "A customer taps Order on the kiosk, and that one button has to do four things: refuse the order when the mango has run out, write the order down, hand back a receipt now, and put the ticket on the kitchen screen before the customer turns away.",
                ko: "고객이 키오스크에서 주문 버튼을 누르면, 그 버튼 하나가 네 가지 일을 해야 합니다. 망고가 떨어졌으면 주문을 거절하고, 주문을 기록하고, 지금 영수증을 돌려주고, 고객이 돌아서기 전에 주방 화면에 티켓을 띄우는 일입니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({ en: "One tap, four jobs", ko: "한 번의 탭, 네 가지 일" })}
              image="kiosk-order"
              prompt={`
              A person at the far left tapping a tall kiosk stand whose screen shows one big button, the stand
              labelled "Kiosk". One arrow runs from the kiosk to a server in the centre, its outline traced as the red
              accent, labelled "Business Service". Four arrows leave the server to the right, reaching four things
              stacked top to bottom: a small ice cream cone labelled "Stock Check"; a database cylinder labelled "Order
              Saved"; a small paper receipt labelled "Receipt"; a monitor showing a small ticket labelled "Kitchen
              Screen".
            `}
              alt={l.trans({
                en: "One tap on the kiosk reaches the business service, which checks the stock, saves the order, hands back a receipt, and puts a ticket on the kitchen screen.",
                ko: "키오스크의 탭 한 번이 비즈니스 서비스에 닿고, 서비스는 재고를 확인하고, 주문을 저장하고, 영수증을 돌려주고, 주방 화면에 티켓을 띄웁니다.",
              })}
            />
            <div>
              {l.trans({
                en: "None of that is drawing a screen. Together it is the business service: the action a request asks for, the business rule behind it, the background job it starts, and the change other screens must be told about.",
                ko: "어느 것도 화면을 그리는 일이 아닙니다. 이 일들을 합쳐 비즈니스 서비스라고 부릅니다. 요청이 부탁하는 액션, 그 뒤의 비즈니스 규칙, 액션이 시작하는 백그라운드 작업, 그리고 다른 화면에 알려야 하는 변경입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Every module splits that work across the same three files, and the split never changes. A request arrives at the API port and passes through them in order:",
                ko: "모든 모듈은 이 일을 같은 파일 세 개로 나누고, 나누는 기준은 바뀌지 않습니다. 요청은 API 포트에 도착해 세 파일을 차례로 지나갑니다:",
              })}
            </div>
            <Docs.Flow
              title={l.trans({ en: "One module, top to bottom", ko: "모듈 하나, 위에서 아래로" })}
              direction="TB"
              nodes={{
                caller: { label: l.trans({ en: "Browser · mobile app · agent", ko: "브라우저 · 모바일 앱 · agent" }) },
                api: { label: l.trans({ en: "API port", ko: "API 포트" }), lines: ["8282/api"] },
                signal: {
                  label: "icecreamOrder.signal.ts",
                  lines: ["endpoint · slice", "· internal"],
                },
                service: {
                  label: "icecreamOrder.service.ts",
                  lines: [l.trans({ en: "rules · other services", ko: "규칙 · 다른 service" }), "· external APIs"],
                },
                document: {
                  label: "icecreamOrder.document.ts",
                  lines: [l.trans({ en: "schema · filters", ko: "schema · filter" }), "· chain methods"],
                },
                stored: { label: l.trans({ en: "Stored data", ko: "저장된 데이터" }), tone: "muted" },
              }}
              edges={[
                ["caller", "api"],
                ["api", "signal"],
                ["signal", "service"],
                ["service", "document"],
                ["document", "stored"],
              ]}
              emphasis={["service"]}
            />
            <div>
              {l.trans({
                en: "Each file answers one question, and only that one:",
                ko: "파일마다 답하는 질문이 하나씩 있고, 그 질문에만 답합니다:",
              })}
            </div>
            <div className="my-4 space-y-3">
              {layers.map((layer) => (
                <div key={layer.file} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="font-mono text-primary">{layer.file}</strong>
                    <span className="text-foreground/50 text-xs">{layer.role}</span>
                  </div>
                  <div className="mt-1 font-medium text-foreground text-sm">{layer.question}</div>
                  <div className="mt-1 text-foreground/70 text-sm">{layer.desc}</div>
                </div>
              ))}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>The layers are not a formality.</strong> A rule written into the kiosk screen ships once per
                    client and drifts. The same rule on the service is one answer for the kiosk, the admin console, the
                    mobile app and an AI agent, because all four arrive through the same endpoint.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이 계층 분리는 형식이 아닙니다.</strong> 키오스크 화면에 적어 넣은 규칙은 클라이언트마다 한
                    벌씩 배포되고 서로 어긋나기 시작합니다. 같은 규칙을 service에 두면 키오스크, 관리자 콘솔, 모바일 앱,
                    AI 에이전트에게 하나의 답이 됩니다. 넷 다 같은 endpoint로 들어오기 때문입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="two-actions"
          title={l.trans({ en: "Two Actions, End To End", ko: "두 액션, 처음부터 끝까지" })}
        >
          <Docs.Title>{l.trans({ en: "Two Actions, End To End", ko: "두 액션, 처음부터 끝까지" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Let's follow two real actions from the counter through the three files:",
                ko: "카운터에서 일어나는 실제 액션 두 개를 세 파일에 걸쳐 따라가 봅니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "A customer places an order", ko: "고객이 주문을 넣습니다" })}
                </div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Creating an order is generated CRUD, so no endpoint is written for it. What you write is the rule: an order takes stock out of today's inventory.",
                    ko: "주문 생성은 생성된 CRUD라 endpoint를 따로 쓰지 않습니다. 직접 쓰는 것은 규칙입니다. 주문은 오늘 재고를 차감합니다.",
                  })}
                </div>
                <code className={chip}>_preCreate</code>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Staff move it to the next status", ko: "직원이 주문을 다음 상태로 옮깁니다" })}
                </div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "This one is not generated. It is a mutation you declare, and only an admin may call it.",
                    ko: "이것은 생성되지 않습니다. 직접 선언하는 mutation이고, admin만 호출할 수 있습니다.",
                  })}
                </div>
                <code className={chip}>processIcecreamOrder</code>
              </div>
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`import { Admin, Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, () => ({})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: Admin, get: Public, cru: Every } },
  (init) => ({
    byStatuses: init()
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses);
      }),
  }),
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Admin] })
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
})) {}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>IcecreamOrderSlice.byStatuses</code> is the order list a screen loads, filtered by status.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>IcecreamOrderSlice.byStatuses</code>는 화면이 불러오는 주문 목록이고, 상태로 거릅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>processIcecreamOrder</code> is one line of delegation, because the decision is not the
                      endpoint&apos;s to make.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>processIcecreamOrder</code>는 위임 한 줄입니다. 판단은 endpoint의 몫이 아니기 때문입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "The decision lives in the service. This is where the order meets a second module, inventory, and where both documents are loaded before either is saved:",
                ko: "판단은 service에 있습니다. 주문이 두 번째 모듈인 inventory와 만나는 자리이고, 두 document를 모두 불러온 뒤에야 저장하는 자리입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
              code={`import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ service }) => ({
  inventoryService: service<srv.InventoryService>(),
})) {
  override async _preCreate(data: db.IcecreamOrderInput) {
    await this.inventoryService.useStocks([
      { type: "yogurtIcecream", quantity: data.size },
      ...data.toppings.map((topping) => ({ type: topping, quantity: 1 })),
    ]);
    return data;
  }
  async processIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.process().save();
  }
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>_preCreate</code> runs before the generated create saves the order. It hands the stock
                      deduction to <code>inventoryService</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>_preCreate</code>는 생성된 create가 주문을 저장하기 전에 돕니다. 재고 차감은{" "}
                      <code>inventoryService</code>에 맡깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>processIcecreamOrder</code> loads the order, calls the chain method <code>process()</code>,
                      then saves.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>processIcecreamOrder</code>는 주문을 불러오고, chain method <code>process()</code>를 부른 뒤
                      저장합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "The manager's half is the mirror image: the same three files, a different guard, and no state machine, because refilling today's inventory is allowed whenever an admin asks. Its signal appears in Bounding A Call below.",
                ko: "관리자의 몫은 거울상입니다. 같은 파일 세 개, 다른 guard, 그리고 상태 기계가 없습니다. 오늘 재고 보충은 admin이 요청하면 언제든 허용되기 때문입니다. 그 signal은 아래 '호출에 경계 두기'에 나옵니다.",
              })}
            </div>
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>The rule of thumb is short.</strong> If the code answers a business question, it belongs in
                    service logic. If it only draws a screen or holds temporary UI state, it stays on the UI side.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기준은 짧습니다.</strong> 코드가 비즈니스 질문에 답한다면 service 로직에 두고, 화면을
                    그리거나 임시 UI 상태만 다룬다면 UI 쪽에 둡니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="signal-shapes"
          title={l.trans({ en: "Endpoint, Slice, Internal", ko: "Endpoint, Slice, Internal" })}
        >
          <Docs.Title>{l.trans({ en: "Endpoint, Slice, Internal", ko: "Endpoint, Slice, Internal" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A model's signal file exports exactly three classes, and every module declares all three even when two of them are empty. Which one you reach for depends on one thing: who starts the call.",
                ko: "모델의 signal 파일은 클래스 셋을 내보내고, 둘이 비어 있더라도 모든 모듈이 셋을 모두 선언합니다. 어느 것을 쓸지는 하나로 정해집니다. 누가 그 호출을 시작하는가입니다.",
              })}
            </div>
            <Docs.Table
              stacked
              columns={[
                { key: "cls", label: l.trans({ en: "Class", ko: "클래스" }), code: true },
                { key: "who", label: l.trans({ en: "Who calls it", ko: "누가 부르나" }) },
                { key: "what", label: l.trans({ en: "What goes in it", ko: "무엇을 담나" }) },
              ]}
              rows={[
                {
                  cls: "endpoint",
                  who: l.trans({
                    en: (
                      <span>
                        A user, through <code>fetch.*</code>
                      </span>
                    ),
                    ko: (
                      <span>
                        사용자가 <code>fetch.*</code>로
                      </span>
                    ),
                  }),
                  what: l.trans({
                    en: (
                      <span>
                        <code>query</code> / <code>mutation</code>, or <code>message</code> / <code>pubsub</code> on an
                        open connection
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>query</code> / <code>mutation</code>, 또는 열린 연결의 <code>message</code> /{" "}
                        <code>pubsub</code>
                      </span>
                    ),
                  }),
                },
                {
                  cls: "slice",
                  who: l.trans({ en: "A screen", ko: "화면이" }),
                  what: l.trans({
                    en: (
                      <span>
                        <code>fetch.initXInY(...)</code> in the route seeds the store; <code>st.do.initXInY()</code>{" "}
                        reloads it
                      </span>
                    ),
                    ko: (
                      <span>
                        라우트의 <code>fetch.initXInY(...)</code>가 store를 채우고, <code>st.do.initXInY()</code>가 다시
                        불러옵니다
                      </span>
                    ),
                  }),
                },
                {
                  cls: "internal",
                  who: l.trans({ en: "The server itself", ko: "서버 자신이" }),
                  what: l.trans({
                    en: (
                      <span>
                        Schedules such as <code>cron</code>, lifecycle hooks, and queued <code>process</code> jobs
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>cron</code> 같은 예약 작업, 생명주기 hook, queue에 들어가는 <code>process</code> 작업
                      </span>
                    ),
                  }),
                },
              ]}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Choosing by what the screen needs", ko: "화면에 필요한 것으로 고르기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Start from the product behavior, not from the class list. Does the user need an answer now, a live conversation, a broadcast to many screens, or a job that finishes later?",
                ko: "클래스 목록이 아니라 제품 동작에서 시작하세요. 사용자가 지금 답을 받아야 하는지, 열린 연결로 대화해야 하는지, 여러 화면에 알려야 하는지, 나중에 끝나는 작업인지에 따라 고릅니다.",
              })}
            </div>
            <Docs.Flow
              title={l.trans({ en: "Signal shape choice", ko: "Signal 형태 선택" })}
              direction="TB"
              nodes={{
                need: {
                  label: l.trans({ en: "What does the screen need?", ko: "화면이 무엇을 필요로 하는가?" }),
                  tone: "info",
                },
                now: { label: l.trans({ en: "Answer now", ko: "지금 답이 필요" }) },
                live: { label: l.trans({ en: "Keep talking while open", ko: "열려 있는 동안 계속 대화" }) },
                many: { label: l.trans({ en: "Notify many screens", ko: "여러 화면에 알림" }) },
                later: { label: l.trans({ en: "Finish later", ko: "나중에 마무리" }) },
                api: { label: l.trans({ en: "Use query or mutation", ko: "query 또는 mutation" }) },
                message: { label: l.trans({ en: "Use message", ko: "message" }) },
                pubsub: { label: l.trans({ en: "Use pubsub", ko: "pubsub" }) },
                internal: { label: l.trans({ en: "Use process or schedule", ko: "process 또는 schedule" }) },
              }}
              edges={[
                ["need", "now"],
                ["need", "live"],
                ["need", "many"],
                ["need", "later"],
                ["now", "api"],
                ["live", "message"],
                ["many", "pubsub"],
                ["later", "internal"],
              ]}
            />
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {shapes.map((shape) => (
                <div key={shape.name} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                  <div className="font-mono font-semibold text-primary text-sm">{shape.name}</div>
                  <div className="mt-1 text-foreground/70 text-sm">{shape.desc}</div>
                </div>
              ))}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="endpoint-options" title={l.trans({ en: "Bounding A Call", ko: "호출에 경계 두기" })}>
          <Docs.Title>{l.trans({ en: "Bounding A Call", ko: "호출에 경계 두기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every endpoint takes an option object, and guards is only its first field. The rest say how the call behaves: how long it may take, whether its answer may be reused, whether agents see it.",
                ko: "모든 endpoint는 option 객체를 받고, guards는 그중 첫 번째 필드일 뿐입니다. 나머지 필드는 호출이 어떻게 동작할지 정합니다. 얼마나 오래 걸려도 되는지, 응답을 재사용해도 되는지, 에이전트에게 보이는지입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Here is the manager's half of the shift:",
                ko: "아래는 관리자의 몫입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/inventory/inventory.signal.ts"
              code={`import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class InventoryInternal extends internal(srv.inventory, () => ({})) {}

export class InventorySlice extends slice(
  srv.inventory,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.inventoryService.queryAny();
    }),
  }),
) {}

export class InventoryEndpoint extends endpoint(srv.inventory, ({ query, mutation }) => ({
  getTodaysInventory: query(cnst.Inventory, { guards: [Public], cache: 1000 }).exec(async function () { // [!code highlight]
    return await this.inventoryService.getTodaysInventory();
  }),
  refillTodaysInventory: mutation(cnst.Inventory, { guards: [Admin], timeout: 60_000 }).exec(async function () { // [!code highlight]
    return await this.inventoryService.refillTodaysInventory();
  }),
})) {}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>getTodaysInventory</code> is a read the whole shop shares: <code>Public</code>, and its
                      answer is reused for a second (<code>cache: 1000</code>).
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>getTodaysInventory</code>는 가게 전체가 공유하는 읽기입니다. <code>Public</code>이고, 응답을
                      1초 동안 재사용합니다(<code>cache: 1000</code>).
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>refillTodaysInventory</code> is a write only an admin may make, and a stock provider can
                      make it slow, so it gets a minute (<code>timeout: 60_000</code>).
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>refillTodaysInventory</code>는 admin만 할 수 있는 쓰기이고, 재고 공급처 사정으로 느려질 수
                      있어 1분을 줍니다(<code>timeout: 60_000</code>).
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.OptionTable
              items={[
                {
                  key: "guards",
                  type: "GuardCls[]",
                  desc: l.trans({
                    en: "Who may call this. An endpoint that names none runs no check; there is no default policy.",
                    ko: "누가 호출할 수 있는지입니다. 아무것도 적지 않으면 검사가 없으며, 기본 정책은 없습니다.",
                  }),
                },
                {
                  key: "timeout",
                  type: "number",
                  default: "30000 (client)",
                  desc: l.trans({
                    en: (
                      <span>
                        Milliseconds this call may take; the <code>Timeout</code> middleware and the client both enforce
                        it.
                      </span>
                    ),
                    ko: (
                      <span>
                        이 호출이 쓸 수 있는 밀리초입니다. <code>Timeout</code> middleware와 클라이언트가 함께
                        강제합니다.
                      </span>
                    ),
                  }),
                },
                {
                  key: "cache",
                  type: "number",
                  desc: l.trans({
                    en: (
                      <span>
                        Milliseconds the answer may be reused, one day at most.{" "}
                        <strong>Only a query taking no internal argument</strong> may carry one.
                      </span>
                    ),
                    ko: (
                      <span>
                        응답을 재사용할 수 있는 밀리초이며, 최대 하루입니다.{" "}
                        <strong>internal argument가 없는 query만</strong> 가질 수 있습니다.
                      </span>
                    ),
                  }),
                },
                {
                  key: "mcp",
                  type: "boolean",
                  default: "true",
                  desc: l.trans({
                    en: (
                      <span>
                        <code>false</code> takes the endpoint out of the MCP catalogue without touching its guards.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>false</code>는 guard를 건드리지 않고 endpoint를 MCP 카탈로그에서 내립니다.
                      </span>
                    ),
                  }),
                },
                {
                  key: "method",
                  type: '"POST" | "PATCH" | "PUT" | "DELETE"',
                  default: '"POST"',
                  desc: l.trans({
                    en: (
                      <span>
                        The HTTP verb a <code>mutation</code> answers on, for when a foreign wire protocol forces one.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>mutation</code>이 응답할 HTTP verb입니다. 외부 와이어 프로토콜이 verb를 강제할 때 씁니다.
                      </span>
                    ),
                  }),
                },
              ]}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Every call has a deadline, even without a timeout.</strong> An endpoint that declares none
                    still dies at 30 seconds, the client&apos;s own default, and the transport error it raises does not
                    say whether the server ever received the call. Provisioning, a firmware flow, an external
                    orchestration: declare one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>timeout을 적지 않아도 마감은 있습니다.</strong> <code>timeout</code>이 없는 endpoint도
                    클라이언트 자체 기본값인 30초에 끊기고, 그때 나는 전송 에러는 서버가 호출을 받기라도 했는지 말해주지
                    않습니다. 프로비저닝, 펌웨어 절차, 외부 오케스트레이션이라면 직접 적으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>Losing the race does not cancel the work.</strong> The handler runs to completion with
                    nobody holding its result, so a deadline is an answer to the caller, not an undo.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>경주에서 져도 작업은 취소되지 않습니다.</strong> handler는 결과를 받을 사람 없이 끝까지
                    돌아갑니다. 마감 시한은 호출자에게 주는 답이지 되돌리기가 아닙니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="beyond-the-request"
          title={l.trans({ en: "Work That Outlives The Request", ko: "요청보다 오래 사는 작업" })}
        >
          <Docs.Title>{l.trans({ en: "Work That Outlives The Request", ko: "요청보다 오래 사는 작업" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Some work has no caller waiting for it. Nobody presses a button to make ice cream melt, and nobody asks for last night's orders to be closed. That work goes in the Internal class, and the server starts it itself:",
                ko: "호출자가 기다리지 않는 작업도 있습니다. 아이스크림이 녹으라고 버튼을 누르는 사람도, 지난밤 주문을 정리해 달라고 요청하는 사람도 없습니다. 이런 작업은 Internal 클래스에 두고, 서버가 스스로 시작합니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>interval(10000)</code>: served ice cream melts on its own schedule, so every ten seconds the
                      server warns about it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>interval(10000)</code>: 내어준 아이스크림은 자기 일정대로 녹으므로, 서버가 10초마다
                      경고합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>cron("0 4 * * *", …)</code>: orders nobody collected are closed out overnight, at 4 a.m.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>cron("0 4 * * *", …)</code>: 아무도 찾아가지 않은 주문을 밤사이 새벽 4시에 정리합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "Both are internal signals, and the batch replica, the server process that runs background jobs, is what runs them.",
                ko: "둘 다 internal signal이고, 이를 실제로 돌리는 것은 백그라운드 작업을 맡는 서버 프로세스인 batch replica입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "The same file also gains a pubsub room. It is an endpoint nobody calls, because the server is what publishes into it:",
                ko: "같은 파일에 pubsub room도 하나 생깁니다. 아무도 호출하지 않는 endpoint입니다. 그곳에 publish하는 것은 서버이기 때문입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`import { Admin, Every } from "@libs/shared/srvkit"; // [!code collapse:6]
import { ID } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ cron, interval }) => ({
  warnIcecreamMeltingAll: interval(10000).exec(async function () { // [!code ++:6]
    await this.icecreamOrderService.warnIcecreamMeltingAll();
  }),
  cancelStaleOrders: cron("0 4 * * *", { serverMode: "batch", operationMode: ["cloud"] }).exec(async function () {
    await this.icecreamOrderService.cancelStaleOrders();
  }),
})) {}

export class IcecreamOrderSlice extends slice( // [!code collapse:11]
  srv.icecreamOrder,
  { guards: { root: Admin, get: Public, cru: Every } },
  (init) => ({
    byStatuses: init()
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses);
      }),
  }),
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation, pubsub }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Admin] }) // [!code collapse:5]
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
  icecreamOrderEntered: pubsub(cnst.LightIcecreamOrder, { guards: [Admin] }) // [!code ++:3]
    .room("status", cnst.IcecreamOrderStatus)
    .exec(() => undefined),
})) {}`}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Telling screens that are already open", ko: "이미 열린 화면에 알리기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "When an order moves to processing, the kitchen screen is already open, and nobody is going to press refresh. So the service publishes the saved order into the room named after its new status, and every screen subscribed to that status appends the ticket.",
                ko: "주문이 processing으로 넘어갈 때 주방 화면은 이미 열려 있고, 아무도 새로고침을 누르지 않습니다. 그래서 service가 저장된 주문을 새 상태 이름의 room으로 publish하고, 그 상태를 구독하는 화면마다 티켓이 덧붙습니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({ en: "One publish, every open screen", ko: "publish 한 번, 열린 화면 모두에" })}
              image="pubsub-room"
              prompt={`
              On the left, a server labelled "Business Service". One arrow labelled "publish" runs right to a rounded
              box whose outline is traced as the red accent, labelled "Room" with a smaller second line "processing".
              From the room, three arrows run right to three identical monitors stacked top to bottom, each showing
              one small ticket. A tall bracket to the right of the monitors is labelled "Subscribed Screens". Nothing
              else.
            `}
              alt={l.trans({
                en: "The business service publishes the processed order once into the room for its status, and every kitchen screen subscribed to that room receives the ticket.",
                ko: "비즈니스 서비스가 처리된 주문을 그 상태의 room에 한 번 publish하면, 그 room을 구독한 주방 화면 모두가 티켓을 받습니다.",
              })}
            />
            <div>
              {l.trans({
                en: "The service reaches its own signal through an injected field, then publishes right after the save:",
                ko: "service는 주입받은 필드로 자기 signal에 닿고, 저장 바로 뒤에 publish합니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
              code={`import { serve } from "akanjs/service"; // [!code collapse:5]

import * as db from "../db";
import type * as sig from "../sig";
import type * as srv from "../srv";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ service, signal }) => ({
  inventoryService: service<srv.InventoryService>(),
  icecreamOrderSignal: signal<sig.IcecreamOrder>(), // [!code ++]
})) {
  async processIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    const processed = await icecreamOrder.process().save(); // [!code ++:3]
    await this.icecreamOrderSignal.icecreamOrderEntered(processed.status, processed);
    return processed;
  }
}`}
            />
            <div className={panelRecipe({ radius: "lg" }, "my-4")}>
              <div className="mb-2 font-semibold text-primary">
                {l.trans({ en: "A heavy job uses all three at once:", ko: "무거운 작업은 셋을 한꺼번에 씁니다:" })}
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-foreground/70 text-sm">
                <li>
                  {l.trans({
                    en: "A mutation starts the monthly settlement report and returns the queued record immediately.",
                    ko: "mutation이 월간 정산 리포트를 시작하고, queue에 올라간 레코드를 즉시 돌려줍니다.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "An internal process, reached from the service through an injected signal, builds the file.",
                    ko: "주입된 signal을 통해 service가 부르는 internal process가 파일을 만듭니다.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "A slice lets the screen read progress, status, and the download result as the record changes.",
                    ko: "slice는 레코드가 바뀌는 동안 화면이 진행률, 상태, 다운로드 결과를 읽게 합니다.",
                  })}
                </li>
              </ol>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="service-dependencies"
          title={l.trans({ en: "What A Service Is Handed", ko: "Service가 건네받는 것" })}
        >
          <Docs.Title>{l.trans({ en: "What A Service Is Handed", ko: "Service가 건네받는 것" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A service never builds the things it needs. It lists them in the builder argument of serve(), and the container hands each one in before any handler runs.",
                ko: "service는 필요한 것을 직접 만들지 않습니다. serve()의 builder 인자에 적어 두면, handler가 하나라도 돌기 전에 컨테이너가 하나씩 건네줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "That is what lets a payment provider, a cache backend or a whole sibling module be swapped without editing the business method that uses it.",
                ko: "덕분에 결제 제공자, 캐시 백엔드, 옆 모듈 전체를 그것을 쓰는 업무 method를 고치지 않고 교체할 수 있습니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({ en: "Handed in, never built", ko: "만들지 않고 건네받습니다" })}
              image="service-injection"
              prompt={`
              In the centre, a large rounded rectangle whose outline is traced as the red accent, labelled "Service".
              On its left, four small things stacked top to bottom, each with one short arrow pointing into the
              service's left edge: a small box labelled "Inventory Service"; a small card-terminal box labelled "POS
              Adaptor"; a small gear labelled "Env"; a stack of three thin flat disks labelled "Memory". Nothing else.
            `}
              alt={l.trans({
                en: "Another module's service, an adaptor, an environment value and shared memory are each handed into the service from outside; the service builds none of them.",
                ko: "다른 모듈의 service, adaptor, 환경 값, 공유 메모리가 각각 바깥에서 service로 건네집니다. service는 그중 어느 것도 직접 만들지 않습니다.",
              })}
            />
            <Docs.OptionTable
              items={[
                {
                  key: "service",
                  type: "<T extends Service>() => T",
                  desc: l.trans({
                    en: (
                      <span>
                        Another module&apos;s service. The field must end in <code>Service</code>:{" "}
                        <code>inventoryService</code> resolves <code>inventory</code>.
                      </span>
                    ),
                    ko: (
                      <span>
                        다른 모듈의 service입니다. 필드 이름은 <code>Service</code>로 끝나야 하며,{" "}
                        <code>inventoryService</code>는 <code>inventory</code>로 풀립니다.
                      </span>
                    ),
                  }),
                  example: "inventoryService: service<srv.InventoryService>()",
                },
                {
                  key: "plug",
                  type: "(adaptor: AdaptorCls) => Adaptor",
                  desc: l.trans({
                    en: (
                      <span>
                        An adaptor singleton: an <code>adapt()</code> class, or a role that{" "}
                        <code>option.applyAdaptor</code> binds.
                      </span>
                    ),
                    ko: (
                      <span>
                        adaptor 싱글턴입니다. <code>adapt()</code> 클래스, 또는 <code>option.applyAdaptor</code>가
                        구현을 정하는 role입니다.
                      </span>
                    ),
                  }),
                  example: "posTerminal: plug(PosTerminal)",
                },
                {
                  key: "signal",
                  type: "<S>() => S",
                  desc: l.trans({
                    en: (
                      <span>
                        The module&apos;s own signal, to publish a <code>pubsub</code> room or enqueue a{" "}
                        <code>process</code>. Ends in <code>Signal</code>.
                      </span>
                    ),
                    ko: (
                      <span>
                        그 모듈의 signal입니다. <code>pubsub</code> room에 publish하거나 <code>process</code>를 큐에
                        넣습니다. 이름은 <code>Signal</code>로 끝납니다.
                      </span>
                    ),
                  }),
                  example: "icecreamOrderSignal: signal<sig.IcecreamOrder>()",
                },
                {
                  key: "env",
                  type: "(fn: (env) => T) => T",
                  desc: l.trans({
                    en: "A value read out of the backend environment at wiring time.",
                    ko: "배선 시점에 백엔드 환경에서 읽는 값입니다.",
                  }),
                  example: "pos: env((option: PosTerminalOptions) => option.pos)",
                },
                {
                  key: "memory",
                  type: "(ref, opts?) => Store",
                  desc: l.trans({
                    en: "Runtime state held in the cache adaptor, so every replica sees it. Takes a scalar or model class.",
                    ko: "cache adaptor에 보관되어 모든 replica가 보는 런타임 상태입니다. 스칼라나 모델 클래스를 받습니다.",
                  }),
                  example: "openTickets: memory(Map, { of: String })",
                },
                {
                  key: "use",
                  type: "<T>() => T",
                  desc: l.trans({
                    en: (
                      <span>
                        Legacy: a constructor-style singleton from <code>lib/option.ts</code>. Write new adapters with{" "}
                        <code>adapt()</code>.
                      </span>
                    ),
                    ko: (
                      <span>
                        legacy입니다. <code>lib/option.ts</code>의 생성자 방식 싱글턴을 가져옵니다. 새 adapter는{" "}
                        <code>adapt()</code>로 씁니다.
                      </span>
                    ),
                  }),
                  example: "alarmApi: use<AlarmApi>()",
                },
              ]}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Writing an adaptor", ko: "adaptor 작성하기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "An adaptor is the unit you plug. It is a class built on adapt(), and it registers itself under the name it is given.",
                ko: "plug의 단위는 adaptor입니다. adapt()로 만든 클래스이고, 주어진 이름으로 스스로 등록합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "It takes the same injectors as a service minus service and signal. So an adaptor can hold config, another adaptor and shared state, but not business logic:",
                ko: "service와 같은 주입기를 받되 service와 signal은 빠집니다. 그래서 adaptor는 설정, 다른 adaptor, 공유 상태를 가질 수 있지만 비즈니스 로직은 갖지 않습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/srvkit/posTerminal.ts"
              code={`import { adapt } from "akanjs/service";

import { Err } from "../lib/dict";

export interface PosTerminalOptions {
  pos: { endpoint: string; storeId: string };
}

export class PosTerminal extends adapt("posTerminal" as const, ({ env, memory }) => ({
  pos: env((option: PosTerminalOptions) => option.pos),
  openTickets: memory(Map, { of: String }),
})) {
  override async onInit() {
    await this.openTickets.clear();
  }

  async charge(icecreamOrderId: string, amount: number) {
    const ticket = await this.#api<{ ticketId: string }>("/charge", {
      method: "POST",
      body: JSON.stringify({ storeId: this.pos.storeId, amount }),
    });
    await this.openTickets.set(icecreamOrderId, ticket.ticketId);
    return ticket.ticketId;
  }

  async #api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(\`\${this.pos.endpoint}\${path}\`, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Err("koyo.error.posUnavailable");
    return (await response.json()) as T;
  }
}`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    A database-backed service also receives its own model as <code>this.&lt;refName&gt;Model</code>{" "}
                    without declaring anything — <code>serve(db.inventory, …)</code> is what adds it. The worked walk
                    through each injector, including how a role is bound, is on{" "}
                    <Link href="/cheatsheet/observability/di" className="text-primary">
                      Dependency Injection
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    데이터베이스 기반 service는 자기 모델을 <code>this.&lt;refName&gt;Model</code>로 아무것도 선언하지
                    않고 받습니다. <code>serve(db.inventory, …)</code>가 붙여주기 때문입니다. 주입기별 상세한 사용법과
                    role을 묶는 방법은{" "}
                    <Link href="/cheatsheet/observability/di" className="text-primary">
                      의존성 주입
                    </Link>
                    에 있습니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="error-placement" title={l.trans({ en: "Where An Error Belongs", ko: "에러가 놓일 자리" })}>
          <Docs.Title>{l.trans({ en: "Where An Error Belongs", ko: "에러가 놓일 자리" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Refusing an order because the mango ran out and refusing an order from a customer who is not signed in are not the same refusal, and they are not written in the same file. Each layer throws what only it can know:",
                ko: "망고가 없어서 주문을 거절하는 것과 로그인하지 않은 고객의 주문을 거절하는 것은 같은 거절이 아니고, 같은 파일에 쓰지도 않습니다. 각 계층은 자기만 알 수 있는 것을 던집니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "A customer who is not signed in: the guard in signal.ts refuses before anything else runs.",
                  ko: "로그인하지 않은 고객: 다른 무엇보다 먼저 signal.ts의 guard가 거절합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "The mango ran out: another document forbids it, so service.ts refuses.",
                  ko: "망고가 떨어짐: 다른 document가 막는 일이므로 service.ts가 거절합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "An order that is not active cannot be processed: the record's own state forbids it, so document.ts refuses.",
                  ko: "active가 아닌 주문은 처리할 수 없음: 레코드 자신의 상태가 막는 일이므로 document.ts가 거절합니다.",
                })}
              </li>
            </ul>
            <Docs.Flow
              title={l.trans({ en: "Which layer refuses", ko: "어느 계층이 거절하는가" })}
              direction="TB"
              nodes={{
                call: { label: l.trans({ en: "A call arrives", ko: "호출 도착" }) },
                guard: {
                  label: "signal.ts guards",
                  lines: [l.trans({ en: "may this caller do this at all?", ko: "이 호출자가 이 일을 해도 되는가?" })],
                },
                denied: {
                  label: l.trans({
                    en: "401 or 403 · the guard returns false",
                    ko: "401 또는 403 · guard가 false 반환",
                  }),
                  tone: "danger",
                },
                service: {
                  label: "service.ts",
                  lines: [l.trans({ en: "does another document forbid it?", ko: "다른 document가 막는가?" })],
                },
                document: {
                  label: "document.ts",
                  lines: [
                    l.trans({ en: "is this record in a state that allows it?", ko: "이 레코드가 허용하는 상태인가?" }),
                  ],
                },
                saved: {
                  label: l.trans({
                    en: "chain method mutates · caller saves",
                    ko: "chain 메서드가 변경 · 호출자가 save",
                  }),
                },
                dict: {
                  label: "dictionary .error key",
                  lines: [l.trans({ en: "translated for the caller", ko: "호출자에게 번역됨" })],
                  tone: "muted",
                },
              }}
              edges={[
                ["call", "guard"],
                ["guard", "denied", { label: l.trans({ en: "no", ko: "아니오" }) }],
                ["guard", "service", { label: l.trans({ en: "yes", ko: "예" }) }],
                ["service", "document"],
                ["document", "saved"],
                ["service", "dict", { label: "throw new Err", dashed: true }],
                ["document", "dict", { label: "throw new Err", dashed: true }],
              ]}
              emphasis={["document"]}
            />
            <div>
              {l.trans({
                en: "A chain method is the smallest version of this. It validates, mutates, and returns this. It never saves, so chains compose and the caller decides when the write happens:",
                ko: "chain method가 이 규칙의 가장 작은 형태입니다. 검증하고, 값을 바꾸고, this를 돌려줍니다. 저장은 하지 않습니다. 그래야 chain이 이어 붙고, 쓰기 시점은 호출한 쪽이 정합니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts"
              code={`import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({ // [!code collapse:10]
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.IcecreamOrderStatus])
      .query((statuses, q) => ({
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
      })),
  },
  sort: {},
})) {}

export class IcecreamOrder extends by(cnst.IcecreamOrder) {
  process() {
    if (this.status !== "active") throw new Err("icecreamOrder.error.onlyActiveCanBeProcessed");
    this.status = "processing";
    return this;
  }
  serve() {
    if (this.status !== "processing") throw new Err("icecreamOrder.error.onlyProcessingCanBeServed");
    this.status = "served";
    return this;
  }
}

export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}`}
            />
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never <code>throw new Error</code>.
                    </strong>{" "}
                    A raw error is generalized to <code>Internal Server Error</code> on the way out, so the customer is
                    told nothing and the log is told no key. Throw{" "}
                    <code>new Err(&quot;&lt;module&gt;.error.&lt;key&gt;&quot;)</code> instead, and register the key as
                    an <code>[en, ko]</code> pair in that module&apos;s dictionary <code>.error(&#123;&#125;)</code>{" "}
                    stage. That is what makes the refusal readable in the caller&apos;s own language.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>throw new Error</code>는 쓰지 마세요.
                    </strong>{" "}
                    날것의 에러는 나가는 길에 <code>Internal Server Error</code>로 일반화되므로, 고객은 아무것도 듣지
                    못하고 로그에도 키가 남지 않습니다. 대신{" "}
                    <code>new Err(&quot;&lt;module&gt;.error.&lt;key&gt;&quot;)</code>를 던지고, 그 키를 해당 모듈
                    dictionary의 <code>.error(&#123;&#125;)</code> 단계에 <code>[en, ko]</code> 쌍으로 등록하세요.
                    거절이 호출자의 언어로 읽히는 이유가 그것입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>
              {l.trans({ en: "When failing is not an error", ko: "실패가 에러가 아닐 때" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Best-effort code does not throw at all. It returns a plain value, and the caller decides whether that is an error:",
                ko: "최선을 다하는 정도의 코드는 아예 던지지 않습니다. 평범한 값을 돌려주고, 그것이 에러인지는 호출한 쪽이 정합니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "An adaptor that cannot reach a provider logs and returns null.",
                  ko: "제공처에 닿지 못한 adaptor는 로그를 남기고 null을 돌려줍니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "A guard that cannot load a record warns and returns false.",
                  ko: "레코드를 불러오지 못한 guard는 warn을 남기고 false를 돌려줍니다.",
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "There are no Result wrappers anywhere in the stack.",
                ko: "이 스택 어디에도 Result 래퍼는 없습니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="agent-shelf"
          title={l.trans({ en: "The Same Endpoints, For Agents", ko: "같은 Endpoint, 에이전트에게는" })}
        >
          <Docs.Title>
            {l.trans({ en: "The Same Endpoints, For Agents", ko: "같은 Endpoint, 에이전트에게는" })}
          </Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every signal is also served to AI agents as an MCP server on POST /mcp, mounted by default. You write nothing extra in a signal file, and there is no per-endpoint switch to turn on.",
                ko: "모든 signal은 기본 마운트되는 POST /mcp에서 MCP 서버로 AI 에이전트에게도 제공됩니다. signal 파일에 따로 적을 것도 없고, endpoint마다 켜야 하는 스위치도 없습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Instead, exposure follows the guards. The guards are already the authorization decision, and a second switch would only guarantee that endpoints added later stay invisible until somebody remembers them.",
                ko: "대신 노출은 guard를 따릅니다. guard가 이미 권한 부여 결정이고, 스위치를 하나 더 두면 나중에 추가되는 endpoint가 누군가 기억해 낼 때까지 보이지 않게 될 뿐이기 때문입니다.",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Endpoint", ko: "Endpoint" })}
              columns={[
                { key: "on", label: l.trans({ en: "Published", ko: "게시" }) },
                { key: "off", label: l.trans({ en: "Left out", ko: "제외" }) },
              ]}
              groups={mcpGroups}
              markLabel={l.trans({ en: "What agents get", ko: "에이전트가 받는 결과" })}
              emptyLabel={l.trans({ en: "Not this", ko: "해당 없음" })}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    The business service you already wrote is therefore the agent surface too: the same guards, the same{" "}
                    <code>Err</code>, the same service method. What changes is the cost of the catalogue and who may be
                    on the other end. The wire, the OAuth metadata, the rate limits and the <code>Person</code> guard
                    are on{" "}
                    <Link href="/cheatsheet/interface/mcp" className="text-primary">
                      MCP Server
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    그래서 이미 작성한 비즈니스 서비스가 곧 에이전트 표면입니다. 같은 guard, 같은 <code>Err</code>, 같은
                    service method입니다. 달라지는 것은 카탈로그의 비용과 반대편에 누가 있을 수 있는가입니다. 와이어,
                    OAuth 메타데이터, rate limit, <code>Person</code> guard 이야기는{" "}
                    <Link href="/cheatsheet/interface/mcp" className="text-primary">
                      MCP 서버
                    </Link>
                    에 있습니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
