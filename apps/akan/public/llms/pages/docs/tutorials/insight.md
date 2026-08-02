# Using Insight

- Source: /docs/tutorials/insight
- Mirror: /llms/pages/docs/tutorials/insight.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Stats of Query (#stats-of-query)
- Create Query Maker (#create-query-maker)
- Accelerate with Insight (#accelerate-with-insight)

## Content

Using Insight

Stats of Query

When multiple orders come in at once, you can make ice cream at once. You need to extract the insight of the current orders' ice cream amount, topping information, etc.

Create Query Maker

Before extracting insights, we need to define what data we want to query. A Query Maker allows users to filter data dynamically - like a barista checking orders by status to see which drinks to make next. Let's enhance our Slice to support flexible queries with search parameters.

First, let's update the Slice to accept status filters. The .search() method defines query parameters that users can set from the frontend:

Let's understand the key components of this Slice definition:

Defines a searchable parameter that can be set from the frontend. Here, "statuses" accepts an array of IcecreamOrderStatus values to filter orders.

Pre-defined slices with fixed status filters. inWaiting shows active and processing orders, while inPickup shows orders ready for customer pickup.

Add dictionary entries for the slice and its search parameter to enable localization:

Now let's create a UI component that allows users to select which statuses to filter by. This Query Maker component uses the auto-generated store hooks:

Key features of the Query Maker component:

Auto-generated hook that reads the current query arguments from the store. Returns the statuses array.

Updates the query arguments in the store, which automatically triggers a re-fetch of the filtered data.

Finally, add the Query Maker to your page so users can filter orders dynamically:

Accelerate with Insight

Now that we can filter our queries, let's extract meaningful insights from the data. Insight counts documents across the current query and optional per-field query filters. Think of it like a kitchen display system that shows the chef exactly how many active orders or topping requests are waiting.

First, define the Insight class in your constant file. Each field uses the accumulate option as an Akan document query filter for counting:

Let's break down the count filter patterns used:

Counts all orders that match the current query. Leave accumulate as an empty object for the base count.

Adds a field filter before counting. Because toppings is an array field, this counts orders whose toppings include "strawberry".

Add dictionary entries for the insight fields to enable proper labeling in the UI:

Now let's create a View component to display the aggregated insights in a beautiful dashboard layout:

The View component displays each insight metric in a responsive grid. The chef can quickly see how much yogurt to prepare and which toppings are most popular.

Now create a Zone component that connects the View to the store. Zone components handle data fetching and state management:

Key feature of the Zone component:

Auto-generated hook that retrieves the aggregated insight data for the specified slice. The framework handles all the aggregation pipeline execution.

Finally, add the Insight Zone to your page to display real-time aggregated statistics:

Now when users filter orders by status, the insight dashboard automatically updates to show aggregated statistics for only those filtered orders. This is incredibly powerful for real-time operational decisions!

🎉 What You've Accomplished:

Created dynamic Query Makers with searchable parameters

Learned how to define Insight classes with Akan document query filters

Built View components to display aggregated statistics

Connected Zone components to auto-generated store hooks

Integrated insights with filtered queries for real-time analytics

In the next tutorial, we'll explore how to relate data between different models. This will allow you to create rich relationships like associating orders with customers, linking products to categories, and building complex data graphs.

## Code Examples

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
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
})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
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
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx

```ts
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
};
```

### apps/koyo/page/_index.tsx

```ts
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
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts

```ts
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
})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
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
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx

```ts
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
                {l(`topping.${topping}`)}
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
            {l(`icecreamOrderStatus.${icecreamOrder.status}`)}
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
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx

```ts
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
            `IcecreamOrder - ${icecreamOrder.id ? icecreamOrder.id : "New"}`
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
};
```

### apps/koyo/page/_index.tsx

```ts
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
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

