import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "튜토리얼: 인사이트 사용하기 | Akan.js" : "Tutorials: Using Insight | Akan.js";
    const description =
      lang === "ko"
        ? "쿼리 메이커와 인사이트 카운터를 더해 주문 현황판의 재계산을 없앱니다."
        : "Add a query maker and insight counters so the order board stops recomputing.";
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
        <Divider />

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
    inPublic: init({ guards: [Public] }).exec(function () { // [!code --:3]
      return this.icecreamOrderService.queryAny();
    }),
    inPublic: init({ guards: [Public] }) // [!code ++:5]
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses);
      }),
    inWaiting: init({ guards: [Public] }).exec(function () {
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
                en: `Let's understand the key components of this Slice definition:`,
                ko: `이 Slice 정의의 핵심 구성 요소를 이해해봅시다:`,
              })}
            </div>
            <div className="my-4 space-y-3">
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{".search()"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Defines a searchable parameter that can be set from the frontend. Here, "statuses" accepts an array of IcecreamOrderStatus values to filter orders.`,
                    ko: `프론트엔드에서 설정할 수 있는 검색 가능한 파라미터를 정의합니다. 여기서 "statuses"는 주문을 필터링하기 위한 IcecreamOrderStatus 값 배열을 받습니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">inWaiting / inPickup</strong>
                </div>
                <div className="text-foreground/70 text-sm">
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
              className="w-full"
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
    ]),
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
    fig: t(["Fig", "무화과"]).desc(["Fig topping", "무화과 토핑"]),
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
    waiting: ["Waiting", "대기중"],
    pickup: ["Pickup", "픽업가능"],
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
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx"
              code={`
"use client";
import { st, usePage } from "@apps/koyo/client"; // [!code --:2]
import { buttonRecipe } from "akanjs/ui";
import { cnst, st, usePage } from "@apps/koyo/client"; // [!code ++:2]
import { buttonRecipe, Select } from "akanjs/ui";
// [!code collapse:80]
interface ProcessProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Process = ({ className, icecreamOrderId, disabled }: ProcessProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "secondary" }, className)}
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
      className={buttonRecipe({ variant: "accent" }, className)}
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
      className={buttonRecipe({ variant: "success" }, className)}
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
      className={buttonRecipe({ variant: "warning" }, className)}
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
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                <strong>st.use.queryArgsOfIcecreamOrderInPublic()</strong>:{" "}
                {l.trans({
                  en: "Auto-generated hook that reads the current query arguments from the store. Returns the statuses array.",
                  ko: "스토어에서 현재 쿼리 인자를 읽는 자동 생성된 훅입니다. statuses 배열을 반환합니다.",
                })}
              </li>
              <li>
                <strong>st.do.setQueryArgsOfIcecreamOrderInPublic()</strong>:{" "}
                {l.trans({
                  en: "Updates the query arguments in the store, which automatically triggers a re-fetch of the filtered data.",
                  ko: "스토어의 쿼리 인자를 업데이트하며, 이는 자동으로 필터링된 데이터의 재조회를 트리거합니다.",
                })}
              </li>
              <li>
                <strong>options</strong>:{" "}
                {l.trans({
                  en: "The enum class itself. Select lists each status under its dictionary name (icecreamOrderStatus.<value>), and shows a value the dictionary does not name as it is.",
                  ko: "enum 클래스를 그대로 넘깁니다. Select가 각 상태를 사전의 이름(icecreamOrderStatus.<value>)으로 보여 주고, 사전에 없는 값은 그대로 보여 줍니다.",
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: `Finally, add the Query Maker to your page so users can filter orders dynamically:`,
                ko: `마지막으로, 사용자가 동적으로 주문을 필터링할 수 있도록 페이지에 쿼리 메이커를 추가합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/_index.tsx"
              code={`
import { type cnst, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client"; // [!code collapse:4]
import { page } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"> // [!code collapse:5]
        <div className="font-black text-5xl">{l("inventory.modelName")}</div>
        <Inventory.Util.Refill />
      </div>
      <Inventory.Zone.Today />
      <div className="flex items-center gap-4">
        <div className="font-black text-5xl">{l("icecreamOrder.modelName")}</div>
        <IcecreamOrder.Util.PublicQueryMaker /> // [!code ++]
        <Model.New
          trigger={<button className={buttonRecipe({ variant: "primary" })}>{l("base.new")}</button>}
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="default"
          partial={icecreamOrderForm}
        >
          <IcecreamOrder.Template.General />
        </Model.New>
      </div>
      <IcecreamOrder.Zone.Card
        className="space-y-2"
        init={icecreamOrderInitInPublic}
        slice={fetch.slice.icecreamOrderInPublic}
      />
    </div>
  );
});`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="accelerate-with-insight"
          title={l.trans({ en: "Accelerate with Insight", ko: "인사이트로 가속하기" })}
        >
          <Docs.Title>{l.trans({ en: "Accelerate with Insight", ko: "인사이트로 가속하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `Now that we can filter our queries, let's aggregate the data. Insight counts documents across the current query and optional per-field query filters. Think of it like a kitchen display system that shows the chef exactly how many active orders or topping requests are waiting.`,
                ko: `이제 쿼리를 필터링할 수 있으니, 데이터를 집계해봅시다. Insight는 현재 쿼리와 필드별 추가 쿼리 필터를 기준으로 문서 수를 계산합니다. 주방 디스플레이 시스템이 셰프에게 대기 중인 주문 수나 토핑 요청 수를 보여주는 것처럼 생각해보세요.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `First, define the Insight class in your constant file. Each field uses the accumulate option as an Akan document query filter for counting:`,
                ko: `먼저, constant 파일에 Insight 클래스를 정의합니다. 각 필드는 카운트에 사용할 Akan 문서 쿼리 필터를 accumulate 옵션에 지정합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
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
  phone: field.hidden(String, { validate: isPhoneNumber }).optional(),
  size: field(Int, { min: 50, max: 200 }),
  toppings: field([Topping]),
})) {}

export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(IcecreamOrderStatus, { default: "active" }),
})) {}

