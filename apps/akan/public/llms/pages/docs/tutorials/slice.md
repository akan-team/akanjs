# Displaying with Slice

- Source: /docs/tutorials/slice
- Mirror: /llms/pages/docs/tutorials/slice.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Displaying with Slice (#displaying-with-slice)
- Dashboard Slice (#dashboard-slice)
- Connect to Zone (#connect-to-zone)
- Zone with Slice (#zone-with-slice)
- Slice Component Rules (#slice-component-rules)

## Content

Displaying with Slice

We want to show customers a real-time dashboard of ice cream order processing. Completed orders should be displayed prominently, and the list of ongoing orders should also be visible. By using Slice, you can present the same ice cream order data in real time from different perspectives for customers, staff, and administrators.

Dashboard Slice

First, let's declare a slice for the real-time dashboard to show to customers. You can display the waiting orders and the orders being picked up by querying them separately.

inWaiting slice is a slice that queries the waiting orders and inPickup slice is a slice that queries the orders being picked up. When the slice is declared, the state and actions of the store are automatically created.

Just like labeling different shelves in an ice cream shop - "Ready for pickup", "Being made" - we need to give proper names to our slices in the dictionary. This ensures the UI displays meaningful labels and the slice functions are properly documented.

Connect to Zone

Now let's build the actual dashboard page that customers will see. Think of this like the large display screens in a cafe that show "Now Serving: Order #42" - it needs to show different views of the same order data simultaneously. We'll use Zone components to connect our slices to the UI and display them in real-time.

Don't forget to add the translation labels for the dashboard sections:

Let's break down how this dashboard page works:

The Load.Page component handles data loading before rendering. It fetches both waiting and pickup orders simultaneously using Promise.all for optimal performance.

Zone components connect slice data to UI rendering. By passing the init data and slice, the Zone automatically subscribes to real-time updates for that specific slice.

For the customer-facing dashboard, we hide the action controls. Customers should only see the status, not modify orders. This is a common pattern for read-only displays.

Zone with Slice

For a real-time dashboard, the data needs to stay fresh. When a staff member changes an order status, customers watching the display should see it update automatically. The Zone component combined with useInterval creates this "live" experience - just like how airport departure boards constantly refresh to show the latest flight information.

Let's look at how to control the display with props and automatic refresh:

The Unit component now accepts a showControls prop that determines whether to display action buttons. This simple flag allows the same card component to be used in both staff management views (with controls) and customer dashboard views (without controls).

Now let's see how the Zone component manages automatic data refresh:

Let's understand the key features of this Zone component:

The useInterval hook refreshes the slice data every 3 seconds. This ensures the dashboard stays current without manual user interaction - perfect for displays that need to show live order status.

The refresh function is automatically generated for each slice. It re-queries the data using the same conditions defined in the slice, ensuring consistent data fetching.

Load.Units handles rendering a list of items with proper loading states. It automatically manages the mapping from slice data to individual Unit cards.

Slice Component Rules

When working with slices and zones in Akan.js, following consistent patterns ensures your code remains maintainable and predictable. Think of these rules as the "house rules" of your ice cream shop - they keep everything running smoothly even as the shop grows.

One Slice, One Purpose

Each slice should have a clear, single purpose. inWaiting shows waiting orders, inPickup shows ready orders. Don't try to make a slice that does everything - create multiple focused slices instead.

Zone Matches Slice

Always pass the correct slice to Zone components. The slice connects the Zone to its data source and ensures refresh actions target the right slice.

Props Control Behavior

Use props like showControls to adapt component behavior for different contexts. This allows reusing the same component across staff views and customer displays.

Dictionary for All Labels

Always define slice names and related translations in the dictionary. This ensures consistent labeling across the application and enables proper internationalization.

🎉 What You've Accomplished:

Created multiple slices for different data views

Built a real-time customer dashboard

Connected slices to Zone components

Implemented automatic data refresh

Learned slice component best practices

In the next tutorial, we'll explore how to create dynamic page navigation and user experiences using Pages in Akan.js. This will allow customers to navigate through multi-step ordering flows and interactive interfaces.

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
})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
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
  .translate({});
```

### apps/koyo/page/dashboard.tsx

```ts
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
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
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
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx

```ts
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
            {l(`icecreamOrderStatus.${icecreamOrder.status}`)}
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
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx

```ts
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
            `IcecreamOrder - ${icecreamOrder.id ? icecreamOrder.id : "New"}`
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
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

