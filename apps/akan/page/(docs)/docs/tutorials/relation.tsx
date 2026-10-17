import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "튜토리얼: 데이터 연결하기 | Akan.js" : "Tutorials: Relate Data | Akan.js";
    const description =
      lang === "ko"
        ? "배달과 주문을 잇고 일대다 관계를 스키마에서 화면까지 따라갑니다."
        : "Relate deliveries to orders and walk a one-to-many relation from schema to screen.";
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
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Define relationships between models with Light model references",
                  ko: "Light 모델 참조로 모델 간 관계 정의",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Trigger side effects when related data is created",
                  ko: "관계된 데이터 생성 시 부수 효과 트리거",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Build UI components for selecting and displaying related data",
                  ko: "관계된 데이터를 선택하고 표시하는 UI 컴포넌트 구축",
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
              className="w-full"
              language="bash"
              title="Terminal"
              code={`
akan create-module delivery
# then select koyo application`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="define-relationship" title={l.trans({ en: "Define Relationship", ko: "관계 정의하기" })}>
          <Docs.Title>{l.trans({ en: "Define Relationship", ko: "관계 정의하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: `Now let's define the Delivery model with a relationship to IcecreamOrder. The key is using LightIcecreamOrder as the field type - the delivery stores each order's id, and reading a delivery hands the orders back as LightIcecreamOrder.`,
                ko: `이제 IcecreamOrder와의 관계를 가진 Delivery 모델을 정의합니다. 핵심은 LightIcecreamOrder를 필드 타입으로 사용하는 것입니다 - 배달에는 각 주문의 id가 저장되고, 배달을 읽으면 주문이 LightIcecreamOrder로 돌아옵니다.`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/delivery.constant.ts"
              code={`
import { via } from "akanjs/constant";

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
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{"field([LightIcecreamOrder], { minlength: 1 })"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `This defines a one-to-many relationship as an array of order references. The "Light" version carries only the fields a list shows (serveType, size, toppings, status), so a delivery loads its orders without their full documents.`,
                    ko: `주문 참조의 배열로 일대다 관계를 정의합니다. "Light" 버전은 목록에 보여줄 필드만 담으므로 (serveType, size, toppings, status), 배달은 주문 전체 문서 없이 주문을 불러옵니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{l.trans({ en: "Stored as ids", ko: "id로 저장" })}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `The delivery document keeps only the order ids, and the orders are loaded whenever a delivery is read. A delivery therefore always shows each order's current status, never a copy taken when it was created.`,
                    ko: `배달 문서에는 주문 id만 남고, 주문은 배달을 읽을 때마다 불러옵니다. 그래서 배달은 생성 시점의 사본이 아니라 각 주문의 현재 상태를 항상 보여줍니다.`,
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
              className="w-full"
              title="apps/koyo/lib/delivery/delivery.dictionary.ts"
              code={`
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
  .translate({});`}
            />
            <div>
              {l.trans({
                en: `Now let's implement the service layer with lifecycle hooks. When a delivery is created, all associated orders should be marked as finished:`,
                ko: `이제 라이프사이클 훅이 있는 서비스 레이어를 구현합니다. 배달이 생성되면 모든 연관된 주문을 완료 처리해야 합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/delivery.service.ts"
              code={`
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
}`}
            />
            <div>
              {l.trans({
                en: `Key service patterns for related data:`,
                ko: `관계 데이터를 위한 주요 서비스 패턴:`,
              })}
            </div>
            <div className="my-4 space-y-3">
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">{"service<srv.IcecreamOrderService>()"}</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Injects the IcecreamOrderService so DeliveryService can interact with orders. This enables cross-model operations.`,
                    ko: `IcecreamOrderService를 주입하여 DeliveryService가 주문과 상호작용할 수 있게 합니다. 이를 통해 모델 간 작업이 가능해집니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">_postCreate</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `A lifecycle hook that runs after a delivery is created. It iterates through all linked orders and marks them as finished, which keeps cascading updates consistent.`,
                    ko: `배달이 생성된 후 실행되는 라이프사이클 훅입니다. 모든 연결된 주문을 순회하며 완료 처리합니다. 연쇄 업데이트를 처리합니다.`,
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-2">
                  <strong className="text-primary">_preUpdate</strong>
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: `Prevents updates to deliveries by throwing an Err. Once a delivery is created, it becomes immutable - ensuring data integrity.`,
                    ko: `Err 오류를 발생시켜 배달 수정을 방지합니다. 배달이 생성되면 불변이 됩니다 - 데이터 무결성을 보장합니다.`,
                  })}
                </div>
              </div>
            </div>
            <div>
              {l.trans({
                en: `The generated slice reads "cru: None", so nobody can create a delivery yet. Open creation the way the practice tutorial did for orders. Updates stay closed, and _preUpdate refuses them on the server too:`,
                ko: `생성된 슬라이스에는 "cru: None"이 적혀 있어 아직 아무도 배달을 생성할 수 없습니다. 실습 튜토리얼에서 주문에 했던 것처럼 생성을 열어줍니다. 수정은 계속 닫혀 있고, 서버에서도 _preUpdate가 거부합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/delivery.signal.ts"
              code={`
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

export class DeliveryEndpoint extends endpoint(srv.delivery, ({ query, mutation }) => ({})) {}`}
            />
            <div>
              {l.trans({
                en: `Now let's create the Template component for selecting related orders. The Field.Children component is designed specifically for selecting related data:`,
                ko: `이제 관련 주문을 선택하기 위한 Template 컴포넌트를 만듭니다. Field.Children 컴포넌트는 관계 데이터 선택을 위해 특별히 설계되었습니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/Delivery.Template.tsx"
              code={`
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
};`}
            />
            <div>
              {l.trans({
                en: `Key features of Field.Children:`,
                ko: `Field.Children의 주요 기능:`,
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                <strong>slice</strong>:{" "}
                {l.trans({
                  en: "Specifies which slice provides the selectable options. Here it's 'icecreamOrderInDelivery' - a slice filtered for delivery-eligible orders.",
                  ko: "선택 가능한 옵션을 제공하는 슬라이스를 지정합니다. 여기서는 배달 가능한 주문으로 필터링된 'icecreamOrderInDelivery'입니다.",
                })}
              </li>
              <li>
                <strong>initArgs</strong>:{" "}
                {l.trans({
                  en: 'Arguments passed to the slice, one entry per argument. [["served"]] sets statuses to ["served"], so only orders ready to go out are listed.',
                  ko: '슬라이스에 전달되는 인자로, 인자마다 항목 하나입니다. [["served"]]는 statuses를 ["served"]로 지정하므로 출발 준비가 된 주문만 표시됩니다.',
                })}
              </li>
              <li>
                <strong>renderOption</strong>:{" "}
                {l.trans({
                  en: "Custom render function for each selectable option. Shows order ID for easy identification.",
                  ko: "선택 가능한 각 옵션에 대한 커스텀 렌더 함수입니다. 쉬운 식별을 위해 주문 ID를 표시합니다.",
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: `Add a new slice to IcecreamOrder specifically for the delivery selection UI. This filters orders by status and serve type:`,
                ko: `배달 선택 UI를 위해 IcecreamOrder에 새 슬라이스를 추가합니다. 이것은 상태와 서빙 타입으로 주문을 필터링합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`
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
})) {}`}
            />
            <div>
              {l.trans({
                en: `Add arguments to support serveType filtering in the byStatuses query declaration in the document.`,
                ko: `도큐먼트의 byStatuses 쿼리 선언에서 serveType 필터링을 지원하기 위해 인자를 추가해봅시다.`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts"
              code={`
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
`}
            />
            <div>
              {l.trans({
                en: `Add dictionary entries for the new slice:`,
                ko: `새 슬라이스에 대한 dictionary 항목을 추가합니다:`,
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
  });`}
            />
            <div>
              {l.trans({
                en: `Now let's create the Unit component to display deliveries with their related orders:`,
                ko: `이제 관련 주문과 함께 배달을 표시하는 Unit 컴포넌트를 만듭니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/Delivery.Unit.tsx"
              code={`
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
};`}
            />
            <div>
              {l.trans({
                en: `Notice how we iterate through delivery.icecreamOrders and render each one using the IcecreamOrder.Unit.Card component. The orders arrive loaded with the delivery, so the Unit runs no query of its own.`,
                ko: `delivery.icecreamOrders를 순회하며 각각을 IcecreamOrder.Unit.Card 컴포넌트로 렌더링하는 방식에 주목하세요. 주문은 배달과 함께 불러와지므로 Unit이 따로 쿼리할 필요가 없습니다.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `Delivery.View still renders the name field the CLI generated, which no longer exists. Render the orders there the same way:`,
                ko: `Delivery.View는 CLI가 생성한 name 필드를 아직 렌더링하는데, 이 필드는 이제 없습니다. 이곳에서도 같은 방식으로 주문을 렌더링합니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/Delivery.View.tsx"
              code={`
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
};`}
            />
            <div>
              {l.trans({
                en: `Create the Zone component with a modal for creating new deliveries:`,
                ko: `새 배달 생성을 위한 모달이 있는 Zone 컴포넌트를 만듭니다:`,
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/delivery/Delivery.Zone.tsx"
              code={`
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
        <Delivery.Unit.Card key={delivery.id} href={\`/delivery/\${delivery.id}\`} delivery={delivery} />
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

interface NewProps { // [!code ++:32]
  className?: string;
}
export const New = ({ className }: NewProps) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <button
        type="button"
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
              className="w-full"
              title="apps/koyo/page/_index.tsx"
              code={`
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
              trigger={<button type="button" className={buttonRecipe({ variant: "primary" })}>{l("base.new")}</button>}
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
});`}
            />
            <div>
              {l.trans({
                en: `Key features of this integrated page:`,
                ko: `이 통합된 페이지의 주요 기능:`,
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                <strong>Tab</strong>:{" "}
                {l.trans({
                  en: "Organizes related content into switchable panels. Tab.Menu styles the active and inactive tabs itself, and activeClassName adds to the active one only.",
                  ko: "관련 콘텐츠를 전환 가능한 패널로 정리합니다. Tab.Menu가 활성·비활성 탭 스타일을 직접 입히고, activeClassName은 활성 탭에만 더해집니다.",
                })}
              </li>
              <li>
                <strong>{"fetch.init*() without await"}</strong>:{" "}
                {l.trans({
                  en: "Both slice queries leave at call time and each Tab.Panel gets its own promise, so the two tabs load in parallel and neither waits for the other.",
                  ko: "두 슬라이스 쿼리는 호출 시점에 출발하고 각 Tab.Panel이 자기 promise를 받으므로, 두 탭이 병렬로 로드되며 서로를 기다리지 않습니다.",
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="summary" title={l.trans({ en: "Summary", ko: "요약" })}>
          <Docs.Title>{l.trans({ en: "Summary", ko: "요약" })}</Docs.Title>
          <Docs.Description>
            <div className="text-foreground/70 text-sm">
              <ul className="list-inside list-disc space-y-1">
                <li>
                  {l.trans({
                    en: "Reference another model through its Light class to load only the fields you show",
                    ko: "Light 클래스로 다른 모델을 참조해 보여줄 필드만 불러오기",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "A relation stores ids, so every read shows the related data as it is now",
                    ko: "관계는 id로 저장되므로 읽을 때마다 관계 데이터의 현재 상태를 보여줌",
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
            <div>
              {l.trans({
                en: `All core tutorials are complete. Explore the Architecture section to see how everything works together.`,
                ko: `모든 핵심 튜토리얼을 완료했습니다. 시스템 아키텍처 섹션에서 모든 것이 어떻게 함께 작동하는지 더 깊이 알아보세요.`,
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
