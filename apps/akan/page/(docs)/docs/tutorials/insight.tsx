import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="stats-of-query" title={l.trans({ en: "Stats of Query", ko: "쿼리 통계" })}>
        <Docs.Title>{l.trans({ en: "Stats of Query", ko: "쿼리 통계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `When multiple orders come in at once, you can make ice cream at once. You need to extract the insight of the current orders' ice cream amount, topping information, etc.`,
              ko: `여러 주문이 동시에 들어오면, 한꺼번에 아이스크림을 만들면 손님들이 기다리는 시간을 줄일 수 있습니다. 이를 위해서는 현재 주문들의 아이스크림 양, 토핑정보 등에 대한 인사이트를 추출해야 합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-query-maker" title={l.trans({ en: "Create Query Maker", ko: "쿼리 메이커 생성하기" })}>
        <Docs.Title>{l.trans({ en: "Create Query Maker", ko: "쿼리 메이커 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Before extracting insights, we need to define what data we want to query. A Query Maker allows users to filter data dynamically - like a barista checking orders by status to see which drinks to make next. Let's enhance our Slice to support flexible queries with search parameters.`,
              ko: `인사이트를 추출하기 전에, 어떤 데이터를 쿼리할지 정의해야 합니다. 쿼리 메이커를 사용하면 사용자가 동적으로 데이터를 필터링할 수 있습니다 - 마치 바리스타가 다음에 어떤 음료를 만들지 확인하기 위해 주문을 상태별로 확인하는 것처럼요. 검색 파라미터를 지원하도록 Slice를 개선해봅시다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `First, let's update the Slice to accept status filters. The .search() method defines query parameters that users can set from the frontend:`,
              ko: `먼저, 상태 필터를 받을 수 있도록 Slice를 업데이트합니다. .search() 메서드는 사용자가 프론트엔드에서 설정할 수 있는 쿼리 파라미터를 정의합니다:`,
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
    inPublic: init().exec(function () { // [!code --:3]
      return this.icecreamOrderService.queryAny();
    }),
    inPublic: init() // [!code ++:5]
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses);
      }),
    inWaiting: init().exec(function () {
      return this.icecreamOrderService.queryByStatuses(["active", "processing"]);
    }),
    inPickup: init().exec(function () {
      return this.icecreamOrderService.queryByStatuses(["served"]);
    }),
  })
) {}
// [!code collapse:30]
export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder)
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
              en: `Let's understand the key components of this Slice definition:`,
              ko: `이 Slice 정의의 핵심 구성 요소를 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🔍</span>
                <strong className="text-primary">{".search()"}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Defines a searchable parameter that can be set from the frontend. Here, "statuses" accepts an array of IcecreamOrderStatus values to filter orders.`,
                  ko: `프론트엔드에서 설정할 수 있는 검색 가능한 파라미터를 정의합니다. 여기서 "statuses"는 주문을 필터링하기 위한 IcecreamOrderStatus 값 배열을 받습니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">⚡</span>
                <strong className="text-primary">inWaiting / inPickup</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Pre-defined slices with fixed status filters. inWaiting shows active and processing orders, while inPickup shows orders ready for customer pickup.`,
                  ko: `고정된 상태 필터가 있는 미리 정의된 슬라이스입니다. inWaiting은 활성화 및 처리 중인 주문을, inPickup은 고객 픽업 준비가 된 주문을 보여줍니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add dictionary entries for the slice and its search parameter to enable localization:`,
              ko: `로컬라이제이션을 위해 슬라이스와 검색 파라미터에 대한 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:11]

import type {
  IcecreamOrder,
  IcecreamOrderInsight,
  IcecreamOrderStatus,
  ServeType,
  Topping,
} from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:40]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ])
  )
  .model<IcecreamOrder>((t) => ({
    serveType: t(["Serve Type", "서빙 타입"]).desc(["Serve type of the icecream order", "아이스크림 주문의 서빙 타입"]),
    phone: t(["Phone", "전화번호"]).desc(["Phone number of the icecream order", "아이스크림 주문의 전화번호"]),
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<ServeType>("serveType", (t) => ({
    forHere: t(["For Here", "매장 식사"]).desc(["For Here serve type", "매장 식사 서빙 타입"]),
    takeOut: t(["Take Out", "포장 주문"]).desc(["Take Out serve type", "포장 주문 서빙 타입"]),
    delivery: t(["Delivery", "배달"]).desc(["Delivery serve type", "배달 서빙 타입"]),
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
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})), // [!code --]
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({ // [!code ++:3]
      statuses: t(["Statuses", "상태"]).desc(["Statuses of the icecream orders", "아이스크림 주문의 상태"]),
    })),
    inWaiting: fn(["IcecreamOrder In Waiting", "IcecreamOrder 대기"]).arg((t) => ({})),
    inPickup: fn(["IcecreamOrder In Pickup", "IcecreamOrder 픽업"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({ // [!code collapse:40]
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
    pickup: ["Pickup", "픽업"],
    waiting: ["Waiting", "대기"],
  });
`}
          />
          <div>
            {l.trans({
              en: `Now let's create a UI component that allows users to select which statuses to filter by. This Query Maker component uses the auto-generated store hooks:`,
              ko: `이제 사용자가 필터링할 상태를 선택할 수 있는 UI 컴포넌트를 만들어봅시다. 이 쿼리 메이커 컴포넌트는 자동 생성된 스토어 훅을 사용합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx"
            code={`
"use client"; // [!code collapse:3]
import { clsx } from "akanjs/client";
import { st, usePage } from "@apps/koyo/client";
import { cnst } from "@apps/koyo/client"; // [!code ++:2]
import { Select } from "akanjs/ui";
// [!code collapse:81]
interface ProcessProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Process = ({ className, icecreamOrderId, disabled }: ProcessProps) => {
  const { l } = usePage();
  return (
    <button
      className={clsx("btn btn-secondary", className)}
      disabled={disabled}
      onClick={() => {
        void st.do.processIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.processIcecreamOrder")}
    </button>
  );
};

interface ServeProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Serve = ({ className, icecreamOrderId, disabled }: ServeProps) => {
  const { l } = usePage();
  return (
    <button
      className={clsx("btn btn-accent", className)}
      disabled={disabled}
      onClick={() => {
        void st.do.serveIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.serveIcecreamOrder")}
    </button>
  );
};

interface FinishProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Finish = ({ className, icecreamOrderId, disabled }: FinishProps) => {
  const { l } = usePage();
  return (
    <button
      className={clsx("btn btn-success", className)}
      disabled={disabled}
      onClick={() => {
        void st.do.finishIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.finishIcecreamOrder")}
    </button>
  );
};

interface CancelProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Cancel = ({ className, icecreamOrderId, disabled }: CancelProps) => {
  const { l } = usePage();
  return (
    <button
      className={clsx("btn btn-warning", className)}
      disabled={disabled}
      onClick={() => {
        void st.do.cancelIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.cancelIcecreamOrder")}
    </button>
  );
};

interface PublicQueryMakerProps { // [!code ++:17]
  className?: string;
}
export const PublicQueryMaker = ({ className }: PublicQueryMakerProps) => {
  const [statuses] = st.use.queryArgsOfIcecreamOrderInPublic();
  return (
    <Select
      multiple
      value={statuses ?? []}
      className={className}
      options={cnst.IcecreamOrderStatus}
      onChange={(statuses) => {
        void st.do.setQueryArgsOfIcecreamOrderInPublic(statuses);
      }}
    />
  );
};`}
          />
          <div>
            {l.trans({
              en: `Key features of the Query Maker component:`,
              ko: `쿼리 메이커 컴포넌트의 주요 기능:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-primary">🎣</span>
              <div>
                <strong>st.use.queryArgsOfIcecreamOrderInPublic()</strong>:{" "}
                {l.trans({
                  en: "Auto-generated hook that reads the current query arguments from the store. Returns the statuses array.",
                  ko: "스토어에서 현재 쿼리 인자를 읽는 자동 생성된 훅입니다. statuses 배열을 반환합니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">📝</span>
              <div>
                <strong>st.do.setQueryArgsOfIcecreamOrderInPublic()</strong>:{" "}
                {l.trans({
                  en: "Updates the query arguments in the store, which automatically triggers a re-fetch of the filtered data.",
                  ko: "스토어의 쿼리 인자를 업데이트하며, 이는 자동으로 필터링된 데이터의 재조회를 트리거합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Finally, add the Query Maker to your page so users can filter orders dynamically:`,
              ko: `마지막으로, 사용자가 동적으로 주문을 필터링할 수 있도록 페이지에 쿼리 메이커를 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/page/_index.tsx"
            code={`
import { Load, Model } from "akanjs/ui"; // [!code collapse:3]
import { cnst, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client";

export default async function Page() {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-5xl font-black"> // [!code collapse:5]
        <div className="text-5xl font-black">{l("inventory.modelName")}</div>
        <Inventory.Util.Refill className="absolute top-2 right-2" />
      </div>
      <Inventory.Zone.Today />
      <div className="flex items-center gap-4 text-5xl font-black">
        <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div>
        <IcecreamOrder.Util.PublicQueryMaker /> // [!code ++]
        <Model.New
          className="btn btn-primary"
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="name"
          partial={icecreamOrderForm}
        >
          <IcecreamOrder.Template.General />
        </Model.New>
      </div>
      <IcecreamOrder.Zone.Card // [!code collapse:5]
        className="space-y-2"
        init={icecreamOrderInitInPublic}
        slice={fetch.slice.icecreamOrderInPublic}
      />
    </div>
  );
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="accelerate-with-insight"
        title={l.trans({ en: "Accelerate with Insight", ko: "인사이트로 가속하기" })}
      >
        <Docs.Title>{l.trans({ en: "Accelerate with Insight", ko: "인사이트로 가속하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now that we can filter our queries, let's extract meaningful insights from the data. Insight counts documents across the current query and optional per-field query filters. Think of it like a kitchen display system that shows the chef exactly how many active orders or topping requests are waiting.`,
              ko: `이제 쿼리를 필터링할 수 있으니, 데이터에서 의미 있는 인사이트를 추출해봅시다. Insight는 현재 쿼리와 필드별 추가 쿼리 필터를 기준으로 문서 수를 계산합니다. 주방 디스플레이 시스템이 셰프에게 대기 중인 주문 수나 토핑 요청 수를 보여주는 것처럼 생각해보세요.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `First, define the Insight class in your constant file. Each field uses the accumulate option as an Akan document query filter for counting:`,
              ko: `먼저, constant 파일에 Insight 클래스를 정의합니다. 각 필드는 카운트에 사용할 Akan 문서 쿼리 필터를 accumulate 옵션에 지정합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts"
            code={`
import { enumOf, Int } from "akanjs/base"; // [!code collapse:45]
import { isPhoneNumber } from "akanjs/common";
import { via } from "akanjs/constant";

export class IcecreamOrderStatus extends enumOf("icecreamOrderStatus", [
  "active",
  "processing",
  "served",
  "finished",
  "canceled",
] as const) {}

export class Topping extends enumOf("topping", [
  "fruitRings",
  "oreo",
  "strawberry",
  "mango",
  "cheeseCube",
  "corn",
  "granola",
  "banana",
  "fig",
] as const) {}

export class ServeType extends enumOf("serveType", ["forHere", "takeOut", "delivery"] as const) {}

export class IcecreamOrderInput extends via((field) => ({
  serveType: field(ServeType, { default: "forHere" }),
  phone: field(String, { validate: isPhoneNumber }).optional(),
  size: field(Int, { min: 50, max: 200 }),
  toppings: field([Topping]),
})) {}

export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(IcecreamOrderStatus, { default: "active" }),
})) {}

export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["serveType", "size", "toppings", "status"] as const,
  (resolve) => ({})
) {}

export class IcecreamOrder extends via(IcecreamOrderObject, LightIcecreamOrder, (resolve) => ({})) {}

export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({
  yogurtIcecreamQty: field(Int, { // [!code ++:22]
    default: 0,
    accumulate: {},
  }),
  fruitRingQty: field(Int, {
    default: 0,
    accumulate: { toppings: "fruitRings" },
  }),
  oreoQty: field(Int, { default: 0, accumulate: { toppings: "oreo" } }),
  strawberryQty: field(Int, {
    default: 0,
    accumulate: { toppings: "strawberry" },
  }),
  mangoQty: field(Int, { default: 0, accumulate: { toppings: "mango" } }),
  cheeseCubeQty: field(Int, {
    default: 0,
    accumulate: { toppings: "cheeseCube" },
  }),
  cornQty: field(Int, { default: 0, accumulate: { toppings: "corn" } }),
  granolaQty: field(Int, { default: 0, accumulate: { toppings: "granola" } }),
  bananaQty: field(Int, { default: 0, accumulate: { toppings: "banana" } }),
  figQty: field(Int, { default: 0, accumulate: { toppings: "fig" } }),
})) {}`}
          />
          <div>
            {l.trans({
              en: `Let's break down the count filter patterns used:`,
              ko: `사용된 카운트 필터 패턴을 살펴봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🍦</span>
                <strong className="text-primary">{"{}"}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Counts all orders that match the current query. Leave accumulate as an empty object for the base count.`,
                  ko: `현재 쿼리에 일치하는 모든 주문을 카운트합니다. 기본 카운트는 accumulate를 빈 객체로 둡니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🍓</span>
                <strong className="text-primary">{'{ toppings: "strawberry" }'}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Adds a field filter before counting. Because toppings is an array field, this counts orders whose toppings include "strawberry".`,
                  ko: `카운트 전에 필드 필터를 추가합니다. toppings가 배열 필드이므로 "strawberry" 토핑을 포함한 주문 수를 계산합니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add dictionary entries for the insight fields to enable proper labeling in the UI:`,
              ko: `UI에서 적절한 레이블링을 위해 insight 필드에 대한 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:11]

import type {
  IcecreamOrder,
  IcecreamOrderInsight,
  IcecreamOrderStatus,
  ServeType,
  Topping,
} from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:39]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ])
  )
  .model<IcecreamOrder>((t) => ({
    serveType: t(["Serve Type", "서빙 타입"]).desc(["Serve type of the icecream order", "아이스크림 주문의 서빙 타입"]),
    phone: t(["Phone", "전화번호"]).desc(["Phone number of the icecream order", "아이스크림 주문의 전화번호"]),
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<ServeType>("serveType", (t) => ({
    forHere: t(["For Here", "매장 식사"]).desc(["For Here serve type", "매장 식사 서빙 타입"]),
    takeOut: t(["Take Out", "포장 주문"]).desc(["Take Out serve type", "포장 주문 서빙 타입"]),
    delivery: t(["Delivery", "배달"]).desc(["Delivery serve type", "배달 서빙 타입"]),
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
  .insight<IcecreamOrderInsight>((t) => ({
    yogurtIcecreamQty: t(["Yogurt Icecream Qty", "요거트 아이스크림 수량"]).desc([ // [!code ++:13]
      "Yogurt Icecream quantity",
      "요거트 아이스크림 수량",
    ]),
    fruitRingQty: t(["Fruit Ring Qty", "과일 링 수량"]).desc(["Fruit Ring quantity", "과일 링 수량"]),
    oreoQty: t(["Oreo Qty", "오레오 수량"]).desc(["Oreo quantity", "오레오 수량"]),
    strawberryQty: t(["Strawberry Qty", "딸기 수량"]).desc(["Strawberry quantity", "딸기 수량"]),
    mangoQty: t(["Mango Qty", "망고 수량"]).desc(["Mango quantity", "망고 수량"]),
    cheeseCubeQty: t(["Cheese Cube Qty", "치즈 큐브 수량"]).desc(["Cheese Cube quantity", "치즈 큐브 수량"]),
    cornQty: t(["Corn Qty", "옥수수 수량"]).desc(["Corn quantity", "옥수수 수량"]),
    granolaQty: t(["Granola Qty", "그래놀라 수량"]).desc(["Granola quantity", "그래놀라 수량"]),
    bananaQty: t(["Banana Qty", "바나나 수량"]).desc(["Banana quantity", "바나나 수량"]),
    figQty: t(["Fig Qty", "피그 수량"]).desc(["Fig quantity", "피그 수량"]),
  }))
  .slice<IcecreamOrderSlice>((fn) => ({ // [!code collapse:60]
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({
      statuses: t(["Statuses", "상태"]).desc(["Statuses of the icecream orders", "아이스크림 주문의 상태"]),
    })),
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
    pickup: ["Pickup", "픽업"],
    waiting: ["Waiting", "대기"],
  });
`}
          />
          <div>
            {l.trans({
              en: `Now let's create a View component to display the aggregated insights in a beautiful dashboard layout:`,
              ko: `이제 집계된 인사이트를 아름다운 대시보드 레이아웃으로 표시하는 View 컴포넌트를 만들어봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx"
            code={`
import { clsx } from "akanjs/client"; // [!code collapse:65]
import { cnst, usePage } from "@apps/koyo/client";
import { IcecreamOrder } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4">
        <span className="text-3xl font-extrabold text-primary">🍦</span>
        <span className="text-2xl font-bold">{l("icecreamOrder.modelName")}</span>
        <span className="text-base-content/50 ml-auto text-xs">#{icecreamOrder.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="text-base-content/50 font-semibold">{l("icecreamOrder.size")}</div>
        <div>{icecreamOrder.size} cc</div>
        <div className="text-base-content/50 font-semibold">{l("icecreamOrder.toppings")}</div>
        <div className="flex flex-wrap gap-2">
          {icecreamOrder.toppings.length === 0 ? (
            <span className="text-base-content/70 italic">{l.trans({ en: "No toppings", ko: "토핑 없음" })}</span>
          ) : (
            icecreamOrder.toppings.map((topping) => (
              <span
                key={topping}
                className="inline-block rounded-full bg-base-100 px-2 py-1 text-xs font-medium text-primary"
              >
                {l(\`topping.\${topping}\`)}
              </span>
            ))
          )}
        </div>
        <div className="text-base-content/50 font-semibold">{l("icecreamOrder.status")}</div>
        <div>
          <span
            className={clsx("inline-block rounded-full px-2 py-1 text-xs font-semibold", {
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
        <div className="text-base-content/50 font-semibold">{l("icecreamOrder.createdAt")}</div>
        <div className="text-base-content/70">{icecreamOrder.createdAt.format("YYYY-MM-DD HH:mm:ss")}</div>
        <div className="text-base-content/50 font-semibold">{l("icecreamOrder.updatedAt")}</div>
        <div className="text-base-content/70">{icecreamOrder.updatedAt.format("YYYY-MM-DD HH:mm:ss")}</div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
        <IcecreamOrder.Util.Serve icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "processing"} />
        <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
        <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
      </div>
    </div>
  );
};

interface InsightProps {
  className?: string;
  icecreamOrderInsight: cnst.IcecreamOrderInsight;
}
export const Insight = ({ className, icecreamOrderInsight }: InsightProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("w-full space-y-2 rounded p-4", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.yogurtIcecreamQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.yogurtIcecreamQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.fruitRingQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.fruitRingQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.oreoQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.oreoQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.strawberryQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.strawberryQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.mangoQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.mangoQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.cheeseCubeQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.cheeseCubeQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.cornQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.cornQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.granolaQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.granolaQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.bananaQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.bananaQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.figQty")}</div>
          <div className="text-2xl font-bold">{icecreamOrderInsight.figQty}</div>
        </div>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `The View component displays each insight metric in a responsive grid. The chef can quickly see how much yogurt to prepare and which toppings are most popular.`,
              ko: `View 컴포넌트는 각 인사이트 메트릭을 반응형 그리드에 표시합니다. 셰프는 얼마나 많은 요거트를 준비해야 하는지, 어떤 토핑이 가장 인기 있는지 빠르게 확인할 수 있습니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Now create a Zone component that connects the View to the store. Zone components handle data fetching and state management:`,
              ko: `이제 View를 스토어에 연결하는 Zone 컴포넌트를 만듭니다. Zone 컴포넌트는 데이터 페칭과 상태 관리를 처리합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`
"use client"; // [!code collapse:54]
import { DefaultOf } from "akanjs/constant";
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { useInterval } from "akanjs/webkit";
import { Load, Model } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, st } from "@apps/koyo/client";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
  slice?: SliceMeta;
  showControls?: boolean;
}
export const Card = ({ className, init, slice = fetch.slice.icecreamOrder, showControls = true }: CardProps) => {
  useInterval(() => {
    void st.slice[slice.sliceName as "icecreamOrder"].do.refreshIcecreamOrder();
  }, 3000);
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
          <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} showControls={showControls} />
        )}
      />
      {showControls ? (
        <Model.ViewEditModal
          slice={slice}
          renderTitle={(icecreamOrder: DefaultOf<cnst.IcecreamOrder>) =>
            \`IcecreamOrder - \${icecreamOrder.id ? icecreamOrder.id : "New"}\`
          }
          renderView={(icecreamOrder: cnst.IcecreamOrder) => (
            <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
          )}
          renderTemplate={() => <IcecreamOrder.Template.General />}
        />
      ) : null}
    </>
  );
};
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
};

interface InsightProps {
  className?: string;
  slice?: SliceMeta;
}
export const Insight = ({ className, slice = fetch.slice.icecreamOrder }: InsightProps) => {
  const icecreamOrderInsight = st.slice[slice.sliceName as "icecreamOrder"].use.icecreamOrderInsight();
  return <IcecreamOrder.View.Insight className={className} icecreamOrderInsight={icecreamOrderInsight} />;
};`}
          />
          <div>
            {l.trans({
              en: `Key feature of the Zone component:`,
              ko: `Zone 컴포넌트의 주요 기능:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-primary">🔗</span>
              <div>
                <strong>st.slice[slice.sliceName].use.icecreamOrderInsight()</strong>:{" "}
                {l.trans({
                  en: "Auto-generated hook that retrieves the aggregated insight data for the specified slice. The framework handles all the aggregation pipeline execution.",
                  ko: "지정된 슬라이스에 대한 집계된 인사이트 데이터를 가져오는 자동 생성된 훅입니다. 프레임워크가 모든 집계 파이프라인 실행을 처리합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Finally, add the Insight Zone to your page to display real-time aggregated statistics:`,
              ko: `마지막으로, 실시간 집계 통계를 표시하기 위해 페이지에 Insight Zone을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/page/_index.tsx"
            code={`
import { Load, Model } from "akanjs/ui"; // [!code collapse:21]
import { cnst, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client";

export default async function Page() {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-5xl font-black">
          <div className="text-5xl font-black">{l("inventory.modelName")}</div>
          <Inventory.Util.Refill className="absolute top-2 right-2" />
        </div>
        <Inventory.Zone.Today />
        <div className="flex items-center gap-4 text-5xl font-black">
          <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div> // [!code collapse:10]
          <IcecreamOrder.Util.PublicQueryMaker />
          <Model.New
            className="btn btn-primary"
            slice={fetch.slice.icecreamOrderInPublic}
            renderTitle="name"
            partial={icecreamOrderForm}
          >
            <IcecreamOrder.Template.General />
          </Model.New>
        </div>
        <IcecreamOrder.Zone.Insight slice={fetch.slice.icecreamOrderInPublic} /> // [!code ++]
        <IcecreamOrder.Zone.Card
          className="space-y-2"
          init={icecreamOrderInitInPublic}
          slice={fetch.slice.icecreamOrderInPublic}
        />
      </div> // [!code collapse:10]
    </div>
  );
}`}
          />
          <div>
            {l.trans({
              en: `Now when users filter orders by status, the insight dashboard automatically updates to show aggregated statistics for only those filtered orders. This is incredibly powerful for real-time operational decisions!`,
              ko: `이제 사용자가 상태별로 주문을 필터링하면, 인사이트 대시보드가 자동으로 업데이트되어 필터링된 주문에 대한 집계 통계만 보여줍니다. 이는 실시간 운영 결정에 매우 강력합니다!`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-linear-to-r from-base-100 to-base-300 p-6">
            <div className="mb-3 font-bold text-lg text-primary">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-base-content/70 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created dynamic Query Makers with searchable parameters",
                  ko: "검색 가능한 파라미터가 있는 동적 쿼리 메이커 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Learned how to define Insight classes with Akan document query filters",
                  ko: "Akan 문서 쿼리 필터를 사용한 Insight 클래스 정의 방법 학습",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Built View components to display aggregated statistics",
                  ko: "집계 통계를 표시하는 View 컴포넌트 구축",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Connected Zone components to auto-generated store hooks",
                  ko: "자동 생성된 스토어 훅에 Zone 컴포넌트 연결",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Integrated insights with filtered queries for real-time analytics",
                  ko: "실시간 분석을 위해 필터링된 쿼리와 인사이트 통합",
                })}
              </li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll explore how to relate data between different models. This will allow you to create rich relationships like associating orders with customers, linking products to categories, and building complex data graphs.`,
              ko: `다음 튜토리얼에서는 서로 다른 모델 간의 데이터 연결 방법을 살펴볼 것입니다. 이를 통해 주문과 고객 연결, 제품과 카테고리 연결, 복잡한 데이터 그래프 구축 같은 풍부한 관계를 만들 수 있게 됩니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
