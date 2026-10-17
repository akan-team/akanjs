import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title =
      lang === "ko" ? "튜토리얼: 슬라이스로 표시하기 | Akan.js" : "Tutorials: Displaying with Slice | Akan.js";
    const description =
      lang === "ko"
        ? "하나의 데이터를 손님과 직원, 관리자 관점으로 실시간 대시보드 슬라이스로 보여 줍니다."
        : "Serve one dataset to customers, staff and admins through a realtime dashboard slice.";
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
        <Scroll.Slide
          id="displaying-with-slice"
          title={l.trans({ en: "Displaying with Slice", ko: "슬라이스로 보여주기" })}
        >
          <Docs.Title>{l.trans({ en: "Displaying with Slice", ko: "슬라이스로 보여주기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `We want to show customers a real-time dashboard of ice cream order processing. Completed orders should be displayed prominently, and the list of ongoing orders should also be visible. By using Slice, you can present the same ice cream order data in real time from different perspectives for customers, staff, and administrators.`,
                ko: `손님들에게 아이스크림 주문 처리 현황을 실시간으로 대시보드를 보여주고자 합니다. 처리가 완료된 주문은 크게 보여주고, 진행중인 주문의 리스트도 보여줘야 합니다. 슬라이스를 사용하면 아이스크림 주문이라는 데이터에 대해 손님, 직원, 관리자 등 다양한 관점으로 실시간으로 보여줄 수 있습니다.`,
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="dashboard-slice" title={l.trans({ en: "Dashboard Slice", ko: "대시보드 슬라이스" })}>
          <Docs.Title>{l.trans({ en: "Dashboard Slice", ko: "대시보드 슬라이스" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `First, let's declare a slice for the real-time dashboard to show to customers. You can display the waiting orders and the orders being picked up by querying them separately.`,
                ko: `먼저, 고객들에게 보여줄 실시간 대시보드용 슬라이스를 선언해봅시다. 대시보드에는 대기중인 주문과 픽업 중인 주문을 조회해서 보여줄 수 있습니다.`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`
import { ID } from "akanjs/base"; // [!code collapse:12]
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ interval }) => ({
  warnIcecreamMeltingAll: interval(10000).exec(async function () {
    await this.icecreamOrderService.warnIcecreamMeltingAll();
  }),
})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder, // [!code collapse:2]
  { guards: { root: None, get: Public, cru: None, create: Public } },
  (init) => ({
    inPublic: init({ guards: [Public] }).exec(function () {
      return this.icecreamOrderService.queryAny();
    }),
    inWaiting: init({ guards: [Public] }).exec(function () { // [!code ++:6]
      return this.icecreamOrderService.queryByStatuses(["active", "processing"]);
    }),
    inPickup: init({ guards: [Public] }).exec(function () {
      return this.icecreamOrderService.queryByStatuses(["served"]);
    }),
  }),
) {}
// [!code collapse:23]
export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
  serveIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.serveIcecreamOrder(icecreamOrderId);
    }),
  finishIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    }),
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.cancelIcecreamOrder(icecreamOrderId);
    }),
})) {}`}
            />
            <div>
              {l.trans({
                en: `inWaiting slice is a slice that queries the waiting orders and inPickup slice is a slice that queries the orders being picked up. Each init() names its own guards, and the dashboard is public. When the slice is declared, the state and actions of the store are automatically created.`,
                ko: `inWaiting 슬라이스는 대기중인 주문을 조회하는 슬라이스이고, inPickup 슬라이스는 픽업 중인 주문을 조회하는 슬라이스입니다. 각 init()은 자신의 guards를 지정하며, 대시보드는 누구나 볼 수 있으므로 Public입니다. 슬라이스가 선언되면 store의 상태와 액션이 자동으로 생성됩니다.`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
              code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:33]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ]),
  )
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status of the icecream order", "아이스크림 주문의 활성 상태"]),
    processing: t(["Processing", "처리중"]).desc([
      "Processing status of the icecream order",
      "아이스크림 주문의 처리중 상태",
    ]),
    served: t(["Served", "서빙완료"]).desc(["Served status of the icecream order", "아이스크림 주문의 서빙완료 상태"]),
    finished: t(["Finished", "완료"]).desc(["Finished status of the icecream order", "아이스크림 주문의 완료 상태"]),
    canceled: t(["Canceled", "취소"]).desc(["Canceled status of the icecream order", "아이스크림 주문의 취소 상태"]),
  }))
  .enum<Topping>("topping", (t) => ({
    fruitRings: t(["Fruit Rings", "과일 링"]).desc(["Fruit Rings topping", "과일 링 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    cheeseCube: t(["Cheese Cube", "치즈 큐브"]).desc(["Cheese Cube topping", "치즈 큐브 토핑"]),
    corn: t(["Corn", "옥수수"]).desc(["Corn topping", "옥수수 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
    banana: t(["Banana", "바나나"]).desc(["Banana topping", "바나나 토핑"]),
    fig: t(["Fig", "무화과"]).desc(["Fig topping", "무화과 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
    inWaiting: fn(["IcecreamOrder In Waiting", "IcecreamOrder 대기"]).arg((t) => ({})), // [!code ++:2]
    inPickup: fn(["IcecreamOrder In Pickup", "IcecreamOrder 픽업"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({ // [!code collapse:38]
    processIcecreamOrder: fn(["Process", "작업시작"])
      .desc(["Start processing an ice cream order", "아이스크림 주문 처리를 시작합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to process", "처리할 주문의 ID"]),
      })),
    serveIcecreamOrder: fn(["Serve", "서빙완료"])
      .desc(["Mark an ice cream order as served", "아이스크림 주문을 서빙완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to serve", "서빙할 주문의 ID"]),
      })),
    finishIcecreamOrder: fn(["Finish", "완료"])
      .desc(["Mark an ice cream order as finished", "아이스크림 주문을 완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to finish", "완료할 주문의 ID"]),
      })),
    cancelIcecreamOrder: fn(["Cancel", "주문취소"])
      .desc(["Cancel an ice cream order", "아이스크림 주문을 취소합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to cancel", "취소할 주문의 ID"]),
      })),
  }))
  .error({
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"],
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({});`}
            />
            <div>
              {l.trans({
                en: `Just like labeling different shelves in an ice cream shop - "Ready for pickup", "Being made" - we need to give proper names to our slices in the dictionary. This ensures the UI displays meaningful labels and the slice functions are properly documented.`,
                ko: `아이스크림 가게에서 선반마다 "픽업 대기", "제작 중"처럼 라벨을 붙이는 것처럼, 슬라이스에도 dictionary에서 적절한 이름을 부여해야 합니다. 이렇게 하면 UI에서 의미 있는 레이블이 표시되고 슬라이스 함수들이 적절히 문서화됩니다.`,
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="connect-to-zone" title={l.trans({ en: "Connect to Zone", ko: "존과 연결하기" })}>
          <Docs.Title>{l.trans({ en: "Connect to Zone", ko: "존과 연결하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `Now let's build the actual dashboard page that customers will see. Think of this like the large display screens in a cafe that show "Now Serving: Order #42" - it needs to show different views of the same order data simultaneously. We'll use Zone components to connect our slices to the UI and display them in real-time.`,
                ko: `이제 고객들이 볼 실제 대시보드 페이지를 만들어봅시다. 카페에서 "현재 서빙 중: 주문 #42"를 보여주는 대형 디스플레이 화면처럼 생각해보세요 - 같은 주문 데이터의 다른 뷰를 동시에 보여줘야 합니다. Zone 컴포넌트를 사용해서 슬라이스를 UI에 연결하고 실시간으로 표시할 것입니다.`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/dashboard.tsx"
              code={`
import { fetch, IcecreamOrder, usePage } from "@apps/koyo/client";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  const { icecreamOrderInitInWaiting } = fetch.initIcecreamOrderInWaiting();
  const { icecreamOrderInitInPickup } = fetch.initIcecreamOrderInPickup();
  return (
    <div className="flex size-full gap-2 p-4">
      <div className="w-2/3">
        <h2 className="my-2 font-bold text-3xl">{l("icecreamOrder.pickup")}</h2>
        <IcecreamOrder.Zone.Card
          className="space-y-2"
          init={icecreamOrderInitInPickup}
          slice={fetch.slice.icecreamOrderInPickup}
          showControls={false}
        />
      </div>
      <div className="w-1/3">
        <h2 className="my-2 font-bold text-3xl">{l("icecreamOrder.waiting")}</h2>
        <IcecreamOrder.Zone.Card
          className="space-y-2"
          init={icecreamOrderInitInWaiting}
          slice={fetch.slice.icecreamOrderInWaiting}
          showControls={false}
        />
      </div>
    </div>
  );
});
`}
            />
            <div>
              {l.trans({
                en: `Don't forget to add the translation labels for the dashboard sections:`,
                ko: `다국어를 위한 번역 레이블 추가를 잊지 마세요:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
              code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:66]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ]),
  )
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status of the icecream order", "아이스크림 주문의 활성 상태"]),
    processing: t(["Processing", "처리중"]).desc([
      "Processing status of the icecream order",
      "아이스크림 주문의 처리중 상태",
    ]),
    served: t(["Served", "서빙완료"]).desc(["Served status of the icecream order", "아이스크림 주문의 서빙완료 상태"]),
    finished: t(["Finished", "완료"]).desc(["Finished status of the icecream order", "아이스크림 주문의 완료 상태"]),
    canceled: t(["Canceled", "취소"]).desc(["Canceled status of the icecream order", "아이스크림 주문의 취소 상태"]),
  }))
  .enum<Topping>("topping", (t) => ({
    fruitRings: t(["Fruit Rings", "과일 링"]).desc(["Fruit Rings topping", "과일 링 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    cheeseCube: t(["Cheese Cube", "치즈 큐브"]).desc(["Cheese Cube topping", "치즈 큐브 토핑"]),
    corn: t(["Corn", "옥수수"]).desc(["Corn topping", "옥수수 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
    banana: t(["Banana", "바나나"]).desc(["Banana topping", "바나나 토핑"]),
    fig: t(["Fig", "무화과"]).desc(["Fig topping", "무화과 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
    inWaiting: fn(["IcecreamOrder In Waiting", "IcecreamOrder 대기"]).arg((t) => ({})),
    inPickup: fn(["IcecreamOrder In Pickup", "IcecreamOrder 픽업"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({
    processIcecreamOrder: fn(["Process", "작업시작"])
      .desc(["Start processing an ice cream order", "아이스크림 주문 처리를 시작합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to process", "처리할 주문의 ID"]),
      })),
    serveIcecreamOrder: fn(["Serve", "서빙완료"])
      .desc(["Mark an ice cream order as served", "아이스크림 주문을 서빙완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to serve", "서빙할 주문의 ID"]),
      })),
    finishIcecreamOrder: fn(["Finish", "완료"])
      .desc(["Mark an ice cream order as finished", "아이스크림 주문을 완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to finish", "완료할 주문의 ID"]),
      })),
    cancelIcecreamOrder: fn(["Cancel", "주문취소"])
      .desc(["Cancel an ice cream order", "아이스크림 주문을 취소합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to cancel", "취소할 주문의 ID"]),
      })),
  }))
  .error({
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"],
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({
    waiting: ["Waiting", "대기중"], // [!code ++:2]
    pickup: ["Pickup", "픽업가능"],
  });
`}
            />
            <div>
              {l.trans({
                en: `Let's break down how this dashboard page works:`,
                ko: `이 대시보드 페이지가 어떻게 작동하는지 살펴봅시다:`,
              })}
            </div>
            <div className="my-4 space-y-3">
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{"fetch.initIcecreamOrderIn*()"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Notice there is no await. Both slice queries leave the moment they are called, and destructuring the result gives one promise per field instead of a resolved object. Each promise goes straight to the Zone that renders it, so the pickup board and the waiting board arrive independently — a slow query on one never delays the other, and the page heading is on the wire before either lands.`,
                    ko: `await가 없다는 점에 주목하세요. 두 슬라이스 쿼리는 호출되는 순간 이미 출발하고, 결과를 구조분해하면 해소된 객체가 아니라 필드별 promise를 얻습니다. 각 promise는 그것을 렌더링하는 Zone에 그대로 전달되므로 픽업 보드와 대기 보드가 서로 독립적으로 도착합니다 — 한쪽 쿼리가 느려도 다른 쪽이 기다리지 않고, 페이지 제목은 둘 중 어느 것도 도착하기 전에 이미 전송됩니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">IcecreamOrder.Zone.Card</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Zone components connect slice data to UI rendering. init is the window the route already resolved, and slice names the store slice the Zone hydrates and that its controls write back to.`,
                    ko: `Zone 컴포넌트는 슬라이스 데이터를 UI 렌더링에 연결합니다. init은 라우트가 이미 해소한 윈도우이고, slice는 Zone이 하이드레이션하고 컨트롤이 다시 기록할 스토어 슬라이스를 지정합니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{"showControls={false}"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `For the customer-facing dashboard, we hide the action controls. Customers should only see the status, not modify orders. This is a common pattern for read-only displays.`,
                    ko: `고객용 대시보드에서는 액션 컨트롤을 숨깁니다. 고객은 상태만 볼 수 있고 주문을 수정할 수 없어야 합니다. 이것은 읽기 전용 디스플레이의 일반적인 패턴입니다.`,
                  })}
                </div>
              </div>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="zone-with-slice" title={l.trans({ en: "Zone with Slice", ko: "슬라이스를 사용한 Zone" })}>
          <Docs.Title>{l.trans({ en: "Zone with Slice", ko: "슬라이스를 사용한 Zone" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `For a real-time dashboard, the data needs to stay fresh. When a staff member changes an order status, customers watching the display should see it update on their own. The Zone component combined with useInterval refreshes the board on a timer - just like how airport departure boards re-read the schedule every few seconds.`,
                ko: `실시간 대시보드에서는 데이터가 항상 최신 상태여야 합니다. 직원이 주문 상태를 변경하면 디스플레이를 보고 있는 고객들이 알아서 업데이트되는 것을 봐야 합니다. Zone 컴포넌트와 useInterval을 결합하면 보드가 타이머에 맞춰 새로고침됩니다 - 공항 출발 게시판이 몇 초마다 시간표를 다시 읽는 것처럼요.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `Let's look at how to control the display with props and automatic refresh:`,
                ko: `props와 자동 새로고침으로 디스플레이를 제어하는 방법을 살펴봅시다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
              code={`
import { type cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client"; // [!code collapse:4]
import { cn, type ModelProps } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

interface CardProps extends ModelProps<"icecreamOrder", cnst.LightIcecreamOrder> { // [!code ++:4]
  showControls?: boolean;
}
export const Card = ({ icecreamOrder, showControls = true }: CardProps) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-background via-muted to-border px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center"> // [!code collapse:25]
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-block rounded bg-muted px-2 py-1 font-bold text-xs uppercase tracking-wider">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-primary">#{icecreamOrder.id.slice(-4)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-block rounded border border-border bg-background px-2 py-1 font-bold text-primary text-xs uppercase tracking-wider">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={cn(
              "ml-2 rounded-full px-3 py-1 font-semibold text-sm",
              icecreamOrder.status === "active" && "border border-primary/40 bg-background text-primary",
              icecreamOrder.status === "processing" && "border border-warning/40 bg-background text-warning",
              icecreamOrder.status === "served" && "border border-info/40 bg-info text-info-foreground",
              icecreamOrder.status === "finished" && "border border-accent/40 bg-background text-accent",
              icecreamOrder.status === "canceled" && "border border-border bg-background text-foreground/70",
            )}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      {showControls ? ( // [!code ++]
        <div className="flex items-center justify-center gap-2 rounded-xl bg-background p-4">
          <Model.ViewWrapper slice={fetch.slice.icecreamOrder} modelId={icecreamOrder.id}>
            <button type="button" className={buttonRecipe({ variant: "primary" })}>
              <span>{l.trans({ en: "View", ko: "보기" })}</span>
            </button>
          </Model.ViewWrapper>
          <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
          <IcecreamOrder.Util.Serve
            icecreamOrderId={icecreamOrder.id}
            disabled={icecreamOrder.status !== "processing"}
          />
          <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
          <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
        </div>
      ) : null} // [!code ++]
    </div>
  );
};`}
            />
            <div>
              {l.trans({
                en: `The Unit component now accepts a showControls prop that determines whether to display action buttons. This simple flag allows the same Unit card component to be used in both staff management views (with controls) and customer dashboard views (without controls).`,
                ko: `Unit 컴포넌트는 이제 액션 버튼 표시 여부를 결정하는 showControls prop을 받습니다. 이 간단한 플래그를 통해 같은 Unit 카드 컴포넌트를 직원 관리 뷰(컨트롤 포함)와 고객 대시보드 뷰(컨트롤 없음) 모두에서 사용할 수 있습니다.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `Now let's see how the Zone component manages automatic data refresh:`,
                ko: `이제 Zone 컴포넌트가 어떻게 자동 데이터 새로고침을 관리하는지 살펴봅시다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
              code={`
