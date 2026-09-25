# Practice

- Source: /docs/intro/practice
- Mirror: /llms/pages/docs/intro/practice.md
- Section: docs
- Category: Introduction
- Priority: P0

## Headings

- Icecream business (#icecream-business)
- Create icecream order module (#create-module)
- Define Constant (#define-constant)
- Fill dictionary (#fill-dictionary)
- Make template file (#make-template)
- Update unit file (#update-unit)
- Expose to page (#expose-to-page)

## Content

Practice

Icecream business

You are now the owner of a Korean-style yogurt ice cream shop, "Ko-yo". The shop is located in San Francisco and you need to open the shop and start your business. The shop is 20 square meters in size.

The concept of Korean-style yogurt ice cream is that customers can freely add their desired toppings to the yogurt base ice cream. You need to implement a order form to allow customers to select and add toppings freely.

First, let's create an akan app with the project code "koyo". The koyo project is a service that operates all services under your company as the brand "Ko-yo". Now, let's type the following command in the terminal.

Now, you can run the koyo service locally with the following command. Then, you can access the service at http://localhost:8282.

Create icecream order module

Now, customers want to order the ice cream. The order is simple. You need to select the size of the yogurt base ice cream and check the desired toppings.

In Akan.js, we organize features into "modules" - think of them as complete packages that handle everything related to one thing. An ice cream order module will contain all the code needed to create, display, and manage ice cream orders.

When you create a module, Akan.js automatically generates all the files you need following a consistent pattern. This makes your code organized and easy to understand.

Fruit Ring

Oreo

Strawberry

Mango

Cheese Cube

Corn

Granola

Banana

Fig

Now, let's create a domain for the ice cream order. The domain name is icecreamOrder, and it stores information about each ice cream order.

This command will ask you which application to add the module to - select "koyo" since that's our ice cream shop app. The module name "icecreamOrder" describes what this module handles.

After running this command, Akan.js creates a complete folder structure with all the files you need. Let's look at what gets created:

Application code

Individual application

Domain modules

Icecream order domain module

Business intent

Types and schemas

Translations

Document

Business logic

API endpoints

State management

Form UI

Overview UI

Utility UI

Detail view UI

Integration UI

Each file has a specific purpose in organizing your ice cream order feature:

abstract.md

Describes the module's business intent, domain rules, workflows, and agent notes

constant.ts

Defines what an ice cream order looks like (size, toppings, etc.)

dictionary.ts

Translates technical terms into user-friendly language

document.ts

Handles database storage and retrieval

service.ts

Contains business logic (creating orders, calculating prices)

signal.ts

Connects frontend to backend with API calls

store.ts

Manages form state and user interactions

UI Files (.tsx)

Create the visual components customers see and interact with

Don't worry about understanding every file right now! We'll work through them step by step. The important thing is that Akan.js is based on this organized structure.

Define Constant

Constant file is a file that defines the shape of the object in the domain. It stores the shape of the object in the database and allows the client to query and represent data based on this shape.

The ice cream order can be represented as an object like the above. The IcecreamOrderInput, which is information for creating an order, can create an order by specifying the size and toppings of the ice cream.

Great! Now we have defined what our ice cream order looks like. But how will customers see "size" and "toppings" in their own language? That's where the dictionary comes in next.

Fill dictionary

To display and describe each data of the object to the user, you need to fill the dictionary file. You can set how to display each field to the user in the dictionary, and multi-language display is supported by default.

The dictionary starts with two important entries that describe your entire module:

This is what users will see as the title or name of your feature. Instead of the technical "icecreamOrder", users see "Ice cream Order" in English or "아이스크림 주문" in Korean.

This provides a longer explanation of what this feature does. It helps users understand the purpose and context of ice cream orders in your shop.

These translations make your app user-friendly! For example, when customers visit your ice cream shop website, they'll see "Ice cream Order" as a page title, not the technical "icecreamOrder". The description helps explain what the page is for.

Now customers will see "Size" instead of "size" and "Small/Medium/Large" instead of "50/100/200". Next, let's create the actual form where customers can place their orders.

Make template file

Now let's create the order form that customers will use. The Template file creates input forms where customers can select ice cream size and toppings.

This code creates two input fields: one for selecting ice cream size (small/medium/large) and another for choosing multiple toppings. The Field.ToggleSelect shows three size options as buttons, while Field.MultiToggleSelect allows customers to pick several toppings at once.

The "st.use.icecreamOrderForm()" gets the current form data, while "st.do.setSizeOnIcecreamOrder" and "st.do.setToppingsOnIcecreamOrder" update the form when customers make selections.

🎉 Now customers can create orders using your form. But how do we show those orders in a nice, visual way? Let's create a card design to display each order beautifully.

Update unit file

The Unit file shows how each order looks in a list or card view. Think of it as the "receipt" or "order summary" that displays the order information nicely.

This creates a card design for each ice cream order. The card shows the order ID and status with different colors - green for "active", blue for "processing", and red for "served".

The clsx function changes the card's appearance based on the order status, and l() displays the status text in the user's language.

🚀 We have the form (Template) and the display card (Unit). Now let's put it all together on a webpage so customers can actually visit and use your ice cream ordering system!

Expose to page

Finally, let's create a page where customers can actually place their ice cream orders. This page connects everything together and makes it accessible through a web URL.

This complete page implementation shows how all the pieces work together! Let's break down what each part does:

This displays the page title using our dictionary! It shows "Ice cream Order" (or "아이스크림 주문" in Korean) as a big, bold heading.

This creates a "New Order" button that opens the form (Template.General) when clicked. Customers can use this to place new ice cream orders.

This displays all existing ice cream orders as cards, showing the order details and status.

Now visit http://localhost:8282/icecreamOrder to see your ice cream ordering system!

## Code Examples

### Terminal

```bash
akan create-application koyo
```

### Terminal

```bash
akan start koyo
```

### Terminal

```bash
akan create-module icecreamOrder
# then select koyo application
```

### Code

```bash
└── apps/          # ${l.trans({ en: "Application code", ko: "애플리케이션 코드" })}
    └── koyo/      # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
        └── lib/          # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
            └── icecreamOrder/  # ${l.trans({ en: "Icecream order domain module", ko: "아이스크림 주문 도메인 모듈" })}
                ├── icecreamOrder.abstract.md   # ${l.trans({ en: "Business intent", ko: "비즈니스 의도" })}
                ├── icecreamOrder.constant.ts   # ${l.trans({ en: "Types and schemas", ko: "타입과 스키마" })}
                ├── icecreamOrder.dictionary.ts # ${l.trans({ en: "Translations", ko: "번역" })}
                ├── icecreamOrder.document.ts   # ${l.trans({ en: "Document", ko: "문서" })}
                ├── icecreamOrder.service.ts    # ${l.trans({ en: "Business logic", ko: "비즈니스 로직" })}
                ├── icecreamOrder.signal.ts     # ${l.trans({ en: "API endpoints", ko: "API 엔드포인트" })}
                ├── icecreamOrder.store.ts      # ${l.trans({ en: "State management", ko: "상태 관리" })}
                ├── icecreamOrder.Template.tsx  # ${l.trans({ en: "Form UI", ko: "수정/생성 UI" })}
                ├── icecreamOrder.Unit.tsx      # ${l.trans({ en: "Overview UI", ko: "개요 UI" })}
                ├── icecreamOrder.Util.tsx      # ${l.trans({ en: "Utility UI", ko: "유틸리티 UI" })}
                ├── icecreamOrder.View.tsx      # ${l.trans({ en: "Detail view UI", ko: "상세 뷰 UI" })}
                └── icecreamOrder.Zone.tsx      # ${l.trans({ en: "Integration UI", ko: "통합 UI" })}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts

```ts
import { enumOf, Int } from "akanjs/base";
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

export class IcecreamOrderInput extends via((field) => ({
  size: field(Int, { min: 50, max: 200}), // [!code highlight:2]
  toppings: field([Topping]),
})) {}

export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(IcecreamOrderStatus, { default: "active" }), // [!code highlight]
})) {}

export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["size", "toppings", "status"] as const,
  (resolve) => ({})
) {}

export class IcecreamOrder extends via(IcecreamOrderObject, LightIcecreamOrder, (resolve) => ({})) {}

export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:2]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal"; // [!code collapse:2]

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
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
  .insight<IcecreamOrderInsight>((t) => ({})) // [!code collapse:7]
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({}))
  .error({})
  .translate({});
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx

```ts
"use client"; // [!code collapse:8]
import { Field, Layout } from "akanjs/ui";
import { cnst, st, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  return (
    <Layout.Template className={className}>
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
    </Layout.Template>
  );
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx

```ts
import { clsx, ModelProps } from "akanjs/client"; // [!code collapse:3]
import { cnst, usePage } from "@apps/koyo/client";

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl border border-base-300 bg-base-100 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <span className="inline-block rounded border border-base-300 bg-base-200 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.id")}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-block rounded bg-base-200 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full border border-base-300 bg-base-100 px-3 py-1 text-sm font-semibold text-base-content/80", {
              "bg-primary text-primary-content": icecreamOrder.status === "active",
              "bg-warning text-warning-content": icecreamOrder.status === "processing",
              "bg-secondary text-secondary-content": icecreamOrder.status === "served",
              "bg-accent text-accent-content": icecreamOrder.status === "finished",
              "bg-neutral text-neutral-content": icecreamOrder.status === "canceled",
            })}
          >
            {l(`icecreamOrderStatus.${icecreamOrder.status}`)}
          </span>
        </div>
      </div>
    </div>
  );
};
```

### apps/koyo/page/_index.tsx

```ts
import { Model } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

export default async function Page() {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-5xl font-black">
        <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div>
        <Model.New
          className="btn btn-primary"
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="name"
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
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

