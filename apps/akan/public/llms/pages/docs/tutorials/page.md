# UX with Pages

- Source: /docs/tutorials/page
- Mirror: /llms/pages/docs/tutorials/page.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Kiosk for Customers (#kiosk-for-customers)
- Add Schema (#add-schema)
- Kiosk Landing Page (#kiosk-landing-page)
- Order Form Page (#order-form-page)
- Page UX Best Practices (#page-best-practices)

## Content

UX with Pages

Kiosk for Customers

The number of customers at the store has increased, and the staff is having trouble processing orders. Let's create a kiosk for customers to order ice cream. A kiosk is a simple interface that allows customers to order ice cream.

Add Schema

There is some missing information in the current schema to allow customers to order directly from the kiosk. We need to add serve type and contact information. Let's expand the schema to add these features.

Let's understand the new schema additions:

An enum defining how the customer wants their order - for here, take out, or delivery

Customer's phone number with validation using isPhoneNumber for pickup notifications

Updated to include serveType for display in order lists and dashboards

Next, we need to add dictionary entries for the new fields and enum values:

Next, let's add serveType and phone selection to the order form template.

Finally, let's display serveType on the order card to clearly show whether the customer's order is for here or take out, etc.

Kiosk Landing Page

The first thing customers see when they approach the kiosk is the landing page. Think of it like the welcome screen at a fast-food restaurant kiosk - it should be inviting, easy to understand, and guide customers to their first choice: "For Here" or "Take Out".

Let's create an attractive landing page that makes ordering feel like a delightful experience:

Let's break down the key features of this landing page:

Language switcher buttons allow customers to choose their preferred language. This is essential for kiosks in tourist areas or multicultural neighborhoods.

The "For Here" and "Take Out" buttons pass serveType as a query parameter to the next page. This pre-fills the order form with the customer's choice.

Visual Design

Large buttons with emojis make the interface touch-friendly and intuitive. Gradient backgrounds and hover effects create a modern, engaging experience.

After customers complete their order, they need a confirmation page. Let's create a success page that reassures them:

The success page provides important feedback to customers:

A large checkmark icon gives instant visual confirmation that the order was successful

Clear instructions tell customers to wait for their order number to be called

A 'Place New Order' button allows the next customer to start fresh

Order Form Page

The heart of the kiosk is the order form page. This is where customers actually customize their ice cream - choosing size, toppings, and entering their phone number for pickup notifications. Think of this page like the main ordering screen at a bubble tea shop where you select your drink size and add-ons.

The page needs to handle query parameters from the landing page and provide an intuitive form experience:

Let's understand the key components of this order form page:

Next.js provides searchParams as a Promise that contains URL query parameters. We extract the serveType to pre-fill the order form with the customer's choice from the landing page.

The Load.Edit component handles form state management, validation, and submission. It connects to the slice for data persistence and automatically navigates to the success page on submit.

Setting onCancel to "back" enables the cancel button to navigate back to the previous page. This provides an easy way for customers to change their mind.

Now let's style the Template component for a beautiful kiosk experience. Each section is wrapped in a card with icons:

The Template component uses these Field components for kiosk-friendly input:

Large, touch-friendly buttons for selecting a single option (size)

Allows selecting multiple options (toppings) with visual feedback

Phone number input with formatting and validation built-in

Page UX Best Practices

When building customer-facing pages like kiosks, following UX best practices ensures a smooth and enjoyable experience. Here are the key principles we applied:

Clear Navigation Flow

Guide customers through a linear flow: Landing → Order Form → Success. Each step has one clear purpose, reducing confusion.

Touch-Friendly Design

Large buttons (py-6), adequate spacing, and visual feedback on interaction make the interface easy to use on touchscreens.

Visual Hierarchy with Icons

Emojis and icons provide instant visual cues that help customers understand each section without reading text carefully.

State Preservation

Using query parameters and Load.Edit ensures customer choices are preserved between pages, creating a seamless experience.

🎉 What You've Accomplished:

Extended schema with new fields for kiosk ordering

Built an attractive landing page with language switching

Created a touch-friendly order form with Field components

Implemented success page with clear customer feedback

Learned page UX best practices for kiosk applications

In the next tutorial, we'll explore how to use Scalar for computed values and aggregations. This will allow you to display dynamic information like order totals, wait times, and statistics in real-time.

## Code Examples

### apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts

```ts
import { isPhoneNumber } from "akanjs/common"; // [!code ++]
import { enumOf, Int } from "akanjs/base"; // [!code collapse:3]
import { via } from "akanjs/constant";

export class ServeType extends enumOf("serveType", ["forHere", "takeOut", "delivery"] as const) {} // [!code ++]
// [!code collapse:21]
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

export class IcecreamOrderInput extends via((field) => ({
  serveType: field(ServeType, { default: "forHere" }), // [!code ++:2]
  phone: field(String, { validate: isPhoneNumber }).optional(),
  size: field(Int, { min: 50, max: 200 }),
  toppings: field([Topping]),
})) {}
// [!code collapse:5]
export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(IcecreamOrderStatus, { default: "active" }),
})) {}

export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["serveType", "phone", "size", "toppings", "status"] as const, // [!code ++]
  (resolve) => ({})
) {}
// [!code collapse:4]
export class IcecreamOrder extends via(IcecreamOrderObject, LightIcecreamOrder, (resolve) => ({})) {}

export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:4]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";
import type { ServeType } from "./icecreamOrder.constant"; // [!code ++]

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:6]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ])
  )
  .model<IcecreamOrder>((t) => ({
    serveType: t(["Serve Type", "서빙 타입"]).desc(["Serve type of the icecream order", "아이스크림 주문의 서빙 타입"]), // [!code ++:2]
    phone: t(["Phone", "전화번호"]).desc(["Phone number of the icecream order", "아이스크림 주문의 전화번호"]),
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<ServeType>("serveType", (t) => ({ // [!code ++:5]
    forHere: t(["For Here", "매장 식사"]).desc(["For Here serve type", "매장 식사 서빙 타입"]),
    takeOut: t(["Take Out", "포장 주문"]).desc(["Take Out serve type", "포장 주문 서빙 타입"]),
    delivery: t(["Delivery", "배달"]).desc(["Delivery serve type", "배달 서빙 타입"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({ // [!code collapse:100]
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
    pickup: ["Pickup", "픽업"],
    waiting: ["Waiting", "대기"],
  });
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx

```ts
"use client"; // [!code collapse:4]
import { Field, Layout } from "akanjs/ui";
import { cnst, st, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
  showServeType?: boolean; // [!code ++]
}

export const General = ({ className }: GeneralProps) => { // [!code --]
export const General = ({ className, showServeType = true }: GeneralProps) => { // [!code ++]
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  return (
    <Layout.Template className={className}>
      {showServeType ? ( // [!code ++:8]
        <Field.ToggleSelect
          label={l("icecreamOrder.serveType")}
          items={cnst.ServeType}
          value={icecreamOrderForm.serveType}
          onChange={st.do.setServeTypeOnIcecreamOrder}
        />
      ) : null}
      <Field.ToggleSelect
        label={l("icecreamOrder.size")}
        items={[50, 100, 200].map((size) => ({ label: `${size}cc`, value: size }))}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
      <Field.Phone // [!code ++:6]
        label={l("icecreamOrder.phone")}
        placeholder="010-0000-0000"
        value={icecreamOrderForm.phone}
        onChange={st.do.setPhoneOnIcecreamOrder}
      />
    </Layout.Template>
  );
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx

```ts
import { clsx, type ModelProps } from "akanjs/client"; // [!code collapse:7]
import { Model } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

interface CardProps extends ModelProps<"icecreamOrder", cnst.LightIcecreamOrder> {
  showControls?: boolean;
}
export const Card = ({ icecreamOrder, showControls = true }: CardProps) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-base-100 via-base-200 to-base-300 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <span className="inline-block rounded bg-base-200 px-2 py-1 text-xs font-bold tracking-wider uppercase">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-primary">#{icecreamOrder.id.slice(-4)}</span>
          <span // [!code ++:9]
            className={clsx("ml-2 rounded px-2 py-1 text-xs font-semibold uppercase", {
              "border border-base-300 bg-primary text-primary-content": icecreamOrder.serveType === "forHere",
              "border border-base-300 bg-warning text-warning-content": icecreamOrder.serveType === "takeOut",
              "border border-base-300 bg-secondary text-secondary-content": icecreamOrder.serveType === "delivery",
            })}
          >
            {l(`serveType.${icecreamOrder.serveType}`)}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2"> // [!code collapse:16]
          <span className="inline-block rounded border border-base-300 bg-base-100 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full px-3 py-1 text-sm font-semibold", {
              "border border-base-300 bg-primary text-primary-content": icecreamOrder.status === "active",
              "border border-base-300 bg-warning text-warning-content": icecreamOrder.status === "processing",
              "border border-base-300 bg-secondary text-secondary-content": icecreamOrder.status === "served",
              "border border-base-300 bg-accent text-accent-content": icecreamOrder.status === "finished",
              "border border-base-300 bg-neutral text-neutral-content": icecreamOrder.status === "canceled",
            })}
          >
            {l(`icecreamOrderStatus.${icecreamOrder.status}`)}
          </span>
        </div>
      </div>
      {showControls ? ( // [!code collapse:16]
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
      ) : null}
    </div>
  );
};
```

### apps/koyo/page/icecreamOrder.tsx

```ts
import { Link } from "akanjs/ui";
import { usePage } from "@apps/koyo/client";

export default function Page() {
  const { l } = usePage();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-base-100 via-base-200 to-base-300 p-6">
      <div className="absolute top-6 right-6 flex gap-2">
        <Link.Lang
          lang="en"
          className="rounded-lg bg-base-100/70 px-4 py-2 font-semibold text-primary backdrop-blur-sm transition-all duration-200 hover:bg-base-100 hover:shadow-md"
        >
          English
        </Link.Lang>
        <Link.Lang
          lang="ko"
          className="rounded-lg bg-base-100/70 px-4 py-2 font-semibold text-primary backdrop-blur-sm transition-all duration-200 hover:bg-base-100 hover:shadow-md"
        >
          한국어
        </Link.Lang>
      </div>
      <div className="w-full max-w-4xl space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="bg-linear-to-r from-base-100 via-base-200 to-base-300 text-7xl font-bold text-primary duration-1000 md:text-8xl">
            Koyo
          </h1>
          <p className="text-2xl font-light text-primary delay-150 duration-1000 md:text-3xl">
            {l.trans({ en: "Korean Yogurt Ice Cream", ko: "한국 요거트 아이스크림" })}
          </p>
          <div className="flex items-center justify-center gap-2 text-lg text-primary delay-300 duration-1000">
            <span className="text-3xl">🍦</span>
            <span>{l.trans({ en: "Fresh • Creamy • Delicious", ko: "신선한 • 부드러운 • 맛있는" })}</span>
            <span className="text-3xl">🍦</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 pt-8 delay-500 duration-1000 sm:flex-row sm:justify-center">
          <Link
            href="/icecreamOrder/new?serveType=forHere"
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-base-300 bg-base-200 px-10 py-6 text-2xl font-semibold text-primary shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-base-200 hover:shadow-md active:scale-95 sm:w-auto"
          >
            <span className="text-4xl">🍽️</span>
            {l.trans({ en: "For Here", ko: "매장 식사" })}
          </Link>
          <Link
            href="/icecreamOrder/new?serveType=takeOut"
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-base-300 bg-base-200 px-10 py-6 text-2xl font-semibold text-primary shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-base-200 hover:shadow-md active:scale-95 sm:w-auto"
          >
            <span className="text-4xl">🛍️</span>
            {l.trans({ en: "Take Out", ko: "포장 주문" })}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### apps/koyo/page/icecreamOrder/success.tsx

```ts
import { Link } from "akanjs/ui";
import { usePage } from "@apps/koyo/client";

export default function Page() {
  const { l } = usePage();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-base-100 via-base-200 to-base-300 p-6">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="flex justify-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-r from-base-100 to-base-300 text-7xl shadow-2xl">
            ✓
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="bg-linear-to-r from-base-100 via-base-200 to-base-300 text-5xl font-bold text-primary md:text-6xl">
            {l.trans({ en: "Order Placed!", ko: "주문 완료!" })}
          </h1>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-lg text-primary">
              <span className="text-3xl">🎉</span>
              <span className="font-semibold">
                {l.trans({ en: "We're preparing your order", ko: "주문을 준비하고 있습니다" })}
              </span>
            </div>
            <p className="text-base-content/70">
              {l.trans({
                en: "Please wait for your order number to be called",
                ko: "주문 번호가 호출될 때까지 기다려 주세요",
              })}
            </p>
          </div>
        </div>
        <div className="pt-4">
          <Link
            href="/icecreamOrder"
            className="inline-flex items-center justify-center gap-3 rounded-full border border-base-300 bg-base-200 px-12 py-6 text-2xl font-semibold text-primary shadow-2xl transition-all hover:scale-105 hover:bg-base-200 hover:shadow-md active:scale-95"
          >
            <span className="text-4xl">🏠</span>
            {l.trans({ en: "Place New Order", ko: "새 주문하기" })}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### apps/koyo/page/icecreamOrder/new.tsx

```ts
import { Load } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

interface PageProps {
  searchParams: {
    serveType?: cnst.ServeType["value"];
  };
}
export default function Page({ searchParams }: PageProps) {
  const { l } = usePage();
  const { serveType } = searchParams;
  const icecreamOrderForm: Partial<cnst.IcecreamOrder> = { serveType };
        
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-base-100 via-base-200 to-base-300 p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <span className="text-8xl">🍦</span>
          </div>
          <h1 className="bg-linear-to-r from-base-100 via-base-200 to-base-300 text-5xl font-bold text-primary md:text-6xl">
            {l("base.createModel", { model: l("icecreamOrder.modelName") })}
          </h1>
          <p className="text-xl font-light text-primary">
            {l.trans({ en: "Customize your perfect treat", ko: "나만의 완벽한 디저트를 만들어보세요" })}
          </p>
        </div>
        <Load.Edit
          className="flex flex-col items-center"
          slice={fetch.slice.icecreamOrderInPublic}
          edit={icecreamOrderForm}
          type="form"
          onCancel="back"
          onSubmit="/icecreamOrder/success"
        >
          <IcecreamOrder.Template.General showServeType={false} />
        </Load.Edit>
      </div>
    </div>
  );
}
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx

```ts
"use client";
import { clsx } from "akanjs/client"; // [!code ++]
import { Field, Layout } from "akanjs/ui"; // [!code collapse:8]
import { cnst, st, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
  showServeType?: boolean;
}

export const General = ({ className, showServeType = true }: GeneralProps) => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  return (
    <Layout.Template className={clsx("w-full space-y-6", className)}> // [!code highlight:56]
      {showServeType ? (
        <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🍦</span>
              <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.serveType")}</h2>
            </div>
            <Field.ToggleSelect
              items={cnst.ServeType}
              value={icecreamOrderForm.serveType}
              onChange={st.do.setServeTypeOnIcecreamOrder}
            />
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📏</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.size")}</h2>
          </div>
          <Field.ToggleSelect
            items={[50, 100, 200].map((size) => ({ label: `${size}cc`, value: size }))}
            value={icecreamOrderForm.size}
            onChange={st.do.setSizeOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍓</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.toppings")}</h2>
          </div>
          <Field.MultiToggleSelect
            items={cnst.Topping}
            value={icecreamOrderForm.toppings}
            onChange={st.do.setToppingsOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📱</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.phone")}</h2>
          </div>
          <Field.Phone
            placeholder="010-0000-0000"
            value={icecreamOrderForm.phone}
            onChange={st.do.setPhoneOnIcecreamOrder}
          />
        </div>
      </div>
    </Layout.Template>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

