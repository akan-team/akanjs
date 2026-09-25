# Modifying Status

- Source: /docs/tutorials/util
- Mirror: /llms/pages/docs/tutorials/util.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Modifying Status (#modifying-status)
- Implement Document Business Logic (#document-logic)
- Implement Service Layer (#manage-service)
- Create Signal Endpoints (#signal-endpoints)
- Create Frontend Store Actions (#store-actions)
- Create Utility Components (#util-components)
- Apply To Unit & View Components (#apply-to-components)
- Test Status Management (#test-implementation)
- Status Management Best Practices (#best-practices)
- What's Next? (#next-steps)

## Content

Modifying Status

Now that customers can create and view ice cream orders, let's add functionality for shop staff to manage the order lifecycle. In a real ice cream shop, orders need to progress through different stages: from "active" (newly placed) to "processing" (being prepared) to "served" (completed) or "canceled" if needed.

Think of status modification like the workflow in a real ice cream shop. When a customer places an order, it starts as "active" - like a ticket on the order board. Then staff begins preparation ("processing"), and finally serves it to the customer ("served"). This tutorial shows you how to implement this natural workflow with proper validation and user-friendly controls.

Before implementing the functionality, let's understand the business logic behind ice cream order status transitions:

When a customer places an order, it starts as "active". Staff can begin processing it by clicking "Process".

While an order is being prepared, it's in "processing" status. Once ready, staff can mark it as "served".

Only active orders can be canceled. Once processing begins, cancellation is no longer allowed.

Business Rules

Only active orders can be processed or canceled

Only processing orders can be served

Served and canceled orders are final states

Implement Document Business Logic

Just like a real ice cream shop has rules about when orders can be processed or canceled, we need to implement these business rules in our code. The document layer is where we define these rules - think of it as the "shop policies" that ensure orders are handled correctly no matter who is working or how busy it gets.

These methods implement our business rules directly in the data model:

Checks if status is 'active' before changing to 'processing'

Validates that status is 'processing' before marking as 'served'

Ensures only 'active' orders can be canceled

When validation fails, we throw an Err with a dictionary key for user-friendly error messages. Let's add these error messages to our dictionary:

Implement Service Layer

Now we need service methods that act like the shop manager - coordinating between the business rules (document layer) and the actual data storage (database). When a staff member wants to process an order, the service layer fetches the order, applies the business rules, and saves the changes safely.

Each service method follows the same pattern:

Fetch

Retrieve the order from database using getIcecreamOrder()

Execute

Call the business logic method (process(), serve(), or cancel())

Save

Persist the changes to database with save()

This pattern ensures that business rules are enforced at the document level while the service handles database transactions safely.

Create Signal Endpoints

Think of signal endpoints as the communication system between the frontend (like the shop's order display screen) and the backend (the kitchen and management system). When staff clicks a "Process" button on the screen, it needs to communicate with the backend to actually update the order. Akan.js automatically creates both REST and GraphQL versions of these endpoints, so different parts of your system can communicate however they prefer.

Each signal endpoint is defined using the mutation() builder, specifying the return type and accepting the order ID as a parameter via .param(). The .exec() callback delegates to the corresponding service method to perform the actual business logic.

We also need to add dictionary entries for these API endpoints so they display properly in the UI:

Create Frontend Store Actions

The store layer is like the control panel that staff actually interact with. It takes the complex API communications and turns them into simple actions like "processOrder()" that components can easily use. When a button is clicked, the store handles calling the API and updating the display automatically - just like how pressing a button on a shop's POS system updates both the backend and the screen.

Each store action follows this pattern:

API Call

Make an API request to signal endpoints through fetch methods

State Update

Update the local store state with the new order data using setIcecreamOrder()

This ensures that when status changes happen, the UI automatically reflects the updated state without requiring a page refresh.

Create Utility Components

Just like a real ice cream shop might have labeled buttons or stamps for different order stages, we'll create reusable button components for each action. These "digital buttons" can be placed anywhere in our interface - on order cards, in detailed views, or on staff dashboards. By creating them once as utility components, we ensure consistent behavior and styling throughout the entire application.

Each button component includes:

Consistent Styling

Each button has appropriate styling: primary for Process, secondary for Serve, outlined warning for Cancel

Disabled State

Buttons can be disabled when actions aren't allowed based on current status

Internationalization

Button labels come from dictionary entries for proper multilingual support

Apply To Unit & View Components

Now comes the exciting part - putting all the pieces together! Just like adding action buttons to the order tickets in a real shop, we'll integrate our status management buttons directly into the order cards and detailed views. This means staff won't need to navigate to separate pages or menus - they can process orders right from wherever they're viewing them, making the workflow fast and intuitive.

Let's update the Unit component to include status management buttons:

Now let's also add the buttons to the detailed view modal:

Key features of this implementation:

Smart Disabling

Buttons are disabled when actions aren't allowed based on current status

Responsive Layout

Buttons wrap gracefully on smaller screens with flex-wrap

Visual Hierarchy

Different button styles indicate action priority and type

Test Status Management

Let's test our status management implementation to ensure everything works correctly:

Testing Steps:

Navigate to http://localhost:8282/icecreamOrder

Create a new ice cream order (it will start as 'active')

Notice that only 'Process' and 'Cancel' buttons are enabled

Click 'Process' - the status should change to 'processing'

Now only the 'Serve' button should be enabled

Click 'Serve' - the status should change to 'served'

All action buttons should now be disabled (final state)

Expected Behavior:

Status changes should be instant and visible

Button states should update automatically

Invalid actions should be prevented

Error messages should appear if business rules are violated

Status Management Best Practices

Here are important best practices for implementing status management in Akan.js:

Enforce Business Rules

Always validate state transitions at the document level using business methods. This ensures data integrity regardless of how the API is called.

Smart UI Controls

Disable buttons and hide actions that aren't valid for the current state. This provides immediate feedback to users about what actions are possible.

Consistent Patterns

Follow the same pattern across all status operations: Document → Service → Signal → Store → Component. This makes your code predictable and maintainable.

Proper Error Handling

Use dictionary-based error messages with Err exceptions. This ensures error messages are properly translated and user-friendly.

What's Next?

Excellent work! You've successfully implemented a complete status management system for your ice cream orders. Shop staff can now efficiently manage the order lifecycle with proper business rule enforcement.

🎉 What You've Accomplished:

Implemented business logic with validation

Created service layer for status operations

Built signal endpoints for status changes

Added frontend store actions

Created reusable utility components

Integrated smart UI controls

In the next tutorial, we'll learn how to edit existing data by implementing order modification functionality. This will allow customers to update their ice cream orders before they're processed, completing the full CRUD operations for our ice cream shop.

## Code Examples

### apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts

```ts
import { by, from, into, type SchemaOf } from "akanjs/document"; // [!code collapse:3]

import * as cnst from "../cnst";
import { Err } from "../dict"; // [!code ++]
// [!code collapse:6]
export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({
  query: {},
  sort: {},
})) {}

export class IcecreamOrder extends by(cnst.IcecreamOrder) {
  process() { // [!code ++:20]
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
// [!code collapse:2]
export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:37]
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
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({}))
  .error({
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"], // [!code ++:4]
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({}); // [!code collapse:1]
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts

```ts
import { serve } from "akanjs/service"; // [!code collapse:4]

import * as db from "../db";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code ++:16]
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.process().save();
  }
  async serveIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.serve().save();
  }
  async finishIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.finish().save();
  }
  async cancelIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.cancel().save();
  }
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { ID } from "akanjs/base"; // [!code ++]
import { endpoint, internal, Public, slice } from "akanjs/signal"; // [!code collapse:18]

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ interval }) => ({})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.icecreamOrderService.queryAny();
    }),
  })
) {}

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
  .of((t) => // [!code collapse:36]
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
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({
    processIcecreamOrder: fn(["Process", "작업시작"]) // [!code ++:20]
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
  .error({ // [!code collapse:7]
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"],
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({});
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.store.ts

```ts
import { store } from "akanjs/store"; // [!code collapse:5]

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class IcecreamOrderStore extends store(sig.icecreamOrder, () => ({
  // state // [!code collapse:1]
})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code ++:16]
    const icecreamOrder = await fetch.processIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async serveIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.serveIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async finishIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.finishIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async cancelIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.cancelIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
}
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx

```ts
"use client"; // [!code collapse:4]
import { clsx } from "akanjs/client";
import { st, usePage } from "@apps/koyo/client";

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
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx

```ts
import { clsx, type ModelProps } from "akanjs/client"; // [!code collapse:3]
import { Model } from "akanjs/ui";
import { cnst, fetch, usePage } from "@apps/koyo/client";
import { IcecreamOrder } from "@apps/koyo/client"; // [!code ++]

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
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
      <div className="bg-base-100 flex items-center justify-center gap-2 rounded-xl p-4">
        <Model.ViewWrapper slice={fetch.slice.icecreamOrder} modelId={icecreamOrder.id}>
          <button className="btn btn-primary">
            <span>{l.trans({ en: "View", ko: "보기" })}</span>
          </button>
        </Model.ViewWrapper>
        <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} /> // [!code ++:4]
        <IcecreamOrder.Util.Serve icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "processing"} />
        <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
        <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
      </div>
    </div>
  );
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx

```ts
import { clsx } from "akanjs/client"; // [!code collapse:2]
import { cnst, usePage } from "@apps/koyo/client";
import { IcecreamOrder } from "@apps/koyo/client"; // [!code ++]
// [!code collapse:5]
interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4"> // [!code collapse:42]
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
      <div className="flex items-center justify-end gap-2"> // [!code ++:6]
        <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
        <IcecreamOrder.Util.Serve icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "processing"} />
        <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
        <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
      </div>
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

