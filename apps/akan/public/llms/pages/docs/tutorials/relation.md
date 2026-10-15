# Relate Data

- Source: /docs/tutorials/relation
- Mirror: /llms/pages/docs/tutorials/relation.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Delivery Feature (#delivery-feature)
- Create Delivery Module (#create-delivery-module)
- Define Relationship (#define-relationship)
- Summary (#summary)

## Content

Relate Data

Delivery Feature

The ice cream shop is so successful that delivery orders are flooding in! Now we need to manage delivery orders. A delivery driver can deliver multiple orders at once, which means we need to create a relationship between deliveries and orders. This is a classic one-to-many relationship - one Delivery contains many IcecreamOrders.

In this tutorial, you'll learn how to:

Define relationships between models with Light model references

Trigger side effects when related data is created

Build UI components for selecting and displaying related data

Create Delivery Module

First, let's create the Delivery module using the CLI. This module will connect multiple ice cream orders into a single delivery batch.

Define Relationship

Now let's define the Delivery model with a relationship to IcecreamOrder. The key is using LightIcecreamOrder as the field type - the delivery stores each order's id, and reading a delivery hands the orders back as LightIcecreamOrder.

Let's understand the key relationship pattern:

This defines a one-to-many relationship as an array of order references. The "Light" version carries only the fields a list shows (serveType, size, toppings, status), so a delivery loads its orders without their full documents.

Stored as ids

The delivery document keeps only the order ids, and the orders are loaded whenever a delivery is read. A delivery therefore always shows each order's current status, never a copy taken when it was created.

Add dictionary entries for the Delivery model:

Now let's implement the service layer with lifecycle hooks. When a delivery is created, all associated orders should be marked as finished:

Key service patterns for related data:

Injects the IcecreamOrderService so DeliveryService can interact with orders. This enables cross-model operations.

A lifecycle hook that runs after a delivery is created. It iterates through all linked orders and marks them as finished, which keeps cascading updates consistent.

Prevents updates to deliveries by throwing an Err. Once a delivery is created, it becomes immutable - ensuring data integrity.

The generated slice reads "cru: None", so nobody can create a delivery yet. Open creation the way the practice tutorial did for orders. Updates stay closed, and _preUpdate refuses them on the server too:

Now let's create the Template component for selecting related orders. The Field.Children component is designed specifically for selecting related data:

Key features of Field.Children:

Specifies which slice provides the selectable options. Here it's 'icecreamOrderInDelivery' - a slice filtered for delivery-eligible orders.

Arguments passed to the slice, one entry per argument. [["served"]] sets statuses to ["served"], so only orders ready to go out are listed.

Custom render function for each selectable option. Shows order ID for easy identification.

Add a new slice to IcecreamOrder specifically for the delivery selection UI. This filters orders by status and serve type:

Add arguments to support serveType filtering in the byStatuses query declaration in the document.

Add dictionary entries for the new slice:

Now let's create the Unit component to display deliveries with their related orders:

Notice how we iterate through delivery.icecreamOrders and render each one using the IcecreamOrder.Unit.Card component. The orders arrive loaded with the delivery, so the Unit runs no query of its own.

Delivery.View still renders the name field the CLI generated, which no longer exists. Render the orders there the same way:

Create the Zone component with a modal for creating new deliveries:

The submitOption.onSuccess callback updates the local state with the finished orders, keeping the UI in sync with the database changes.

Finally, let's integrate everything into the main page using Tab components to organize orders and deliveries:

Key features of this integrated page:

Organizes related content into switchable panels. Tab.Menu styles the active and inactive tabs itself, and activeClassName adds to the active one only.

Both slice queries leave at call time and each Tab.Panel gets its own promise, so the two tabs load in parallel and neither waits for the other.

Summary

Reference another model through its Light class to load only the fields you show

A relation stores ids, so every read shows the related data as it is now

Use lifecycle hooks for maintaining data consistency

Create dedicated slices for relationship selection UIs

All core tutorials are complete. Explore the Architecture section to see how everything works together.

## Code Examples

### Terminal

```bash
akan create-module delivery
# then select koyo application
```

### apps/koyo/lib/delivery/delivery.constant.ts

```ts
import { via } from "akanjs/constant";

import { LightIcecreamOrder } from "../icecreamOrder/icecreamOrder.constant"; // [!code highlight]

export class DeliveryInput extends via((field) => ({
  icecreamOrders: field([LightIcecreamOrder], { minlength: 1 }), // [!code highlight]
})) {}

export class DeliveryObject extends via(DeliveryInput, (field) => ({})) {}

export class LightDelivery extends via(DeliveryObject, ["icecreamOrders"] as const, (resolve) => ({})) {} // [!code highlight]
// [!code collapse:4]
export class Delivery extends via(DeliveryObject, LightDelivery, (resolve) => ({})) {}

export class DeliveryInsight extends via(Delivery, (field) => ({})) {}
```

### apps/koyo/lib/delivery/delivery.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:6]

import type { Delivery, DeliveryInsight } from "./delivery.constant";
import type { DeliveryFilter } from "./delivery.document";
import type { DeliveryEndpoint, DeliverySlice } from "./delivery.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Delivery", "배달"]).desc([ // [!code highlight:4]
      "Delivery is an option that allows you to deliver multiple icecream orders at once.",
      "아이스크림 주문을 배달처리하는 옵션으로, 여러 주문을 한번에 배달처리할 수 있습니다.",
    ]),
  )
  .model<Delivery>((t) => ({
    icecreamOrders: t(["Icecream Orders", "아이스크림 주문"]).desc([ // [!code highlight:4]
      "Icecream orders of the delivery",
      "아이스크림 주문들",
    ]),
  }))
  .insight<DeliveryInsight>((t) => ({})) // [!code collapse:7]
  .query<DeliveryFilter>((fn) => ({}))
  .sort<DeliveryFilter>((t) => ({}))
  .slice<DeliverySlice>((fn) => ({
    inPublic: fn(["Delivery In Public", "Delivery 공개"]).arg((t) => ({})),
  }))
  .endpoint<DeliveryEndpoint>((fn) => ({}))
  .error({
    cannotUpdateDelivery: ["Cannot update a delivery", "배달을 수정할 수 없습니다."], // [!code highlight]
  })
  .translate({});
```

### apps/koyo/lib/delivery/delivery.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict"; // [!code highlight:2]
import type * as srv from "../srv";

export class DeliveryService extends serve(db.delivery, ({ use, service }) => ({
  icecreamOrderService: service<srv.IcecreamOrderService>(), // [!code highlight]
})) {
  override _preUpdate(id: string, data: db.DeliveryInput): never { // [!code highlight:8]
    throw new Err("delivery.error.cannotUpdateDelivery");
  }
  override async _postCreate(delivery: db.Delivery) {
    for (const icecreamOrderId of delivery.icecreamOrders)
      await this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    return delivery;
  }
}
```

### apps/koyo/lib/delivery/delivery.signal.ts

```ts
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class DeliveryInternal extends internal(srv.delivery, ({ interval }) => ({})) {}

export class DeliverySlice extends slice(
  srv.delivery,
  { guards: { root: None, get: Public, cru: None, create: Public } }, // [!code highlight]
  (init) => ({
    inPublic: init({ guards: [Public] }).exec(function () {
      return this.deliveryService.queryAny();
    }),
  }),
) {}

export class DeliveryEndpoint extends endpoint(srv.delivery, ({ query, mutation }) => ({})) {}
```

### apps/koyo/lib/delivery/Delivery.Template.tsx

```ts
"use client";
import { type cnst, fetch, st, usePage } from "@apps/koyo/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const deliveryForm = st.use.deliveryForm();
  return (
    <Layout.Template className={className}>
      <Field.Children // [!code highlight:9]
        label={l("delivery.icecreamOrders")}
        desc={l("delivery.icecreamOrders.desc")}
        slice={fetch.slice.icecreamOrderInDelivery}
        initArgs={[["served"]]}
        value={deliveryForm.icecreamOrders}
        onChange={st.do.setIcecreamOrdersOnDelivery}
        renderOption={(icecreamOrder: cnst.LightIcecreamOrder) => <div>#{icecreamOrder.id.slice(-4)}</div>}
      />
    </Layout.Template>
  );
};
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { ID } from "akanjs/base"; // [!code collapse:11]
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
    inPublic: init({ guards: [Public] }) // [!code collapse:11]
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
    inDelivery: init({ guards: [Public] }) // [!code ++:5]
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses, "delivery");
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
})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts

```ts
import { by, from, into } from "akanjs/document"; // [!code collapse:5]

import * as cnst from "../cnst";
import { Err } from "../dict";

export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.IcecreamOrderStatus])
      .opt("serveType", cnst.ServeType) // [!code ++]
      .query((statuses, q) => ({ // [!code --]
      .query((statuses, serveType, q) => ({ // [!code ++]
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
        ...(serveType ? { serveType } : {}), // [!code ++]
      })),
  },
  sort: {},
})) {}
// [!code collapse:25]
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
  finish() {
    if (this.status !== "served") throw new Err("icecreamOrder.error.onlyServedCanBeFinished");
    this.status = "finished";
    return this;
  }
  cancel() {
    if (this.status !== "active") throw new Err("icecreamOrder.error.onlyActiveCanBeCanceled");
    this.status = "canceled";
    return this;
  }
}

