import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="data-layer" title={l.trans({ en: "Data Layer", ko: "데이터 레이어" })}>
        <Docs.Title>{l.trans({ en: "Data Layer", ko: "데이터 레이어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The data layer is the path from business data definition to server logic and screen usage. If you are building products, orders, users, reservations, or invoices, this is where the business shape becomes real application behavior.",
              ko: "데이터 레이어는 비즈니스 데이터 정의가 서버 로직과 화면 사용으로 이어지는 길입니다. 상품, 주문, 사용자, 예약, 청구서 같은 기능을 만들 때 비즈니스 형태가 실제 애플리케이션 동작이 되는 구간입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan keeps this flow close to the model folder. For example, a product feature can define what a product is, how it is stored, how stock and price rules work, and how pages load product data from one module.",
              ko: "Akan은 이 흐름을 모델 폴더 가까이에 모아둡니다. 예를 들어 상품 기능은 상품이 어떤 데이터인지, 어떻게 저장되는지, 재고와 가격 규칙이 어떻게 동작하는지, 페이지가 어떻게 상품 데이터를 불러오는지를 하나의 모듈에서 다룰 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Mermaid
          title="Data layer flow"
          chart={`flowchart LR
  constant["constant<br/>data shape"] --> document["document<br/>storage rule"]
  document --> service["service<br/>business logic"]
  service --> signal["signal<br/>page callable API"]
  signal --> store["store<br/>client state"]
  store --> ui["UI<br/>screen display"]`}
        />
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            {
              name: "constant",
              desc: l.trans({ en: "What data exists", ko: "어떤 데이터인지" }),
            },
            {
              name: "document",
              desc: l.trans({ en: "How data is stored", ko: "어떻게 저장하는지" }),
            },
            {
              name: "service",
              desc: l.trans({ en: "What the business does", ko: "비즈니스가 무엇을 하는지" }),
            },
            {
              name: "signal",
              desc: l.trans({ en: "What pages can call", ko: "페이지가 무엇을 호출하는지" }),
            },
            {
              name: "store",
              desc: l.trans({ en: "How client state is kept", ko: "클라이언트 상태를 어떻게 유지하는지" }),
            },
            {
              name: "UI",
              desc: l.trans({ en: "How users see the data", ko: "사용자가 데이터를 어떻게 보는지" }),
            },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "You do not need every layer on day one. A simple read-only feature may start with constant and document, then add service or signal when the business behavior grows.",
            ko: "처음부터 모든 레이어가 필요한 것은 아닙니다. 단순히 읽기만 하는 기능은 constant와 document로 시작하고, 비즈니스 동작이 늘어날 때 service나 signal을 추가하면 됩니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="model-shape" title={l.trans({ en: "Model Shape", ko: "모델 형태" })}>
        <Docs.Title>{l.trans({ en: "Model Shape", ko: "모델 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The constant file is the design sheet of a business object. It answers questions such as: What fields does a product have? Which values are allowed? Which fields should be shown in a lightweight list?",
              ko: "constant 파일은 비즈니스 객체의 설계도입니다. 상품에는 어떤 필드가 있는지, 어떤 값이 허용되는지, 가벼운 목록에서는 어떤 필드만 보여줄지 같은 질문에 답합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "In the product example, the model keeps catalog information such as name, description, image URL, price, stock, and sale status. This is the shared source that the server and client can both understand.",
              ko: "상품 예시에서는 이름, 설명, 이미지 주소, 가격, 재고, 판매 상태 같은 카탈로그 정보를 모델에 둡니다. 이 정의는 서버와 클라이언트가 함께 이해할 수 있는 공통 기준입니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/shop/lib/product/product.constant.ts"
            code={`import { enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class ProductInput extends via((field) => ({
  name: field(String),
  imageUrl: field(String),
})) {}

export class ProductObject extends via(ProductInput, (field) => ({
  stock: field(Int, { default: 0, min: 0 }),
})) {}

export class LightProduct extends via(
  ProductObject,
  ["name", "stock"] as const,
  (resolve) => ({}),
) {}`}
          />
        </Docs.Description>
        <div className="space-y-1">
          {[
            {
              title: "Input",
              desc: l.trans({
                en: "Fields that can be submitted when creating or updating data.",
                ko: "데이터를 생성하거나 수정할 때 입력할 수 있는 필드입니다.",
              }),
            },
            {
              title: "Object",
              desc: l.trans({
                en: "The base object shape used to build other model views.",
                ko: "다른 모델 형태를 만들 때 기준이 되는 기본 객체 형태입니다.",
              }),
            },
            {
              title: "Light",
              desc: l.trans({
                en: "A smaller view for lists, cards, and embedded references.",
                ko: "목록, 카드, 연결된 데이터에 쓰기 좋은 가벼운 형태입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-bold text-base-content">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="document-and-service" title={l.trans({ en: "Document And Service", ko: "Document와 Service" })}>
        <Docs.Title>{l.trans({ en: "Document And Service", ko: "Document와 Service" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The document file turns the model shape into stored data. It defines the database-facing model and the filter shape used when the application searches or sorts records.",
              ko: "document 파일은 모델 형태를 저장 가능한 데이터로 바꿉니다. 데이터베이스에서 사용할 모델과, 앱이 데이터를 검색하거나 정렬할 때 쓰는 필터 형태를 정의합니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/shop/lib/product/product.document.ts"
            code={`import { by, from, into } from "akanjs/document"; // [!code collapse:9]

import * as cnst from "../cnst";

export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {},
  sort: {},
})) {}

export class Product extends by(cnst.Product) {
  addStock(count: number) {
    this.stock += count;
    return this;
  }
}
// [!code collapse:2]
export class ProductModel extends into(Product, ProductFilter, cnst.product, () => ({})) {}`}
          />
          <div>
            {l.trans({
              en: "The service file is where business behavior lives. In this simple example, the document knows how to increase its own stock, and the service decides which product should be loaded and saved.",
              ko: "service 파일은 비즈니스 동작을 두는 곳입니다. 이 간단한 예시에서는 document가 자신의 재고를 늘리는 방법을 알고, service가 어떤 상품을 불러와 저장할지 결정합니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/shop/lib/product/product.service.ts"
            code={`import { serve } from "akanjs/service"; // [!code collapse:4]

import * as db from "../db";

export class ProductService extends serve(db.product, ({ use, service }) => ({})) {
  async addStock(productId: string, count: number) {
    const product = await this.getProduct(productId);
    return await product.addStock(count).save();
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="signal-to-ui" title={l.trans({ en: "Signal To UI", ko: "Signal에서 UI까지" })}>
        <Docs.Title>{l.trans({ en: "Signal To UI", ko: "Signal에서 UI까지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Signal is the layer that makes server behavior available to pages. A slice is useful when the page needs a list or dashboard view. An endpoint is useful when the page needs to run a specific action, such as adding product stock.",
              ko: "signal은 서버 동작을 페이지에서 사용할 수 있게 여는 레이어입니다. slice는 페이지가 목록이나 대시보드 관점의 데이터를 필요로 할 때 좋고, endpoint는 상품 재고 추가처럼 특정 동작을 실행해야 할 때 좋습니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/shop/lib/product/product.signal.ts"
            code={`import { Admin } from "@libs/shared/srvkit"; // [!code collapse:17]
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class ProductInternal extends internal(srv.product, ({ interval }) => ({})) {}

export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.productService.queryAny();
    }),
  }),
) {}

export class ProductEndpoint extends endpoint(srv.product, ({ query, mutation }) => ({
  addStock: mutation()
    .param("productId", String)
    .param("count", Int)
    .exec(function (productId, count) {
      return this.productService.addStock(productId, count);
    }),
})) {}`}
          />
          <div className="space-y-1">
            {[
              {
                title: "slice",
                desc: l.trans({
                  en: "Use it for data views such as public list, admin list, dashboard, or search result.",
                  ko: "공개 목록, 관리자 목록, 대시보드, 검색 결과처럼 데이터를 보여주는 관점에 사용합니다.",
                }),
              },
              {
                title: "endpoint",
                desc: l.trans({
                  en: "Use it for actions such as cancel order, approve request, send message, or complete payment.",
                  ko: "주문 취소, 요청 승인, 메시지 전송, 결제 완료처럼 동작을 실행할 때 사용합니다.",
                }),
              },
              {
                title: "internal",
                desc: l.trans({
                  en: "Use it for server-side jobs such as schedules, intervals, queues, or maintenance work.",
                  ko: "스케줄, 반복 작업, 큐, 유지보수 작업처럼 서버 내부에서 실행되는 일에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="fetch-and-st"
        title={l.trans({ en: "Fetch And Store Instances", ko: "Fetch와 Store 인스턴스" })}
      >
        <Docs.Title>{l.trans({ en: "Fetch And Store Instances", ko: "Fetch와 Store 인스턴스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After signal is declared, Akan exposes app-specific client helpers from @apps/<app>/client. The two names you will see most often are fetch and st.",
              ko: "signal을 선언하면 Akan은 @apps/<app>/client에서 앱 전용 클라이언트 helper를 제공합니다. 이때 가장 자주 보게 되는 이름이 fetch와 st입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use fetch when you need to call server data or pass slice metadata into Akan UI components. Use st when a client component needs to read current state or run a store action.",
              ko: "서버 데이터를 호출하거나 Akan UI 컴포넌트에 slice 정보를 넘길 때는 fetch를 사용합니다. 클라이언트 컴포넌트가 현재 상태를 읽거나 store action을 실행해야 할 때는 st를 사용합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "fetch",
                desc: l.trans({
                  en: "Generated request instance. It calls endpoints, initializes slices, loads views, and exposes fetch.slice.* metadata.",
                  ko: "생성된 요청 인스턴스입니다. endpoint 호출, slice 초기화, view 로딩을 수행하고 fetch.slice.* 메타 정보를 제공합니다.",
                }),
              },
              {
                title: "st",
                desc: l.trans({
                  en: "Generated client store instance. It provides st.use.* hooks for reading state and st.do.* actions for changing state.",
                  ko: "생성된 클라이언트 store 인스턴스입니다. 상태를 읽는 st.use.* hook과 상태를 변경하는 st.do.* action을 제공합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Server action: call addStock with fetch"
            code={`import { fetch } from "@apps/shop/client";

export const addProductStock = async (productId: string, quantity: number) => {
  const { product } = await fetch.addStock({
    productId,
    quantity,
  });

  return product;
};`}
          />
          <div>
            {l.trans({
              en: "This pattern is useful when a page, action, or server-side helper needs to run a business operation. The generated fetch instance calls the server endpoint and returns the typed result.",
              ko: "이 패턴은 페이지, action, 서버 측 helper가 비즈니스 동작을 실행해야 할 때 유용합니다. 생성된 fetch 인스턴스가 서버 endpoint를 호출하고 타입이 지정된 결과를 돌려줍니다.",
            })}
          </div>
          <Code.Snippet
            title="Client zone: pass fetch.slice metadata to UI components"
            code={`"use client";
import { type cnst, fetch, Product } from "@apps/shop/client";
import { Load, Model } from "akanjs/ui";

export const Card = ({ init }: CardProps) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(product) => (
          <Model.ViewWrapper modelId={product.id} slice={fetch.slice.product} key={product.id}>
            <Product.Unit.Card product={product} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.product}
        renderTitle={(product: cnst.Product) => product.name}
        renderView={(product: cnst.Product) => <Product.View.General product={product} />}
        renderTemplate={() => <Product.Template.General />}
      />
    </>
  );
};`}
          />
          <div>
            {l.trans({
              en: "fetch.slice.product is not the product data itself. It is slice metadata that tells Akan UI components which model slice should be viewed, edited, refreshed, or removed.",
              ko: "fetch.slice.product는 상품 데이터 자체가 아닙니다. Akan UI 컴포넌트가 어떤 모델 slice를 조회, 수정, 새로고침, 삭제해야 하는지 알 수 있게 해주는 slice 메타 정보입니다.",
            })}
          </div>
          <Code.Snippet
            title="Client form: read and change state with st"
            code={`"use client";
import { fetch, st, usePage } from "@apps/shop/client";
import { Field } from "@libs/shared/ui";

export const General = () => {
  const productForm = st.use.productForm();
  const { l } = usePage();

  return (
    <>
      <Field.Text
        label={l("product.imageUrl")}
        value={productForm.imageUrl}
        onChange={st.do.setImageUrlOnProduct}
      />
      <Field.Text
        label={l("product.name")}
        value={productForm.name}
        onChange={st.do.setNameOnProduct}
      />
    </>
  );
};`}
          />
          <div>
            {l.trans({
              en: "In client components, st.use.* reads the current store value and st.do.* runs the generated action. This keeps form state and business actions consistent across screens.",
              ko: "클라이언트 컴포넌트에서 st.use.*는 현재 store 값을 읽고, st.do.*는 생성된 action을 실행합니다. 이렇게 하면 여러 화면에서 form 상태와 비즈니스 동작을 일관되게 유지할 수 있습니다.",
            })}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: 'st is for client components. If a component uses st.use.* or st.do.*, mark it with "use client". Server pages should usually load initial data with fetch instead.',
              ko: 'st는 클라이언트 컴포넌트에서 사용합니다. st.use.*나 st.do.*를 쓰는 컴포넌트에는 "use client"를 선언하세요. 서버 페이지에서는 보통 fetch로 초기 데이터를 불러오는 방식이 적합합니다.',
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="common-decisions" title={l.trans({ en: "Common Decisions", ko: "자주 하는 판단" })}>
        <Docs.Title>{l.trans({ en: "Common Decisions", ko: "자주 하는 판단" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When you are not sure where to put code, start with the business question. The data layer is easier to design when each file answers one kind of question.",
              ko: "코드를 어디에 둘지 헷갈릴 때는 비즈니스 질문에서 시작하면 됩니다. 각 파일이 한 종류의 질문에 답한다고 생각하면 데이터 레이어를 설계하기 쉬워집니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "What fields does it have?", ko: "어떤 필드를 가지나요?" }),
                desc: "model.constant.ts",
              },
              {
                title: l.trans({ en: "Which fields are text searchable?", ko: "어떤 필드가 텍스트 검색 대상인가요?" }),
                desc: "model.constant.ts",
              },
              {
                title: l.trans({ en: "How is it stored or searched?", ko: "어떻게 저장하고 검색하나요?" }),
                desc: "model.document.ts",
              },
              {
                title: l.trans({ en: "What business rule should run?", ko: "어떤 업무 규칙이 실행되나요?" }),
                desc: "model.service.ts",
              },
              {
                title: l.trans({ en: "What should a page call?", ko: "페이지가 무엇을 호출하나요?" }),
                desc: "model.signal.ts",
              },
              {
                title: l.trans({ en: "What should users see?", ko: "사용자에게 무엇을 보여주나요?" }),
                desc: "Model.View.tsx or Model.Zone.tsx",
              },
              {
                title: l.trans({
                  en: "What state is shared on the client?",
                  ko: "클라이언트에서 어떤 상태를 공유하나요?",
                }),
                desc: "model.store.ts",
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="font-mono text-primary text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Keep page files focused on user experience. If the rule would still matter when another page, mobile app, or admin screen uses the same feature, it usually belongs in the data layer.",
              ko: "페이지 파일은 사용자 경험에 집중시키는 것이 좋습니다. 다른 페이지, 모바일 앱, 관리자 화면에서도 같은 규칙이 필요하다면 보통 그 규칙은 데이터 레이어에 두는 것이 맞습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
