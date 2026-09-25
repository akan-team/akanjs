import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
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
      <div className="divider" />

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
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
            code={`
import { ID } from "akanjs/base"; // [!code collapse:13]
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ interval }) => ({
  warnIcecreamMeltingAll: interval(10000).exec(async function () {
    await this.icecreamOrderService.warnIcecreamMeltingAll();
  }),
})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder, // [!code collapse:2]
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.icecreamOrderService.queryAny();
    }),
    inWaiting: init().exec(function () { // [!code ++:6]
      return this.icecreamOrderService.queryByStatuses(["active", "processing"]);
    }),
    inPickup: init().exec(function () {
      return this.icecreamOrderService.queryByStatuses(["served"]);
    }),
  })
) {}
// [!code collapse:23]
export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder) // [!code ++:20]
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
  serveIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.serveIcecreamOrder(icecreamOrderId);
    }),
  finishIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    }),
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.cancelIcecreamOrder(icecreamOrderId);
    }),
})) {}`}
          />
          <div>
            {l.trans({
              en: `inWaiting slice is a slice that queries the waiting orders and inPickup slice is a slice that queries the orders being picked up. When the slice is declared, the state and actions of the store are automatically created.`,
              ko: `inWaiting 슬라이스는 대기중인 주문을 조회하는 슬라이스이고, inPickup 슬라이스는 픽업 중인 주문을 조회하는 슬라이스입니다. 슬라이스가 선언되면 store의 상태와 액션이 자동으로 생성됩니다.`,
            })}
          </div>
          <Code.Snippet
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
    ])
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
    fig: t(["Fig", "피그"]).desc(["Fig topping", "피그 토핑"]),
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
      <div className="divider" />

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
            title="apps/koyo/page/dashboard.tsx"
            code={`
import { Load } from "akanjs/ui";
import { fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

export default async function Page() {
  const { l } = usePage();
  const [{ icecreamOrderInitInWaiting }, { icecreamOrderInitInPickup }] = await Promise.all([
    fetch.initIcecreamOrderInWaiting(),
    fetch.initIcecreamOrderInPickup(),
  ]);
  return (
    <div className="flex size-full gap-2 p-4">
      <div className="w-2/3">
        <h2 className="my-2 text-3xl font-bold">{l("icecreamOrder.pickup")}</h2>
        <IcecreamOrder.Zone.Card
          className="space-y-2"
          init={icecreamOrderInitInPickup}
          slice={fetch.slice.icecreamOrderInPickup}
          showControls={false}
        />
      </div>
      <div className="w-1/3">
        <h2 className="my-2 text-3xl font-bold">{l("icecreamOrder.waiting")}</h2>
        <IcecreamOrder.Zone.Card
          className="space-y-2"
          init={icecreamOrderInitInWaiting}
          slice={fetch.slice.icecreamOrderInWaiting}
          showControls={false}
        />
      </div>
    </div>
  );
}
`}
          />
          <div>
            {l.trans({
              en: `Don't forget to add the translation labels for the dashboard sections:`,
              ko: `다국어를 위한 번역 레이블 추가를 잊지 마세요:`,
            })}
          </div>
          <Code.Snippet
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
    ])
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
    fig: t(["Fig", "피그"]).desc(["Fig topping", "피그 토핑"]),
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
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">📦</span>
                <strong className="text-primary">Load.Page</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `The Load.Page component handles data loading before rendering. It fetches both waiting and pickup orders simultaneously using Promise.all for optimal performance.`,
                  ko: `Load.Page 컴포넌트는 렌더링 전에 데이터 로딩을 처리합니다. Promise.all을 사용하여 대기 중인 주문과 픽업 주문을 동시에 가져와 최적의 성능을 제공합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🎯</span>
                <strong className="text-primary">IcecreamOrder.Zone.Card</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Zone components connect slice data to UI rendering. By passing the init data and slice, the Zone automatically subscribes to real-time updates for that specific slice.`,
                  ko: `Zone 컴포넌트는 슬라이스 데이터를 UI 렌더링에 연결합니다. init 데이터와 slice를 전달하면 Zone이 자동으로 해당 슬라이스의 실시간 업데이트를 구독합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🚫</span>
                <strong className="text-primary">{"showControls={false}"}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `For the customer-facing dashboard, we hide the action controls. Customers should only see the status, not modify orders. This is a common pattern for read-only displays.`,
                  ko: `고객용 대시보드에서는 액션 컨트롤을 숨깁니다. 고객은 상태만 볼 수 있고 주문을 수정할 수 없어야 합니다. 이것은 읽기 전용 디스플레이의 일반적인 패턴입니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="zone-with-slice" title={l.trans({ en: "Zone with Slice", ko: "슬라이스를 사용한 Zone" })}>
        <Docs.Title>{l.trans({ en: "Zone with Slice", ko: "슬라이스를 사용한 Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `For a real-time dashboard, the data needs to stay fresh. When a staff member changes an order status, customers watching the display should see it update automatically. The Zone component combined with useInterval creates this "live" experience - just like how airport departure boards constantly refresh to show the latest flight information.`,
              ko: `실시간 대시보드에서는 데이터가 항상 최신 상태여야 합니다. 직원이 주문 상태를 변경하면 디스플레이를 보고 있는 고객들이 자동으로 업데이트되는 것을 봐야 합니다. Zone 컴포넌트와 useInterval을 결합하면 이러한 "라이브" 경험을 만들 수 있습니다 - 공항 출발 게시판이 최신 비행 정보를 보여주기 위해 지속적으로 새로고침되는 것처럼요.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Let's look at how to control the display with props and automatic refresh:`,
              ko: `props와 자동 새로고침으로 디스플레이를 제어하는 방법을 살펴봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { clsx, type ModelProps } from "akanjs/client"; // [!code collapse:4]
import { Model } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

interface CardProps extends ModelProps<"icecreamOrder", cnst.LightIcecreamOrder> { // [!code ++:4]
  showControls?: boolean;
}
export const Card = ({ icecreamOrder, showControls = true }: CardProps) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-base-100 via-base-200 to-base-300 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center"> // [!code collapse:24]
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <span className="inline-block rounded bg-base-200 px-2 py-1 text-xs font-bold tracking-wider uppercase">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-primary">#{icecreamOrder.id.slice(-4)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-block rounded border border-base-300 bg-base-100 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full px-3 py-1 text-sm font-semibold", {
              "border border-primary/40 bg-base-100 text-primary": icecreamOrder.status === "active",
              "border border-warning/40 bg-base-100 text-warning": icecreamOrder.status === "processing",
              "border border-info/40 bg-info text-info-content": icecreamOrder.status === "served",
              "border border-accent/40 bg-base-100 text-accent": icecreamOrder.status === "finished",
              "border border-base-300 bg-base-100 text-base-content/70": icecreamOrder.status === "canceled",
            })}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      {showControls ? ( // [!code ++]
        <div className="bg-base-100 flex items-center justify-center gap-2 rounded-xl p-4">
          <Model.ViewWrapper slice={fetch.slice.icecreamOrder} modelId={icecreamOrder.id}>
            <button className="btn btn-primary">
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
              en: `The Unit component now accepts a showControls prop that determines whether to display action buttons. This simple flag allows the same card component to be used in both staff management views (with controls) and customer dashboard views (without controls).`,
              ko: `Unit 컴포넌트는 이제 액션 버튼 표시 여부를 결정하는 showControls prop을 받습니다. 이 간단한 플래그를 통해 같은 카드 컴포넌트를 직원 관리 뷰(컨트롤 포함)와 고객 대시보드 뷰(컨트롤 없음) 모두에서 사용할 수 있습니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Now let's see how the Zone component manages automatic data refresh:`,
              ko: `이제 Zone 컴포넌트가 어떻게 자동 데이터 새로고침을 관리하는지 살펴봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`
"use client"; // [!code collapse:5]
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { cnst, fetch, IcecreamOrder } from "@apps/koyo/client";
import { DefaultOf } from "akanjs/constant";
import { Load, Model } from "akanjs/ui";
import { st } from "@apps/koyo/client"; // [!code ++:2]
import { useInterval } from "akanjs/webkit";

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
    <>
      <Load.Units // [!code collapse:11]
        className={className}
        init={init}
        renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
          <IcecreamOrder.Unit.Card
            key={icecreamOrder.id}
            icecreamOrder={icecreamOrder}
            showControls={showControls}
          />
        )}
      />
      {showControls ? ( // [!code ++]
        <Model.ViewEditModal
          slice={slice} // [!code collapse:8]
          renderTitle={(icecreamOrder: DefaultOf<cnst.IcecreamOrder>) =>
            \`IcecreamOrder - \${icecreamOrder.id ? icecreamOrder.id : "New"}\`
          }
          renderView={(icecreamOrder: cnst.IcecreamOrder) => (
            <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
          )}
          renderTemplate={() => <IcecreamOrder.Template.General />}
        />
      ) : null} // [!code ++]
    </>
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
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">⏱️</span>
                <strong className="text-primary">useInterval</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `The useInterval hook refreshes the slice data every 3 seconds. This ensures the dashboard stays current without manual user interaction - perfect for displays that need to show live order status.`,
                  ko: `useInterval 훅은 3초마다 슬라이스 데이터를 새로고침합니다. 이렇게 하면 사용자의 수동 상호작용 없이도 대시보드가 최신 상태를 유지합니다 - 실시간 주문 상태를 보여줘야 하는 디스플레이에 완벽합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🔄</span>
                <strong className="text-primary">refreshIcecreamOrder</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `The refresh function is automatically generated for each slice. It re-queries the data using the same conditions defined in the slice, ensuring consistent data fetching.`,
                  ko: `새로고침 함수는 각 슬라이스에 대해 자동으로 생성됩니다. 슬라이스에 정의된 동일한 조건을 사용하여 데이터를 다시 쿼리하므로 일관된 데이터 가져오기가 보장됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">📋</span>
                <strong className="text-primary">Load.Units</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Load.Units handles rendering a list of items with proper loading states. It automatically manages the mapping from slice data to individual Unit cards.`,
                  ko: `Load.Units는 적절한 로딩 상태와 함께 아이템 목록의 렌더링을 처리합니다. 슬라이스 데이터에서 개별 Unit 카드로의 매핑을 자동으로 관리합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

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
            <div className="rounded-lg border border-base-300 bg-base-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">1️⃣</span>
                <strong className="text-primary">
                  {l.trans({ en: "One Slice, One Purpose", ko: "하나의 슬라이스, 하나의 목적" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Each slice should have a clear, single purpose. inWaiting shows waiting orders, inPickup shows ready orders. Don't try to make a slice that does everything - create multiple focused slices instead.`,
                  ko: `각 슬라이스는 명확하고 단일한 목적을 가져야 합니다. inWaiting은 대기 중인 주문을, inPickup은 준비된 주문을 보여줍니다. 모든 것을 하는 슬라이스를 만들려고 하지 말고, 여러 개의 집중된 슬라이스를 만드세요.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">2️⃣</span>
                <strong className="text-primary">
                  {l.trans({ en: "Zone Matches Slice", ko: "존은 슬라이스와 매칭" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Always pass the correct slice to Zone components. The slice connects the Zone to its data source and ensures refresh actions target the right slice.`,
                  ko: `항상 Zone 컴포넌트에 올바른 slice를 전달하세요. slice는 Zone을 데이터 소스에 연결하고 새로고침 액션이 올바른 슬라이스를 대상으로 하도록 보장합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">3️⃣</span>
                <strong className="text-primary">
                  {l.trans({ en: "Props Control Behavior", ko: "Props로 동작 제어" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Use props like showControls to adapt component behavior for different contexts. This allows reusing the same component across staff views and customer displays.`,
                  ko: `showControls 같은 props를 사용하여 다양한 컨텍스트에 맞게 컴포넌트 동작을 조정하세요. 이렇게 하면 직원 뷰와 고객 디스플레이에서 동일한 컴포넌트를 재사용할 수 있습니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">4️⃣</span>
                <strong className="text-primary">
                  {l.trans({ en: "Dictionary for All Labels", ko: "모든 레이블에 Dictionary 사용" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Always define slice names and related translations in the dictionary. This ensures consistent labeling across the application and enables proper internationalization.`,
                  ko: `항상 슬라이스 이름과 관련 번역을 dictionary에 정의하세요. 이렇게 하면 애플리케이션 전체에서 일관된 레이블링이 보장되고 적절한 국제화가 가능해집니다.`,
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-linear-to-r from-base-100 to-base-300 p-6">
            <div className="mb-3 font-bold text-lg text-primary">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-base-content/70 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created multiple slices for different data views",
                  ko: "다양한 데이터 뷰를 위한 여러 슬라이스 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Built a real-time customer dashboard",
                  ko: "실시간 고객 대시보드 구축",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Connected slices to Zone components",
                  ko: "슬라이스를 Zone 컴포넌트에 연결",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Implemented automatic data refresh",
                  ko: "자동 데이터 새로고침 구현",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Learned slice component best practices",
                  ko: "슬라이스 컴포넌트 모범 사례 학습",
                })}
              </li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll explore how to create dynamic page navigation and user experiences using Pages in Akan.js. This will allow customers to navigate through multi-step ordering flows and interactive interfaces.`,
              ko: `다음 튜토리얼에서는 Akan.js의 Pages를 사용하여 동적 페이지 네비게이션과 사용자 경험을 만드는 방법을 살펴볼 것입니다. 이를 통해 고객들이 다단계 주문 흐름과 인터랙티브한 인터페이스를 탐색할 수 있게 됩니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
