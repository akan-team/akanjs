import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="kiosk-for-customers" title={l.trans({ en: "Kiosk for Customers", ko: "고객을 위한 키오스크" })}>
        <Docs.Title>{l.trans({ en: "Kiosk for Customers", ko: "고객을 위한 키오스크" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The number of customers at the store has increased, and the staff is having trouble processing orders. Let's create a kiosk for customers to order ice cream. A kiosk is a simple interface that allows customers to order ice cream.`,
              ko: `가게의 손님이 너무 많아져 직원이 주문을 처리하기 어려워졌습니다. 이제 손님들이 주문을 할 수 있도록 키오스크를 만들어야 합니다. 직원을 위한 기능은 복잡해도 괜찮지만, 손님을 위한 주문 기능은 단순하고 사용자 친화적인 화면을 제공해야 합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="add-schema" title={l.trans({ en: "Add Schema", ko: "스키마 추가" })}>
        <Docs.Title>{l.trans({ en: "Add Schema", ko: "스키마 추가" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `There is some missing information in the current schema to allow customers to order directly from the kiosk. We need to add serve type and contact information. Let's expand the schema to add these features.`,
              ko: `고객이 키오스크에서 직접 주문하기 위해서는 현재 스키마에서는 부족한 정보가 있습니다. 서빙방식, 연락처 정보를 추가해야 합니다. 스키마를 추가해서 기능을 확장해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts"
            code={`
import { isPhoneNumber } from "@akanjs/common"; // [!code ++]
import { enumOf, Int } from "@akanjs/base"; // [!code collapse:3]
import { via } from "@akanjs/constant";

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

export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({})) {}`}
          />
          <div>
            {l.trans({
              en: `Let's understand the new schema additions:`,
              ko: `새로운 스키마 추가 사항을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">🍽️</span>
              <div>
                <strong>ServeType</strong>:{" "}
                {l.trans({
                  en: "An enum defining how the customer wants their order - for here, take out, or delivery",
                  ko: "고객이 주문을 어떻게 받길 원하는지 정의하는 열거형 - 매장 식사, 포장, 또는 배달",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">📱</span>
              <div>
                <strong>phone</strong>:{" "}
                {l.trans({
                  en: "Customer's phone number with validation using isPhoneNumber for pickup notifications",
                  ko: "픽업 알림을 위해 isPhoneNumber로 유효성 검사되는 고객 전화번호",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">📋</span>
              <div>
                <strong>LightIcecreamOrder</strong>:{" "}
                {l.trans({
                  en: "Updated to include serveType for display in order lists and dashboards",
                  ko: "주문 목록과 대시보드에서 표시하기 위해 serveType을 포함하도록 업데이트됨",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Next, we need to add dictionary entries for the new fields and enum values:`,
              ko: `다음으로, 새 필드와 열거형 값에 대한 dictionary 항목을 추가해야 합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "@akanjs/dictionary"; // [!code collapse:4]

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
  });`}
          />
          <div>
            {l.trans({
              en: `Next, let's add serveType and phone selection to the order form template.`,
              ko: `다음으로, 직원이 주문을 생성하는 템플릿에서 서빙 타입과 전화번호를 선택할 수 있도록 해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx"
            code={`
"use client"; // [!code collapse:4]
import { Field, Layout } from "@akanjs/ui";
import { cnst, st, usePage } from "@koyo/client";

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
        items={[50, 100, 200].map((size) => ({ label: \`\${size}cc\`, value: size }))}
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
};`}
          />
          <div>
            {l.trans({
              en: `Finally, let's display serveType on the order card to clearly show whether the customer's order is for here or take out, etc.`,
              ko: `마지막으로, 주문 카드에 serveType을 표시해서 고객의 주문이 매장 식사인지 포장 주문인지 등을 명확하게 표시해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { clsx, ModelProps } from "@akanjs/client"; // [!code collapse:7]
import { Model } from "@akanjs/ui";
import { cnst, IcecreamOrder, usePage } from "@koyo/client";

interface CardProps extends ModelProps<"icecreamOrder", cnst.LightIcecreamOrder> {
  showControls?: boolean;
}
export const Card = ({ icecreamOrder, showControls = true }: CardProps) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-pink-100 via-yellow-50 to-pink-200 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-lg font-semibold text-pink-700">
          <span className="inline-block rounded bg-pink-200 px-2 py-1 text-xs font-bold tracking-wider uppercase">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-pink-900">#{icecreamOrder.id.slice(-4)}</span>
          <span // [!code ++:9]
            className={clsx("ml-2 rounded px-2 py-1 text-xs font-semibold uppercase", {
              "bg-pink-300 text-pink-900": icecreamOrder.serveType === "forHere",
              "bg-yellow-300 text-yellow-900": icecreamOrder.serveType === "takeOut",
              "bg-blue-200 text-blue-900": icecreamOrder.serveType === "delivery",
            })}
          >
            {l(\`serveType.\${icecreamOrder.serveType}\`)}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2"> // [!code collapse:16]
          <span className="inline-block rounded bg-yellow-200 px-2 py-1 text-xs font-bold tracking-wider text-yellow-800 uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full px-3 py-1 text-sm font-semibold", {
              "bg-green-100 text-green-700": icecreamOrder.status === "active",
              "bg-blue-100 text-blue-700": icecreamOrder.status === "processing",
              "bg-red-100 text-red-700": icecreamOrder.status === "served",
              "bg-purple-100 text-purple-700": icecreamOrder.status === "finished",
              "bg-gray-100 text-gray-700": icecreamOrder.status === "canceled",
            })}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      {showControls ? ( // [!code collapse:16]
        <div className="bg-base-100/50 flex items-center justify-center gap-2 rounded-xl p-4">
          <Model.ViewWrapper sliceName="icecreamOrder" modelId={icecreamOrder.id}>
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
};`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="kiosk-landing-page" title={l.trans({ en: "Kiosk Landing Page", ko: "키오스크 랜딩 페이지" })}>
        <Docs.Title>{l.trans({ en: "Kiosk Landing Page", ko: "키오스크 랜딩 페이지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The first thing customers see when they approach the kiosk is the landing page. Think of it like the welcome screen at a fast-food restaurant kiosk - it should be inviting, easy to understand, and guide customers to their first choice: "For Here" or "Take Out".`,
              ko: `고객이 키오스크에 다가갈 때 가장 먼저 보는 것이 랜딩 페이지입니다. 패스트푸드 레스토랑 키오스크의 환영 화면처럼 생각해보세요 - 친근하고 이해하기 쉬우며 고객을 첫 번째 선택인 "매장 식사" 또는 "포장 주문"으로 안내해야 합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Let's create an attractive landing page that makes ordering feel like a delightful experience:`,
              ko: `주문하는 것이 즐거운 경험처럼 느껴지도록 매력적인 랜딩 페이지를 만들어봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/app/[lang]/icecreamOrder/page.tsx"
            code={`
import { Link, Load } from "@akanjs/ui";
import { usePage } from "@koyo/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        return await Promise.resolve({} as const);
      }}
      render={() => {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
            <div className="absolute top-6 right-6 flex gap-2">
              <Link.Lang
                lang="en"
                className="rounded-lg bg-white/70 px-4 py-2 font-semibold text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md"
              >
                English
              </Link.Lang>
              <Link.Lang
                lang="ko"
                className="rounded-lg bg-white/70 px-4 py-2 font-semibold text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md"
              >
                한국어
              </Link.Lang>
            </div>
            <div className="w-full max-w-4xl space-y-8 text-center">
              <div className="space-y-4">
                <h1 className="bg-linear-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-7xl font-bold text-transparent duration-1000 md:text-8xl">
                  Koyo
                </h1>
                <p className="text-2xl font-light text-gray-700 delay-150 duration-1000 md:text-3xl">
                  {l.trans({ en: "Korean Yogurt Ice Cream", ko: "한국 요거트 아이스크림" })}
                </p>
                <div className="flex items-center justify-center gap-2 text-lg text-gray-600 delay-300 duration-1000">
                  <span className="text-3xl">🍦</span>
                  <span>{l.trans({ en: "Fresh • Creamy • Delicious", ko: "신선한 • 부드러운 • 맛있는" })}</span>
                  <span className="text-3xl">🍦</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4 pt-8 delay-500 duration-1000 sm:flex-row sm:justify-center">
                <Link
                  href="/icecreamOrder/new?serveType=forHere"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-linear-to-r from-purple-600 via-pink-500 to-blue-500 px-10 py-6 text-2xl font-semibold text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:from-purple-700 hover:via-pink-600 hover:to-blue-600 hover:shadow-purple-500/50 active:scale-95 sm:w-auto"
                >
                  <span className="text-4xl">🍽️</span>
                  {l.trans({ en: "For Here", ko: "매장 식사" })}
                </Link>
                <Link
                  href="/icecreamOrder/new?serveType=takeout"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-linear-to-r from-blue-600 via-indigo-500 to-purple-500 px-10 py-6 text-2xl font-semibold text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:from-blue-700 hover:via-indigo-600 hover:to-purple-600 hover:shadow-blue-500/50 active:scale-95 sm:w-auto"
                >
                  <span className="text-4xl">🛍️</span>
                  {l.trans({ en: "Take Out", ko: "포장 주문" })}
                </Link>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
  `}
          />
          <div>
            {l.trans({
              en: `Let's break down the key features of this landing page:`,
              ko: `이 랜딩 페이지의 주요 기능을 살펴봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🌍</span>
                <strong className="text-blue-800">Link.Lang</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Language switcher buttons allow customers to choose their preferred language. This is essential for kiosks in tourist areas or multicultural neighborhoods.`,
                  ko: `언어 전환 버튼을 통해 고객이 원하는 언어를 선택할 수 있습니다. 이는 관광지나 다문화 지역의 키오스크에 필수적입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🔗</span>
                <strong className="text-green-800">{"Link with Query Params"}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `The "For Here" and "Take Out" buttons pass serveType as a query parameter to the next page. This pre-fills the order form with the customer's choice.`,
                  ko: `"매장 식사"와 "포장 주문" 버튼은 serveType을 쿼리 파라미터로 다음 페이지에 전달합니다. 이를 통해 주문 양식에 고객의 선택이 미리 채워집니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">✨</span>
                <strong className="text-purple-800">{l.trans({ en: "Visual Design", ko: "비주얼 디자인" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Large buttons with emojis make the interface touch-friendly and intuitive. Gradient backgrounds and hover effects create a modern, engaging experience.`,
                  ko: `이모지가 있는 큰 버튼은 인터페이스를 터치하기 쉽고 직관적으로 만듭니다. 그라데이션 배경과 호버 효과가 현대적이고 매력적인 경험을 만들어냅니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `After customers complete their order, they need a confirmation page. Let's create a success page that reassures them:`,
              ko: `고객이 주문을 완료하면 확인 페이지가 필요합니다. 고객을 안심시키는 성공 페이지를 만들어봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/app/[lang]/icecreamOrder/success/page.tsx"
            code={`
import { Link, Load } from "@akanjs/ui";
import { usePage } from "@koyo/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        return await Promise.resolve({} as const);
      }}
      render={() => {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
            <div className="w-full max-w-2xl space-y-8 text-center">
              <div className="flex justify-center">
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-r from-green-400 to-emerald-500 text-7xl shadow-2xl">
                  ✓
                </div>
              </div>
              <div className="space-y-4">
                <h1 className="bg-linear-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-5xl font-bold text-transparent md:text-6xl">
                  {l.trans({ en: "Order Placed!", ko: "주문 완료!" })}
                </h1>
              </div>
              <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-lg text-gray-700">
                    <span className="text-3xl">🎉</span>
                    <span className="font-semibold">
                      {l.trans({ en: "We're preparing your order", ko: "주문을 준비하고 있습니다" })}
                    </span>
                  </div>
                  <p className="text-gray-600">
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
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-linear-to-r from-purple-600 via-pink-500 to-blue-500 px-12 py-6 text-2xl font-semibold text-white shadow-2xl transition-all hover:scale-105 hover:from-purple-700 hover:via-pink-600 hover:to-blue-600 hover:shadow-purple-500/50 active:scale-95"
                >
                  <span className="text-4xl">🏠</span>
                  {l.trans({ en: "Place New Order", ko: "새 주문하기" })}
                </Link>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}`}
          />
          <div>
            {l.trans({
              en: `The success page provides important feedback to customers:`,
              ko: `성공 페이지는 고객에게 중요한 피드백을 제공합니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <div>
                {l.trans({
                  en: "A large checkmark icon gives instant visual confirmation that the order was successful",
                  ko: "큰 체크 아이콘이 주문이 성공했음을 즉시 시각적으로 확인시켜줍니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600">📢</span>
              <div>
                {l.trans({
                  en: "Clear instructions tell customers to wait for their order number to be called",
                  ko: "명확한 안내가 고객에게 주문 번호가 호출될 때까지 기다리라고 알려줍니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">🏠</span>
              <div>
                {l.trans({
                  en: "A 'Place New Order' button allows the next customer to start fresh",
                  ko: "'새 주문하기' 버튼을 통해 다음 고객이 새로 시작할 수 있습니다",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="order-form-page" title={l.trans({ en: "Order Form Page", ko: "주문 양식 페이지" })}>
        <Docs.Title>{l.trans({ en: "Order Form Page", ko: "주문 양식 페이지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The heart of the kiosk is the order form page. This is where customers actually customize their ice cream - choosing size, toppings, and entering their phone number for pickup notifications. Think of this page like the main ordering screen at a bubble tea shop where you select your drink size and add-ons.`,
              ko: `키오스크의 핵심은 주문 양식 페이지입니다. 이곳에서 고객이 실제로 아이스크림을 커스터마이즈합니다 - 사이즈를 선택하고, 토핑을 추가하고, 픽업 알림을 위한 전화번호를 입력합니다. 버블티 가게에서 음료 사이즈와 추가 옵션을 선택하는 메인 주문 화면처럼 생각해보세요.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The page needs to handle query parameters from the landing page and provide an intuitive form experience:`,
              ko: `이 페이지는 랜딩 페이지에서 전달된 쿼리 파라미터를 처리하고 직관적인 폼 경험을 제공해야 합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/app/[lang]/icecreamOrder/new/page.tsx"
            code={`
import { Load } from "@akanjs/ui";
import { cnst, IcecreamOrder, usePage } from "@koyo/client";

interface PageProps {
  searchParams: Promise<{
    serveType?: cnst.ServeType["value"];
  }>;
}
export default function Page({ searchParams }: PageProps) {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { serveType } = await searchParams;
        const icecreamOrderForm: Partial<cnst.IcecreamOrder> = { serveType };
        return await Promise.resolve({ icecreamOrderForm });
      }}
      render={({ icecreamOrderForm }) => (
        <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
          <div className="w-full max-w-2xl space-y-8">
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <span className="text-8xl">🍦</span>
              </div>
              <h1 className="bg-linear-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-5xl font-bold text-transparent md:text-6xl">
                {l("base.createModel", { model: l("icecreamOrder.modelName") })}
              </h1>
              <p className="text-xl font-light text-gray-600">
                {l.trans({ en: "Customize your perfect treat", ko: "나만의 완벽한 디저트를 만들어보세요" })}
              </p>
            </div>
            <Load.Edit
              className="flex flex-col items-center"
              sliceName="icecreamOrderInPublic"
              edit={icecreamOrderForm}
              type="form"
              onCancel="back"
              onSubmit="/icecreamOrder/success"
            >
              <IcecreamOrder.Template.General showServeType={false} />
            </Load.Edit>
          </div>
        </div>
      )}
    />
  );
}`}
          />
          <div>
            {l.trans({
              en: `Let's understand the key components of this order form page:`,
              ko: `이 주문 양식 페이지의 주요 구성 요소를 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🔍</span>
                <strong className="text-blue-800">searchParams</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Next.js provides searchParams as a Promise that contains URL query parameters. We extract the serveType to pre-fill the order form with the customer's choice from the landing page.`,
                  ko: `Next.js는 URL 쿼리 파라미터를 포함하는 Promise로 searchParams를 제공합니다. serveType을 추출하여 랜딩 페이지에서 고객이 선택한 내용으로 주문 양식을 미리 채웁니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">📝</span>
                <strong className="text-green-800">Load.Edit</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `The Load.Edit component handles form state management, validation, and submission. It connects to the slice for data persistence and automatically navigates to the success page on submit.`,
                  ko: `Load.Edit 컴포넌트는 폼 상태 관리, 유효성 검사, 제출을 처리합니다. 데이터 저장을 위해 슬라이스에 연결되고 제출 시 자동으로 성공 페이지로 이동합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">↩️</span>
                <strong className="text-purple-800">{'onCancel="back"'}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Setting onCancel to "back" enables the cancel button to navigate back to the previous page. This provides an easy way for customers to change their mind.`,
                  ko: `onCancel을 "back"으로 설정하면 취소 버튼이 이전 페이지로 돌아갑니다. 이를 통해 고객이 쉽게 마음을 바꿀 수 있습니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Now let's style the Template component for a beautiful kiosk experience. Each section is wrapped in a card with icons:`,
              ko: `이제 아름다운 키오스크 경험을 위해 Template 컴포넌트를 스타일링해봅시다. 각 섹션은 아이콘이 있는 카드로 감싸져 있습니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx"
            code={`
"use client";
import { clsx } from "@akanjs/client"; // [!code ++]
import { Field, Layout } from "@akanjs/ui"; // [!code collapse:8]
import { cnst, st, usePage } from "@koyo/client";

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
        <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🍦</span>
              <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.serveType")}</h2>
            </div>
            <Field.ToggleSelect
              items={cnst.ServeType}
              value={icecreamOrderForm.serveType}
              onChange={st.do.setServeTypeOnIcecreamOrder}
            />
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📏</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.size")}</h2>
          </div>
          <Field.ToggleSelect
            items={[50, 100, 200].map((size) => ({ label: \`\${size}cc\`, value: size }))}
            value={icecreamOrderForm.size}
            onChange={st.do.setSizeOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍓</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.toppings")}</h2>
          </div>
          <Field.MultiToggleSelect
            items={cnst.Topping}
            value={icecreamOrderForm.toppings}
            onChange={st.do.setToppingsOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📱</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.phone")}</h2>
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
};`}
          />
          <div>
            {l.trans({
              en: `The Template component uses these Field components for kiosk-friendly input:`,
              ko: `Template 컴포넌트는 키오스크 친화적인 입력을 위해 다음 Field 컴포넌트들을 사용합니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">📏</span>
              <div>
                <strong>Field.ToggleSelect</strong>:{" "}
                {l.trans({
                  en: "Large, touch-friendly buttons for selecting a single option (size)",
                  ko: "단일 옵션(사이즈) 선택을 위한 크고 터치하기 쉬운 버튼",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-pink-600">🍓</span>
              <div>
                <strong>Field.MultiToggleSelect</strong>:{" "}
                {l.trans({
                  en: "Allows selecting multiple options (toppings) with visual feedback",
                  ko: "시각적 피드백과 함께 여러 옵션(토핑)을 선택할 수 있습니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">📱</span>
              <div>
                <strong>Field.Phone</strong>:{" "}
                {l.trans({
                  en: "Phone number input with formatting and validation built-in",
                  ko: "형식 지정과 유효성 검사가 내장된 전화번호 입력",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="page-best-practices"
        title={l.trans({ en: "Page UX Best Practices", ko: "페이지 UX 모범 사례" })}
      >
        <Docs.Title>{l.trans({ en: "Page UX Best Practices", ko: "페이지 UX 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `When building customer-facing pages like kiosks, following UX best practices ensures a smooth and enjoyable experience. Here are the key principles we applied:`,
              ko: `키오스크와 같은 고객용 페이지를 구축할 때 UX 모범 사례를 따르면 부드럽고 즐거운 경험을 보장할 수 있습니다. 우리가 적용한 핵심 원칙들입니다:`,
            })}
          </div>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Clear Navigation Flow", ko: "명확한 네비게이션 흐름" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Guide customers through a linear flow: Landing → Order Form → Success. Each step has one clear purpose, reducing confusion.`,
                  ko: `고객을 선형 흐름으로 안내합니다: 랜딩 → 주문 양식 → 성공. 각 단계는 하나의 명확한 목적을 가져 혼란을 줄입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Touch-Friendly Design", ko: "터치 친화적 디자인" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `Large buttons (py-6), adequate spacing, and visual feedback on interaction make the interface easy to use on touchscreens.`,
                  ko: `큰 버튼(py-6), 적절한 간격, 상호작용 시 시각적 피드백이 터치스크린에서 인터페이스를 사용하기 쉽게 만듭니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Visual Hierarchy with Icons", ko: "아이콘을 통한 시각적 계층" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Emojis and icons provide instant visual cues that help customers understand each section without reading text carefully.`,
                  ko: `이모지와 아이콘은 고객이 텍스트를 자세히 읽지 않고도 각 섹션을 이해할 수 있도록 즉각적인 시각적 단서를 제공합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">{l.trans({ en: "State Preservation", ko: "상태 보존" })}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: `Using query parameters and Load.Edit ensures customer choices are preserved between pages, creating a seamless experience.`,
                  ko: `쿼리 파라미터와 Load.Edit를 사용하면 고객의 선택이 페이지 간에 보존되어 끊김 없는 경험을 만들어냅니다.`,
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-pink-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Extended schema with new fields for kiosk ordering",
                  ko: "키오스크 주문을 위한 새 필드로 스키마 확장",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Built an attractive landing page with language switching",
                  ko: "언어 전환 기능이 있는 매력적인 랜딩 페이지 구축",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created a touch-friendly order form with Field components",
                  ko: "Field 컴포넌트로 터치 친화적인 주문 양식 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Implemented success page with clear customer feedback",
                  ko: "명확한 고객 피드백이 있는 성공 페이지 구현",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Learned page UX best practices for kiosk applications",
                  ko: "키오스크 애플리케이션을 위한 페이지 UX 모범 사례 학습",
                })}
              </li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll explore how to use Scalar for computed values and aggregations. This will allow you to display dynamic information like order totals, wait times, and statistics in real-time.`,
              ko: `다음 튜토리얼에서는 계산된 값과 집계를 위한 Scalar 사용법을 살펴볼 것입니다. 이를 통해 주문 합계, 대기 시간, 통계와 같은 동적 정보를 실시간으로 표시할 수 있게 됩니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
