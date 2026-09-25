import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="delivery-feature" title={l.trans({ en: "Delivery Feature", ko: "배달 기능 추가하기" })}>
        <Docs.Title>{l.trans({ en: "Delivery Feature", ko: "배달 기능 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The ice cream shop is so successful that delivery orders are flooding in! Now we need to manage delivery orders. A delivery driver can deliver multiple orders at once, which means we need to create a relationship between deliveries and orders. This is a classic one-to-many relationship - one Delivery contains many IcecreamOrders.`,
              ko: `아이스크림 가게가 너무 성황이라 배달 주문이 쏟아지고 있습니다! 이제 배달 주문을 관리해야 합니다. 배달 기사는 한 번에 여러 주문을 배달할 수 있으므로, 배달과 주문 간의 관계를 만들어야 합니다. 이것은 전형적인 일대다 관계입니다 - 하나의 Delivery가 여러 IcecreamOrder를 포함합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `In this tutorial, you'll learn how to:`,
              ko: `이 튜토리얼에서 배울 내용:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">🔗</span>
              <div>
                {l.trans({
                  en: "Define relationships between models using embedded references",
                  ko: "임베디드 참조를 사용하여 모델 간 관계 정의",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">⚡</span>
              <div>
                {l.trans({
                  en: "Trigger side effects when related data is created",
                  ko: "관계된 데이터 생성 시 부수 효과 트리거",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">🎨</span>
              <div>
                {l.trans({
                  en: "Build UI components for selecting and displaying related data",
                  ko: "관계된 데이터를 선택하고 표시하는 UI 컴포넌트 구축",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="create-delivery-module"
        title={l.trans({ en: "Create Delivery Module", ko: "배달 모듈 생성하기" })}
      >
        <Docs.Title>{l.trans({ en: "Create Delivery Module", ko: "배달 모듈 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `First, let's create the Delivery module using the CLI. This module will connect multiple ice cream orders into a single delivery batch.`,
              ko: `먼저 CLI를 사용하여 Delivery 모듈을 생성합니다. 이 모듈은 여러 아이스크림 주문을 하나의 배달 묶음으로 연결합니다.`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            title="Terminal"
            code={`
akan create-module delivery
# then select koyo application`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="define-relationship" title={l.trans({ en: "Define Relationship", ko: "관계 정의하기" })}>
        <Docs.Title>{l.trans({ en: "Define Relationship", ko: "관계 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's define the Delivery model with a relationship to IcecreamOrder. The key is using LightIcecreamOrder as the field type - this creates an embedded reference that stores the essential order data directly in the delivery document.`,
              ko: `이제 IcecreamOrder와의 관계를 가진 Delivery 모델을 정의합니다. 핵심은 LightIcecreamOrder를 필드 타입으로 사용하는 것입니다 - 이것은 필수 주문 데이터를 배달 문서에 직접 저장하는 임베디드 참조를 생성합니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/delivery.constant.ts"
            code={`
import { via } from "@akanjs/constant";

import { LightIcecreamOrder } from "../icecreamOrder/icecreamOrder.constant"; // [!code highlight]

export class DeliveryInput extends via((field) => ({
  icecreamOrders: field([LightIcecreamOrder], { minlength: 1 }), // [!code highlight]
})) {}

export class DeliveryObject extends via(DeliveryInput, (field) => ({})) {}

export class LightDelivery extends via(DeliveryObject, ["icecreamOrders"] as const, (resolve) => ({})) {} // [!code highlight]
// [!code collapse:4]
export class Delivery extends via(DeliveryObject, LightDelivery, (resolve) => ({})) {}

export class DeliveryInsight extends via(Delivery, (field) => ({})) {}`}
          />
          <div>
            {l.trans({
              en: `Let's understand the key relationship pattern:`,
              ko: `핵심 관계 패턴을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🔗</span>
                <strong className="text-blue-800">{"field([LightIcecreamOrder], { minlength: 1 })"}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `This defines a one-to-many relationship by embedding an array of LightIcecreamOrder. The "Light" version contains only essential fields (serveType, size, toppings, status) - perfect for embedding without duplicating entire documents.`,
                  ko: `LightIcecreamOrder 배열을 임베딩하여 일대다 관계를 정의합니다. "Light" 버전은 필수 필드만 포함합니다 (serveType, size, toppings, status) - 전체 문서를 복제하지 않고 임베딩하기에 완벽합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">📦</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Embedded vs Referenced", ko: "임베디드 vs 참조" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `By embedding LightIcecreamOrder, the delivery document contains all necessary order info without additional database queries. This is ideal for data that's read together frequently.`,
                  ko: `LightIcecreamOrder를 임베딩함으로써, 배달 문서는 추가 데이터베이스 쿼리 없이 모든 필요한 주문 정보를 포함합니다. 이것은 함께 자주 읽히는 데이터에 이상적입니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add dictionary entries for the Delivery model:`,
              ko: `Delivery 모델에 대한 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/delivery.dictionary.ts"
            code={`
import { modelDictionary } from "@akanjs/dictionary"; // [!code collapse:5]

import type { Delivery, DeliveryInsight } from "./delivery.constant";
import type { DeliveryEndpoint, DeliverySlice } from "./delivery.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Delivery", "배달"]).desc([ // [!code highlight:4]
      "Delivery is an option that allows you to deliver multiple icecream orders at once.",
      "아이스크림 주문을 배달처리하는 옵션으로, 여러 주문을 한번에 배달처리할 수 있습니다.",
    ])
  )
  .model<Delivery>((t) => ({
    icecreamOrders: t(["Icecream Orders", "아이스크림 주문"]).desc([ // [!code highlight:4]
      "Icecream orders of the delivery",
      "아이스크림 주문들",
    ]),
  }))
  .insight<DeliveryInsight>((t) => ({})) // [!code collapse:5]
  .slice<DeliverySlice>((fn) => ({
    inPublic: fn(["Delivery In Public", "Delivery 공개"]).arg((t) => ({})),
  }))
  .endpoint<DeliveryEndpoint>((fn) => ({}))
  .error({
    cannotUpdateDelivery: ["Cannot update a delivery", "배달을 수정할 수 없습니다."], // [!code highlight]
  })
  .translate({});`}
          />
          <div>
            {l.trans({
              en: `Now let's implement the service layer with lifecycle hooks. When a delivery is created, all associated orders should be marked as finished:`,
              ko: `이제 라이프사이클 훅이 있는 서비스 레이어를 구현합니다. 배달이 생성되면 모든 연관된 주문을 완료 처리해야 합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/delivery.service.ts"
            code={`
import { serve } from "@akanjs/service";

import * as db from "../db";
import { Revert } from "../dict"; // [!code highlight:2]
import type * as srv from "../srv";

export class DeliveryService extends serve(db.delivery, ({ use, service }) => ({
  icecreamOrderService: service<srv.IcecreamOrderService>(), // [!code highlight]
})) {
  _preUpdate(id: string, data: db.DeliveryInput): never { // [!code highlight:8]
    throw new Revert("delivery.error.cannotUpdateDelivery");
  }
  async _postCreate(delivery: db.Delivery) {
    for (const icecreamOrderId of delivery.icecreamOrders)
      await this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    return delivery;
  }
}`}
          />
          <div>
            {l.trans({
              en: `Key service patterns for related data:`,
              ko: `관계 데이터를 위한 주요 서비스 패턴:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">🔌</span>
                <strong className="text-purple-800">{"service<srv.IcecreamOrderService>()"}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Injects the IcecreamOrderService so DeliveryService can interact with orders. This enables cross-model operations.`,
                  ko: `IcecreamOrderService를 주입하여 DeliveryService가 주문과 상호작용할 수 있게 합니다. 이를 통해 모델 간 작업이 가능해집니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚡</span>
                <strong className="text-yellow-800">_postCreate</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: `A lifecycle hook that runs after a delivery is created. It iterates through all linked orders and marks them as finished - perfect for cascading updates.`,
                  ko: `배달이 생성된 후 실행되는 라이프사이클 훅입니다. 모든 연결된 주문을 순회하며 완료 처리합니다 - 연쇄 업데이트에 완벽합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-red-600">🚫</span>
                <strong className="text-red-800">_preUpdate</strong>
              </div>
              <div className="text-red-700 text-sm">
                {l.trans({
                  en: `Prevents updates to deliveries by throwing a Revert error. Once a delivery is created, it becomes immutable - ensuring data integrity.`,
                  ko: `Revert 오류를 발생시켜 배달 수정을 방지합니다. 배달이 생성되면 불변이 됩니다 - 데이터 무결성을 보장합니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Now let's create the Template component for selecting related orders. The Field.Children component is designed specifically for selecting related data:`,
              ko: `이제 관련 주문을 선택하기 위한 Template 컴포넌트를 만듭니다. Field.Children 컴포넌트는 관계 데이터 선택을 위해 특별히 설계되었습니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/Delivery.Template.tsx"
            code={`
"use client";
import { Field, Layout } from "@akanjs/ui";
import { cnst, st, usePage } from "@koyo/client";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const deliveryForm = st.use.deliveryForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Children // [!code highlight:11]
        label={l("delivery.icecreamOrders")}
        desc={l("delivery.icecreamOrders.desc")}
        sliceName="icecreamOrderInDelivery"
        initArgs={["served"]}
        value={deliveryForm.icecreamOrders}
        onChange={st.do.setIcecreamOrdersOnDelivery}
        renderOption={(icecreamOrder: cnst.LightIcecreamOrder) => (
          <div key={icecreamOrder.id}>#{icecreamOrder.id.slice(-4)}</div>
        )}
      />
    </Layout.Template>
  );
};`}
          />
          <div>
            {l.trans({
              en: `Key features of Field.Children:`,
              ko: `Field.Children의 주요 기능:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">📋</span>
              <div>
                <strong>sliceName</strong>:{" "}
                {l.trans({
                  en: "Specifies which slice provides the selectable options. Here it's 'icecreamOrderInDelivery' - a slice filtered for delivery-eligible orders.",
                  ko: "선택 가능한 옵션을 제공하는 슬라이스를 지정합니다. 여기서는 배달 가능한 주문으로 필터링된 'icecreamOrderInDelivery'입니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">🎯</span>
              <div>
                <strong>initArgs</strong>:{" "}
                {l.trans({
                  en: 'Initial arguments passed to the slice query. ["served"] filters to only show orders ready for delivery.',
                  ko: '슬라이스 쿼리에 전달되는 초기 인자입니다. ["served"]는 배달 준비가 된 주문만 표시하도록 필터링합니다.',
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">🎨</span>
              <div>
                <strong>renderOption</strong>:{" "}
                {l.trans({
                  en: "Custom render function for each selectable option. Shows order ID for easy identification.",
                  ko: "선택 가능한 각 옵션에 대한 커스텀 렌더 함수입니다. 쉬운 식별을 위해 주문 ID를 표시합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add a new slice to IcecreamOrder specifically for the delivery selection UI. This filters orders by status and serve type:`,
              ko: `배달 선택 UI를 위해 IcecreamOrder에 새 슬라이스를 추가합니다. 이것은 상태와 서빙 타입으로 주문을 필터링합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
            code={`
import { ID } from "@akanjs/base"; // [!code collapse:13]
import { Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";

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
    inPublic: init() // [!code collapse:11]
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
    inDelivery: init() // [!code ++:5]
      .search("statuses", [cnst.IcecreamOrderStatus])
      .exec(function (statuses) {
        return this.icecreamOrderService.queryByStatuses(statuses, "delivery");
      }),
  })
) {}
// [!code collapse:50]
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
              en: `Add arguments to support serveType filtering in the byStatuses query declaration in the document.`,
              ko: `도큐먼트의 byStatuses 쿼리 선언에서 serveType 필터링을 지원하기 위해 인자를 추가해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts"
            code={`
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document"; // [!code collapse:5]

import * as cnst from "../cnst";
import { Revert } from "../dict";

export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.IcecreamOrderStatus])
      .opt("serveType", cnst.ServeType) // [!code ++]
      .query((statuses, serveType) => ({ // [!code ++]
        ...(statuses?.length ? { status: { $in: statuses } } : {}),
        ...(serveType ? { serveType } : {}), // [!code ++]
      })),
  },
  sort: {},
})) {}
// [!code collapse:100]
export class IcecreamOrder extends by(cnst.IcecreamOrder) {
  process() {
    if (this.status !== "active") throw new Revert("icecreamOrder.error.onlyActiveCanBeProcessed");
    this.status = "processing";
    return this;
  }
  serve() {
    if (this.status !== "processing") throw new Revert("icecreamOrder.error.onlyProcessingCanBeServed");
    this.status = "served";
    return this;
  }
  finish() {
    if (this.status !== "served") throw new Revert("icecreamOrder.error.onlyServedCanBeFinished");
    this.status = "finished";
    return this;
  }
  cancel() {
    if (this.status !== "active") throw new Revert("icecreamOrder.error.onlyActiveCanBeCanceled");
    this.status = "canceled";
    return this;
  }
}
export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}

export class IcecreamOrderMiddleware extends beyond(IcecreamOrderModel, IcecreamOrder) {
  onSchema(schema: SchemaOf<IcecreamOrderModel, IcecreamOrder>) {
    // schema.index({ field: 1 })
  }
}`}
          />
          <div>
            {l.trans({
              en: `Add dictionary entries for the new slice:`,
              ko: `새 슬라이스에 대한 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "@akanjs/dictionary"; // [!code collapse:11]

import type {
  IcecreamOrder,
  IcecreamOrderInsight,
  IcecreamOrderStatus,
  ServeType,
  Topping,
} from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:54]
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
    figQty: t(["Fig Qty", "피그 수량"]).desc(["Fig quantity", "피그 수량"]),
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
  .endpoint<IcecreamOrderEndpoint>((fn) => ({ // [!code collapse:100]
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
              en: `Now let's create the Unit component to display deliveries with their related orders. This shows how embedded data can be rendered together:`,
              ko: `이제 관련 주문과 함께 배달을 표시하는 Unit 컴포넌트를 만듭니다. 이것은 임베디드 데이터가 어떻게 함께 렌더링될 수 있는지 보여줍니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/Delivery.Unit.tsx"
            code={`
import { ModelProps } from "@akanjs/client"; // [!code collapse:3]
import { cnst, usePage } from "@koyo/client";
import { Link } from "@akanjs/ui";
import { IcecreamOrder } from "@koyo/client"; // [!code ++]

export const Card = ({ delivery, href }: ModelProps<"delivery", cnst.LightDelivery>) => {
  const { l } = usePage();
  return (
    <Link href={href} className="bg-base-300 w-full rounded border p-4"> // [!code highlight:10]
      <div className="mb-3 text-lg font-bold">
        {l("delivery.modelName")} #{delivery.id.slice(-4)}
      </div>
      <div className="flex w-full flex-col gap-2">
        {delivery.icecreamOrders.map((icecreamOrder) => (
          <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} showControls={false} />
        ))}
      </div>
    </Link>
  );
};`}
          />
          <div>
            {l.trans({
              en: `Notice how we iterate through delivery.icecreamOrders and render each one using the IcecreamOrder.Unit.Card component. The embedded data is immediately available without additional queries!`,
              ko: `delivery.icecreamOrders를 순회하며 각각을 IcecreamOrder.Unit.Card 컴포넌트로 렌더링하는 방식에 주목하세요. 임베디드 데이터는 추가 쿼리 없이 즉시 사용 가능합니다!`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Create the Zone component with a modal for creating new deliveries:`,
              ko: `새 배달 생성을 위한 모달이 있는 Zone 컴포넌트를 만듭니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/delivery/Delivery.Zone.tsx"
            code={`
"use client"; // [!code collapse:4]
import { Load } from "@akanjs/ui";
import { cnst, Delivery } from "@koyo/client";
import { ClientInit, ClientView } from "@akanjs/signal";
import { st, usePage } from "@koyo/client"; // [!code ++:2]
import { Model } from "@akanjs/ui";
// [!code collapse:25]
interface CardProps {
  className?: string;
  init: ClientInit<"delivery", cnst.LightDelivery>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(delivery: cnst.LightDelivery) => (
        <Delivery.Unit.Card key={delivery.id} delivery={delivery} />
      )}
    />
  );
};

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
        className="btn btn-primary"
        onClick={() => {
          st.do.newDelivery();
        }}
      >
        + {l("base.createModel", { model: l("delivery.modelName") })}
      </button>
      <Model.EditModal
        sliceName="deliveryInPublic"
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
};`}
          />
          <div>
            {l.trans({
              en: `The submitOption.onSuccess callback updates the local state with the finished orders, keeping the UI in sync with the database changes.`,
              ko: `submitOption.onSuccess 콜백은 완료된 주문으로 로컬 상태를 업데이트하여, UI를 데이터베이스 변경과 동기화 상태로 유지합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Finally, let's integrate everything into the main page using Tab components to organize orders and deliveries:`,
              ko: `마지막으로, Tab 컴포넌트를 사용하여 주문과 배달을 정리하고 메인 페이지에 모든 것을 통합합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/app/[lang]/page.tsx"
            code={`