export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}
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
  .of((t) => // [!code collapse:55]
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
    yogurtIcecreamQty: t(["Yogurt Icecream Qty", "요거트 아이스크림 수량"]).desc([
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
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({ // [!code collapse:5]
      statuses: t(["Statuses", "상태"]).desc(["Statuses of the icecream orders", "아이스크림 주문의 상태"]),
    })),
    inWaiting: fn(["IcecreamOrder In Waiting", "IcecreamOrder 대기"]).arg((t) => ({})),
    inPickup: fn(["IcecreamOrder In Pickup", "IcecreamOrder 픽업"]).arg((t) => ({})),
    inDelivery: fn(["IcecreamOrder In Delivery", "IcecreamOrder 배달"]).arg((t) => ({ // [!code ++:3]
      statuses: t(["Statuses", "상태"]).desc(["Statuses of the icecream orders", "아이스크림 주문의 상태"]),
    })),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({ // [!code collapse:32]
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
```

### apps/koyo/lib/delivery/Delivery.Unit.tsx

```ts
import { type cnst, IcecreamOrder, usePage } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";

export const Card = ({ delivery }: ModelProps<"delivery", cnst.LightDelivery>) => {
  const { l } = usePage();
  return (
    <div className="w-full rounded-xl border border-border p-4"> // [!code highlight:10]
      <div className="mb-3 font-bold text-lg">
        {l("delivery.modelName")} #{delivery.id.slice(-4)}
      </div>
      <div className="flex w-full flex-col gap-2">
        {delivery.icecreamOrders.map((icecreamOrder) => (
          <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} showControls={false} />
        ))}
      </div>
    </div>
  );
};
```

### apps/koyo/lib/delivery/Delivery.View.tsx

```ts
import { type cnst, IcecreamOrder, usePage } from "@apps/koyo/client";
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  delivery: cnst.Delivery;
}
export const General = ({ className, delivery }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn("w-full space-y-2", className)}> // [!code highlight:8]
      <div className="font-bold text-lg">
        {l("delivery.modelName")} #{delivery.id.slice(-4)}
      </div>
      {delivery.icecreamOrders.map((icecreamOrder) => (
        <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} showControls={false} />
      ))}
    </div>
  );
};
```

### apps/koyo/lib/delivery/Delivery.Zone.tsx

```ts
"use client";
import { type cnst, Delivery, fetch, st, usePage } from "@apps/koyo/client"; // [!code highlight]
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { buttonRecipe, Load, Model } from "akanjs/ui"; // [!code highlight]