export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["serveType", "size", "toppings", "status"] as const,
  (resolve) => ({}),
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
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{"{}"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Counts all orders that match the current query. Leave accumulate as an empty object for the base count.`,
                    ko: `현재 쿼리에 일치하는 모든 주문을 카운트합니다. 기본 카운트는 accumulate를 빈 객체로 둡니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{'{ toppings: "strawberry" }'}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
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
              className="w-full"
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
    ]),
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
    fig: t(["Fig", "무화과"]).desc(["Fig topping", "무화과 토핑"]),
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
    figQty: t(["Fig Qty", "무화과 수량"]).desc(["Fig quantity", "무화과 수량"]),
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
    waiting: ["Waiting", "대기중"],
    pickup: ["Pickup", "픽업가능"],
  });
`}
            />
            <div>
              {l.trans({
                en: `Now let's create a View component to display the aggregated insights in a dashboard layout:`,
                ko: `이제 집계된 인사이트를 대시보드 레이아웃으로 표시하는 View 컴포넌트를 만들어봅시다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx"
              code={`
import { type cnst, IcecreamOrder, usePage } from "@apps/koyo/client"; // [!code collapse:64]
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4">
        <span className="font-extrabold text-3xl text-primary">🍦</span>
        <span className="font-bold text-2xl">{l("icecreamOrder.modelName")}</span>
        <span className="ml-auto text-foreground/50 text-xs">#{icecreamOrder.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.size")}</div>
        <div>{icecreamOrder.size} cc</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.toppings")}</div>
        <div className="flex flex-wrap gap-2">
          {icecreamOrder.toppings.length === 0 ? (
            <span className="text-foreground/70 italic">{l.trans({ en: "No toppings", ko: "토핑 없음" })}</span>
          ) : (
            icecreamOrder.toppings.map((topping) => (
              <span
                key={topping}
                className="inline-block rounded-full bg-background px-2 py-1 font-medium text-primary text-xs"
              >
                {l(\`topping.\${topping}\`)}
              </span>
            ))
          )}
        </div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.status")}</div>
        <div>
          <span
            className={cn(
              "inline-block rounded-full px-2 py-1 font-semibold text-xs",
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
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.createdAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.createdAt.format("YYYY-MM-DD HH:mm:ss")}</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.updatedAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.updatedAt.format("YYYY-MM-DD HH:mm:ss")}</div>
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

interface InsightProps { // [!code ++:53]
  className?: string;
  icecreamOrderInsight: cnst.IcecreamOrderInsight;
}
export const Insight = ({ className, icecreamOrderInsight }: InsightProps) => {
  const { l } = usePage();
  return (
    <div className={cn("w-full space-y-2 rounded p-4", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.yogurtIcecreamQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.yogurtIcecreamQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.fruitRingQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.fruitRingQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.oreoQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.oreoQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.strawberryQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.strawberryQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.mangoQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.mangoQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.cheeseCubeQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.cheeseCubeQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.cornQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.cornQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.granolaQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.granolaQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.bananaQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.bananaQty}</div>
        </div>
        <div>
          <div className="text-xs">{l("icecreamOrder.insight.figQty")}</div>
          <div className="font-bold text-2xl">{icecreamOrderInsight.figQty}</div>
        </div>
      </div>
    </div>
  );
};`}
            />
            <div>
              {l.trans({
                en: `The View component displays each insight metric in a responsive grid. The chef can see how many orders the current filter holds and how many of them asked for each topping.`,
                ko: `View 컴포넌트는 각 인사이트 메트릭을 반응형 그리드에 표시합니다. 셰프는 현재 필터에 해당하는 주문이 몇 건이고, 그중 각 토핑을 고른 주문이 몇 건인지 확인할 수 있습니다.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `Now create a Zone component that connects the View to the store. Zone components handle data fetching and state management:`,
                ko: `이제 View를 스토어에 연결하는 Zone 컴포넌트를 만듭니다. Zone 컴포넌트는 데이터 페칭과 상태 관리를 처리합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
              code={`
"use client"; // [!code collapse:52]
import { type cnst, fetch, IcecreamOrder, st } from "@apps/koyo/client";
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";
import { Fragment } from "react";

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
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
        <Fragment key={icecreamOrder.id}>
          <IcecreamOrder.Unit.Card icecreamOrder={icecreamOrder} showControls={showControls} />
          {showControls ? (
            <Model.ViewModal
              id={icecreamOrder.id}
              slice={slice}
              renderTitle={(icecreamOrder: cnst.IcecreamOrder) => \`IcecreamOrder - \${icecreamOrder.id}\`}
              renderView={(icecreamOrder: cnst.IcecreamOrder) => (
                <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
              )}
            />
          ) : null}
        </Fragment>
      )}
    />
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

interface InsightProps { // [!code ++:8]
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
                en: `Key features of the Zone component:`,
                ko: `Zone 컴포넌트의 주요 기능:`,
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                <strong>st.slice[slice.sliceName].use.icecreamOrderInsight()</strong>:{" "}
                {l.trans({
                  en: "Auto-generated hook that reads the insight the slice loaded with its list, counted on the server for the slice's current query arguments.",
                  ko: "슬라이스가 목록과 함께 불러온 인사이트를 읽는 자동 생성된 훅입니다. 인사이트는 슬라이스의 현재 쿼리 인자 기준으로 서버에서 집계됩니다.",
                })}
              </li>
              <li>
                <strong>useInterval</strong>:{" "}
                {l.trans({
                  en: "Carried over from the slice tutorial, and still a plain 3-second poll - the insight is recounted on a timer, not pushed. A slice that declares .live() sends each change to its subscribers instead.",
                  ko: "슬라이스 튜토리얼에서 이어진 코드이며, 여전히 단순한 3초 폴링입니다 - 인사이트는 푸시되는 것이 아니라 타이머에 맞춰 다시 집계됩니다. 슬라이스에 .live()를 선언하면 변경분이 구독자에게 전달됩니다.",
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: `Finally, add the Insight Zone to your page to display the aggregated statistics:`,
                ko: `마지막으로, 집계 통계를 표시하기 위해 페이지에 Insight Zone을 추가합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/_index.tsx"
              code={`
import { type cnst, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client"; // [!code collapse:4]
import { page } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"> // [!code collapse:5]
        <div className="font-black text-5xl">{l("inventory.modelName")}</div>
        <Inventory.Util.Refill />
      </div>
      <Inventory.Zone.Today />
      <div className="flex items-center gap-4">
        <div className="font-black text-5xl">{l("icecreamOrder.modelName")}</div>
        <IcecreamOrder.Util.PublicQueryMaker />
        <Model.New
          trigger={<button className={buttonRecipe({ variant: "primary" })}>{l("base.new")}</button>}
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="default"
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
    </div>
  );
});`}
            />
            <div>
              {l.trans({
                en: `When users filter orders by status, the insight dashboard automatically updates to show aggregated statistics for only those filtered orders.`,
                ko: `사용자가 상태별로 주문을 필터링하면, 인사이트 대시보드가 자동으로 업데이트되어 필터링된 주문에 대한 집계 통계만 보여줍니다.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `In the next tutorial, we'll relate data between models: a Delivery that groups several ice cream orders so one driver can carry them together.`,
                ko: `다음 튜토리얼에서는 모델 간 데이터를 연결합니다. 여러 아이스크림 주문을 하나의 Delivery로 묶어 배달원 한 명이 함께 가져갈 수 있게 만듭니다.`,
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