import { Load, Model } from "@akanjs/ui"; // [!code collapse:2]
import { cnst, fetch, IcecreamOrder, Inventory, usePage } from "@koyo/client";
import { Tab } from "@akanjs/ui"; // [!code ++:2]
import { Delivery } from "@koyo/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const [{ icecreamOrderInitInPublic }, { deliveryInitInPublic }] = await Promise.all([ // [!code highlight:6]
          fetch.initIcecreamOrderInPublic(),
          fetch.initDeliveryInPublic(),
        ]);
        const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
        return { icecreamOrderInitInPublic, deliveryInitInPublic, icecreamOrderForm };
      }}
      render={({ icecreamOrderInitInPublic, deliveryInitInPublic, icecreamOrderForm }) => { // [!code highlight]
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-5xl font-black">
              <div className="text-5xl font-black">{l("inventory.modelName")}</div>
              <Inventory.Util.Refill className="absolute top-2 right-2" />
            </div>
            <Inventory.Zone.Today />
            <Tab defaultMenu="icecreamOrder"> // [!code highlight:33]
              <Tab.Menus className="flex items-center">
                <Tab.Menu menu="icecreamOrder" className="btn btn-xl" activeClassName="btn-primary">
                  {l("icecreamOrder.modelName")}
                </Tab.Menu>
                <Tab.Menu menu="delivery" className="btn btn-xl" activeClassName="btn-primary">
                  {l("delivery.modelName")}
                </Tab.Menu>
              </Tab.Menus>
              <Tab.Panel menu="icecreamOrder" className="p-2">
                <div className="flex items-center gap-4 font-black">
                  <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div>
                  <IcecreamOrder.Util.PublicQueryMaker />
                  <Model.New
                    className="btn btn-primary"
                    sliceName="icecreamOrderInPublic"
                    renderTitle="name"
                    partial={icecreamOrderForm}
                  >
                    <IcecreamOrder.Template.General />
                  </Model.New>
                </div>
                <IcecreamOrder.Zone.Insight sliceName="icecreamOrderInPublic" />
                <IcecreamOrder.Zone.Card className="space-y-2" init={icecreamOrderInitInPublic} />
              </Tab.Panel>
              <Tab.Panel menu="delivery" className="p-2">
                <div className="flex items-center gap-4 font-black">
                  <div className="text-5xl font-bold">{l("delivery.modelName")}</div>
                  <Delivery.Zone.New />
                </div>
                <Delivery.Zone.Card className="space-y-2" init={deliveryInitInPublic} />
              </Tab.Panel>
            </Tab>
          </div>
        );
      }}
    />
  );
}`}
          />
          <div>
            {l.trans({
              en: `Key features of this integrated page:`,
              ko: `이 통합된 페이지의 주요 기능:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">📑</span>
              <div>
                <strong>Tab</strong>:{" "}
                {l.trans({
                  en: "Organizes related content into switchable panels. Users can easily navigate between orders and deliveries.",
                  ko: "관련 콘텐츠를 전환 가능한 패널로 정리합니다. 사용자가 주문과 배달 사이를 쉽게 탐색할 수 있습니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">⚡</span>
              <div>
                <strong>Promise.all</strong>:{" "}
                {l.trans({
                  en: "Loads both icecreamOrder and delivery data in parallel for optimal performance.",
                  ko: "최적의 성능을 위해 icecreamOrder와 delivery 데이터를 병렬로 로드합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="summary" title={l.trans({ en: "Summary", ko: "요약" })}>
        <Docs.Title>{l.trans({ en: "Summary", ko: "요약" })}</Docs.Title>
        <Docs.Description>
          <div className="my-6 rounded-lg bg-gradient-to-r from-green-100 to-blue-100 p-6">
            <div className="mb-3 font-bold text-green-800 text-lg">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-green-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created a Delivery module with one-to-many relationship to IcecreamOrder",
                  ko: "IcecreamOrder와 일대다 관계를 가진 Delivery 모듈 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Used LightModel pattern for efficient embedded references",
                  ko: "효율적인 임베디드 참조를 위한 LightModel 패턴 사용",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Implemented _postCreate hook for cascading updates across related data",
                  ko: "관계된 데이터 간 연쇄 업데이트를 위한 _postCreate 훅 구현",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Built Field.Children component for selecting related records",
                  ko: "관련 레코드 선택을 위한 Field.Children 컴포넌트 구축",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Displayed embedded related data without additional queries",
                  ko: "추가 쿼리 없이 임베디드 관계 데이터 표시",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Organized multiple models with Tab navigation",
                  ko: "Tab 네비게이션으로 여러 모델 정리",
                })}
              </li>
            </ul>
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">💡</span>
                <strong className="text-blue-800">{l.trans({ en: "Best Practices", ko: "모범 사례" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    {l.trans({
                      en: "Use LightModel for embedded data to avoid document bloat",
                      ko: "문서 비대화를 피하기 위해 임베디드 데이터에 LightModel 사용",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Embed data that's frequently read together",
                      ko: "자주 함께 읽히는 데이터를 임베딩",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Use lifecycle hooks for maintaining data consistency",
                      ko: "데이터 일관성 유지를 위해 라이프사이클 훅 사용",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Create dedicated slices for relationship selection UIs",
                      ko: "관계 선택 UI를 위한 전용 슬라이스 생성",
                    })}
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Congratulations! You've completed all the core tutorials. You now have a solid foundation for building complex applications with akanjs. Explore the System Architecture section to dive deeper into how everything works together.`,
              ko: `축하합니다! 모든 핵심 튜토리얼을 완료했습니다. 이제 akanjs로 복잡한 애플리케이션을 구축하기 위한 탄탄한 기반을 갖추게 되었습니다. System Architecture 섹션을 탐색하여 모든 것이 어떻게 함께 작동하는지 더 깊이 알아보세요.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