interface CardProps { // [!code collapse:10]
  className?: string;
  init: ClientInit<"delivery", cnst.LightDelivery>;
  slice?: SliceMeta;
}
export const Card = ({ className, init, slice }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(delivery) => ( // [!code --:3]
        <Delivery.Unit.Card key={delivery.id} href={`/delivery/${delivery.id}`} delivery={delivery} />
      )}
      renderItem={(delivery) => <Delivery.Unit.Card key={delivery.id} delivery={delivery} />} // [!code ++]
    />
  );
};
// [!code collapse:8]
interface ViewProps {
  className?: string;
  view: ClientView<"delivery", cnst.Delivery>;
}
export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(delivery) => <Delivery.View.General delivery={delivery} />} />;
};

interface NewProps { // [!code ++:31]
  className?: string;
}
export const New = ({ className }: NewProps) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <button
        className={buttonRecipe({ variant: "primary" })}
        onClick={() => {
          st.do.newDelivery();
        }}
      >
        + {l("base.createModel", { model: l("delivery.modelName") })}
      </button>
      <Model.EditModal
        slice={fetch.slice.deliveryInPublic}
        submitOption={{
          onSuccess: (delivery: cnst.Delivery) => {
            st.do.setIcecreamOrder(...delivery.icecreamOrders);
          },
        }}
        onCancel={() => {
          st.do.resetDelivery();
        }}
      >
        <Delivery.Template.General />
      </Model.EditModal>
    </div>
  );
};
```

### apps/koyo/page/_index.tsx

```ts
import { type cnst, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client"; // [!code --]
import { type cnst, Delivery, fetch, IcecreamOrder, Inventory, usePage } from "@apps/koyo/client"; // [!code ++]
import { page } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui"; // [!code --]
import { buttonRecipe, Model, Tab } from "akanjs/ui"; // [!code ++]

export default page().render(() => {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = fetch.initIcecreamOrderInPublic();
  const { deliveryInitInPublic } = fetch.initDeliveryInPublic(); // [!code ++]
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"> // [!code collapse:5]
        <div className="font-black text-5xl">{l("inventory.modelName")}</div>
        <Inventory.Util.Refill />
      </div>
      <Inventory.Zone.Today />
      <Tab defaultMenu="icecreamOrder"> // [!code highlight:41]
        <Tab.Menus className="flex items-center">
          <Tab.Menu
            menu="icecreamOrder"
            className="h-14 px-8 text-lg"
            activeClassName="bg-primary text-primary-foreground"
          >
            {l("icecreamOrder.modelName")}
          </Tab.Menu>
          <Tab.Menu menu="delivery" className="h-14 px-8 text-lg" activeClassName="bg-primary text-primary-foreground">
            {l("delivery.modelName")}
          </Tab.Menu>
        </Tab.Menus>
        <Tab.Panel menu="icecreamOrder" className="space-y-4 p-2">
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
          <IcecreamOrder.Zone.Insight slice={fetch.slice.icecreamOrderInPublic} />
          <IcecreamOrder.Zone.Card
            className="space-y-2"
            init={icecreamOrderInitInPublic}
            slice={fetch.slice.icecreamOrderInPublic}
          />
        </Tab.Panel>
        <Tab.Panel menu="delivery" className="space-y-4 p-2">
          <div className="flex items-center gap-4">
            <div className="font-black text-5xl">{l("delivery.modelName")}</div>
            <Delivery.Zone.New />
          </div>
          <Delivery.Zone.Card className="space-y-2" init={deliveryInitInPublic} />
        </Tab.Panel>
      </Tab>
    </div>
  );
});
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