"use client";
import { type cnst, fetch, IcecreamOrder, st } from "@apps/koyo/client";
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";
import { useInterval } from "akanjs/webkit"; // [!code ++]
import { Fragment } from "react";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
  slice?: SliceMeta;
  showControls?: boolean; // [!code ++]
}
export const Card = ({ className, init, slice = fetch.slice.icecreamOrder, showControls = true }: CardProps) => { // [!code ++:4]
  useInterval(() => {
    void st.slice[slice.sliceName as "icecreamOrder"].do.refreshIcecreamOrder();
  }, 3000);
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
        <Fragment key={icecreamOrder.id}>
          <IcecreamOrder.Unit.Card icecreamOrder={icecreamOrder} showControls={showControls} />
          {showControls ? ( // [!code ++]
            <Model.ViewModal
              id={icecreamOrder.id}
              slice={slice}
              renderTitle={(icecreamOrder: cnst.IcecreamOrder) => \`IcecreamOrder - \${icecreamOrder.id}\`}
              renderView={(icecreamOrder: cnst.IcecreamOrder) => (
                <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
              )}
            />
          ) : null} // [!code ++]
        </Fragment>
      )}
    />
  );
};
// [!code collapse:13]
interface ViewProps {
  className?: string;
  view: ClientView<"icecreamOrder", cnst.IcecreamOrder>;
}
export const View = ({ view }: ViewProps) => {
  return (
    <Load.View
      view={view}
      renderView={(icecreamOrder) => <IcecreamOrder.View.General icecreamOrder={icecreamOrder} />}
    />
  );
};`}
            />
            <div>
              {l.trans({
                en: `Let's understand the key features of this Zone component:`,
                ko: `이 Zone 컴포넌트의 주요 기능을 이해해봅시다:`,
              })}
            </div>
            <div className="my-4 space-y-3">
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">useInterval</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `This is a plain 3-second poll: every mounted Zone re-runs the slice query whether anything changed or not, which is enough for one shop's board. Live sync is the real answer - a slice that declares .live() pushes each change to its subscribers, and Load.Units subscribes on its own with no interval at all.`,
                    ko: `이것은 단순한 3초 폴링입니다. 마운트된 Zone마다 변경 여부와 무관하게 슬라이스 쿼리를 다시 실행하며, 가게 한 곳의 보드에는 이 정도로 충분합니다. 진짜 답은 live sync입니다 - 슬라이스가 .live()를 선언하면 변경분이 구독자에게 푸시되고, Load.Units가 알아서 구독하므로 interval이 아예 필요 없습니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">refreshIcecreamOrder</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `The refresh function is automatically generated for each slice. It re-queries the data using the same conditions defined in the slice, ensuring consistent data fetching.`,
                    ko: `새로고침 함수는 각 슬라이스에 대해 자동으로 생성됩니다. 슬라이스에 정의된 동일한 조건을 사용하여 데이터를 다시 쿼리하므로 일관된 데이터 가져오기가 보장됩니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">Load.Units</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Load.Units handles rendering a list of items with proper loading states. It automatically manages the mapping from slice data to individual Unit cards.`,
                    ko: `Load.Units는 적절한 로딩 상태와 함께 아이템 목록의 렌더링을 처리합니다. 슬라이스 데이터에서 개별 Unit 카드로의 매핑을 자동으로 관리합니다.`,
                  })}
                </div>
              </div>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="slice-component-rules"
          title={l.trans({ en: "Slice Component Rules", ko: "슬라이스 컴포넌트 규칙" })}
        >
          <Docs.Title>{l.trans({ en: "Slice Component Rules", ko: "슬라이스 컴포넌트 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `When working with slices and zones in Akan.js, following consistent patterns ensures your code remains maintainable and predictable. Think of these rules as the "house rules" of your ice cream shop - they keep everything running smoothly even as the shop grows.`,
                ko: `Akan.js에서 슬라이스와 존을 사용할 때 일관된 패턴을 따르면 코드가 유지보수 가능하고 예측 가능하게 유지됩니다. 이러한 규칙을 아이스크림 가게의 "규정"이라고 생각해보세요 - 가게가 성장해도 모든 것이 원활하게 운영되도록 해줍니다.`,
              })}
            </div>
            <div className="my-4 space-y-4">
              <div className={panelRecipe({ radius: "lg" })}>
                <div className="mb-2">
                  <strong className="text-primary">
                    {l.trans({ en: "One Slice, One Purpose", ko: "하나의 슬라이스, 하나의 목적" })}
                  </strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Each slice should have a clear, single purpose. inWaiting shows waiting orders, inPickup shows ready orders. Don't try to make a slice that does everything - create multiple focused slices instead.`,
                    ko: `각 슬라이스는 명확하고 단일한 목적을 가져야 합니다. inWaiting은 대기 중인 주문을, inPickup은 준비된 주문을 보여줍니다. 모든 것을 하는 슬라이스를 만들려고 하지 말고, 여러 개의 집중된 슬라이스를 만드세요.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg" })}>
                <div className="mb-2">
                  <strong className="text-primary">
                    {l.trans({ en: "Zone Matches Slice", ko: "존은 슬라이스와 매칭" })}
                  </strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Always pass the correct slice to Zone components. The slice connects the Zone to its data source and ensures refresh actions target the right slice.`,
                    ko: `항상 Zone 컴포넌트에 올바른 slice를 전달하세요. slice는 Zone을 데이터 소스에 연결하고 새로고침 액션이 올바른 슬라이스를 대상으로 하도록 보장합니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg" })}>
                <div className="mb-2">
                  <strong className="text-primary">
                    {l.trans({ en: "Props Control Behavior", ko: "Props로 동작 제어" })}
                  </strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Use props like showControls to adapt component behavior for different contexts. This allows reusing the same component across staff views and customer displays.`,
                    ko: `showControls 같은 props를 사용하여 다양한 컨텍스트에 맞게 컴포넌트 동작을 조정하세요. 이렇게 하면 직원 뷰와 고객 디스플레이에서 동일한 컴포넌트를 재사용할 수 있습니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg" })}>
                <div className="mb-2">
                  <strong className="text-primary">
                    {l.trans({ en: "Dictionary for All Labels", ko: "모든 레이블에 Dictionary 사용" })}
                  </strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Always define slice names and related translations in the dictionary. This ensures consistent labeling across the application and enables proper internationalization.`,
                    ko: `항상 슬라이스 이름과 관련 번역을 dictionary에 정의하세요. 이렇게 하면 애플리케이션 전체에서 일관된 레이블링이 보장되고 적절한 국제화가 가능해집니다.`,
                  })}
                </div>
              </div>
            </div>
            <div>
              {l.trans({
                en: `In the next tutorial, we'll explore how to create dynamic page navigation and user experiences using Pages in Akan.js. This will allow customers to navigate through multi-step ordering flows and interactive interfaces.`,
                ko: `다음 튜토리얼에서는 Akan.js의 Pages를 사용하여 동적 페이지 네비게이션과 사용자 경험을 만드는 방법을 살펴볼 것입니다. 이를 통해 고객들이 다단계 주문 흐름과 인터랙티브한 인터페이스를 탐색할 수 있게 됩니다.`,
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
