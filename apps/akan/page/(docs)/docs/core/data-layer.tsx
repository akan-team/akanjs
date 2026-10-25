import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

const filterMethods = [
  {
    name: "list<Filter>",
    example: "await listByOwner(ownerId, { limit: 20 })",
    en: "Read, no hooks. Hydrated documents, newest first; takes skip, limit, sort and select.",
    ko: "읽기, hook 없음. hydrate된 도큐먼트를 최신순으로 돌려주며 skip·limit·sort·select 옵션을 받습니다.",
  },
  {
    name: "listIds<Filter>",
    example: "await listIdsByOwner(ownerId)",
    en: "Read, no hooks. Just the ids; the same option, minus select.",
    ko: "읽기, hook 없음. id만 돌려줍니다. 같은 옵션을 받되 select는 무시합니다.",
  },
  {
    name: "find<Filter>",
    example: "await findByOwner(ownerId)",
    en: "Read, no hooks. The newest match or null.",
    ko: "읽기, hook 없음. 가장 최근에 맞는 하나 또는 null입니다.",
  },
  {
    name: "findId<Filter>",
    example: "await findIdByOwner(ownerId)",
    en: "Read, no hooks. That match's id, or null.",
    ko: "읽기, hook 없음. 그 하나의 id이거나 null입니다.",
  },
  {
    name: "pick<Filter>",
    example: "await pickByOwner(ownerId)",
    en: "Read, no hooks. Like find, but no match throws — for rows the caller knows exist.",
    ko: "읽기, hook 없음. find와 같지만 없으면 예외를 냅니다. 행이 있다고 아는 호출에서 씁니다.",
  },
  {
    name: "pickId<Filter>",
    example: "await pickIdByOwner(ownerId)",
    en: "Read, no hooks. That id, or a throw.",
    ko: "읽기, hook 없음. 그 id이거나 예외입니다.",
  },
  {
    name: "exists<Filter>",
    example: "if (await existsByOwner(ownerId)) …",
    en: "Read, no hooks. The matching id or null — not a boolean, though it works in a condition.",
    ko: "읽기, hook 없음. boolean이 아니라 맞는 id 또는 null입니다. 조건문에서는 boolean처럼 읽힙니다.",
  },
  {
    name: "count<Filter>",
    example: "await countByOwner(ownerId)",
    en: "Read, no hooks. How many rows match.",
    ko: "읽기, hook 없음. 조건에 맞는 행의 개수입니다.",
  },
  {
    name: "insight<Filter>",
    example: "await insightByOwner(ownerId)",
    en: "Read, no hooks. The model's Insight aggregate as a plain record, not a hydrated document.",
    ko: "읽기, hook 없음. 모델의 Insight 집계를 plain record로 돌려줍니다. hydrate된 도큐먼트가 아닙니다.",
  },
  {
    name: "query<Filter>",
    example: "this.productService.queryByOwner(ownerId)",
    en: "Neither. The descriptor a slice's exec returns; synchronous, never touches the database.",
    ko: "읽기도 쓰기도 아닙니다. slice의 exec이 돌려주는 query descriptor이며, 동기이고 데이터베이스에 닿지 않습니다.",
  },
  {
    name: "remove<Filter>",
    example: "await removeByOwner(ownerId)",
    en: "Write, NO hooks. One atomic soft delete over every match, reporting counts.",
    ko: "쓰기, hook 없음. 맞는 모든 행을 원자적 soft delete 한 번으로 지우고 개수를 돌려줍니다.",
  },
  {
    name: "removeOne<Filter>",
    example: "await removeOneByOwner(ownerId)",
    en: "Write, NO hooks. The same on the newest match; for at-most-one rows, not queue claims.",
    ko: "쓰기, hook 없음. 같은 동작을 가장 최근 하나에만 합니다. 큐 항목을 집는 용도가 아니라 많아야 하나인 행에 씁니다.",
  },
  {
    name: "purge<Filter>",
    example: "await purgeByOwner(ownerId)",
    en: "Write, NO hooks or cascade. Hard-deletes every match, removed rows too; returns the count. Refuses an empty query.",
    ko: "쓰기, hook·cascade 없음. 맞는 모든 행을 삭제된 행까지 영구히 지우고 개수를 돌려줍니다. 빈 query는 거부합니다.",
  },
  {
    name: "update<Filter>",
    example: 'await updateByOwner(ownerId).set({ status: "archived" })',
    en: "Write, NO hooks. A chain: the patch goes on a terminal .set(); building it does nothing.",
    ko: "쓰기, hook 없음. 체인입니다. 수정할 값은 마지막 .set()에 넘기고, 체인을 만드는 것만으로는 아무 일도 없습니다.",
  },
  {
    name: "updateOne<Filter>",
    example: 'await updateOneByOwner(ownerId).set({ status: "archived" })',
    en: "Write, NO hooks. The same chain, narrowed to the newest match.",
    ko: "쓰기, hook 없음. 같은 체인을 가장 최근 하나로 좁힙니다.",
  },
];

const layerQuestions = [
  { en: "What fields does it have?", ko: "어떤 필드를 가지나요?", file: "model.constant.ts" },
  { en: "Which fields are text searchable?", ko: "어떤 필드가 텍스트 검색 대상인가요?", file: "model.constant.ts" },
  {
    en: "How is it stored, filtered, or searched?",
    ko: "어떻게 저장하고 필터링하고 검색하나요?",
    file: "model.document.ts",
  },
  { en: "What business rule should run?", ko: "어떤 업무 규칙이 실행되나요?", file: "model.service.ts" },
  {
    en: "What should a page call, and who may call it?",
    ko: "페이지가 무엇을 호출하고, 누가 호출할 수 있나요?",
    file: "model.signal.ts",
  },
  { en: "What state is shared on the client?", ko: "클라이언트에서 어떤 상태를 공유하나요?", file: "model.store.ts" },
  { en: "What should users see?", ko: "사용자에게 무엇을 보여주나요?", file: "Model.View.tsx · Model.Zone.tsx" },
];

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "핵심 개념: 데이터 레이어 | Akan.js" : "Core Concepts: Data Layer | Akan.js";
    const description =
      lang === "ko"
        ? "선언한 모델 하나가 필터와 쿼리, 하이드레이션, 클라이언트 인스턴스가 되기까지."
        : "From one declared model to filters, queries, hydration and the client's stored instances.";
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
          <Docs.Figure
            title={l.trans({
              en: "One module, from the database to the screen",
              ko: "모듈 하나, 데이터베이스에서 화면까지",
            })}
            image="data-layer-module"
            prompt={`
            A wide folder outline spanning the whole frame, labelled "lib/product/" on its tab. Inside it, one row
            of shapes left to right joined by short arrows: a database cylinder labelled "Database"; a small
            folded-corner page labelled "document" with a smaller second line "how it is stored"; a gear labelled
            "service" with a smaller second line "business rules"; a small door labelled "signal" with a smaller
            second line "what a page may call"; then a tall dashed vertical line labelled "API"; then a small box
            labelled "store" with a smaller second line "client state"; and a browser labelled "UI". Under the whole
            row, one long flat rectangle running from under the document to under the browser, traced as the red
            accent, labelled "constant" with a smaller second line "the shape every file shares".
          `}
            alt={l.trans({
              en: "One lib/product folder holds the whole path: document stores the data, service runs the business rules, signal opens them to pages, and past the API the store holds client state for the UI. The constant file runs underneath every step, because each of them reuses its shape.",
              ko: "lib/product 폴더 하나가 전체 경로를 담습니다. document가 데이터를 저장하고, service가 비즈니스 규칙을 실행하고, signal이 그것을 페이지에 열고, API 너머에서는 store가 UI를 위한 클라이언트 상태를 들고 있습니다. constant 파일은 모든 단계 아래에 깔려 있습니다. 각 단계가 그 형태를 다시 쓰기 때문입니다.",
            })}
          />
        </Scroll.Slide>
        <Divider />

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
              className="w-full"
              title="apps/shop/lib/product/product.constant.ts"
              code={`import { Int } from "akanjs/base";
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
) {}

export class Product extends via(ProductObject, LightProduct, (resolve) => ({})) {}

export class ProductInsight extends via(Product, (field) => ({})) {}`}
            />
          </Docs.Description>
          <div className="space-y-1 pl-2">
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
              {
                title: "Full",
                desc: l.trans({
                  en: "The whole record, returned by a detail query. Write all five classes, in this order, in every constant file.",
                  ko: "상세 조회가 돌려주는 전체 레코드입니다. constant 파일에는 언제나 이 순서로 다섯 클래스를 모두 씁니다.",
                }),
              },
              {
                title: "Insight",
                desc: l.trans({
                  en: "Aggregate numbers a list query reports alongside the rows. Declare it even when it is empty.",
                  ko: "목록 쿼리가 행과 함께 돌려주는 집계 값입니다. 비어 있어도 선언합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title}>
                <span className="font-bold text-foreground">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Figure
            title={l.trans({ en: "How the five classes build on each other", ko: "다섯 클래스가 서로를 쌓는 방식" })}
            image="model-shape-layers"
            prompt={`
            Four columns left to right. First column: a small sheet of paper with two short lines, labelled "Input"
            with a smaller second line "what a form sends". An arrow to the second column: a larger sheet with the
            same small sheet drawn inside its top half and one more short line below it, labelled "Object" with a
            smaller second line "Input + stored fields". From it, two arrows to the third column, which has two
            shapes stacked top to bottom: at the top a small index card with two short lines, traced as the red
            accent, labelled "Light" with a smaller second line "the small shared view"; at the bottom a large sheet
            labelled "Model" with a smaller second line "Object + Light". A short arrow runs down from the index card
            into the large sheet. From the large sheet, drawn as a stack of three sheets, an arrow to the fourth
            column: a small card holding a sigma sign, labelled "Insight" with a smaller second line "counts over a
            list".
          `}
            alt={l.trans({
              en: "Input is what a form sends. Object adds the stored fields the system controls. Light picks the few fields a list or card needs and carries the shared logic. Model combines Object and Light into the full record, and Insight counts over a list of them.",
              ko: "Input은 폼이 보내는 값입니다. Object는 시스템이 관리하는 저장 필드를 더합니다. Light는 목록이나 카드에 필요한 필드 몇 개만 고르고 공유 로직을 담습니다. Model은 Object와 Light를 합친 전체 레코드이고, Insight는 그 목록을 세는 집계입니다.",
            })}
          />
          <Docs.Figure
            title={l.trans({ en: "Where each class shows up", ko: "각 클래스가 나타나는 곳" })}
            image="model-shape-screens"
            prompt={`
            One browser window filling most of the frame, and nothing at all drawn outside it — no people, devices,
            clouds, servers or arrows. Its page is divided into four regions by thin lines. Top left: a simple form
            with two empty input boxes and one small button, labelled "Input" with a smaller second line "create ·
            edit". Top right: three small cards in a row, each with a tiny picture box and one short line, the three
            cards traced as the red accent, labelled "Light" with a smaller second line "list · card". Bottom left: a
            large picture box above four short lines, labelled "Model" with a smaller second line "detail view".
            Bottom right: one large hand-drawn number block beside a tiny bar chart, labelled "Insight" with a smaller
            second line "totals".
          `}
            alt={l.trans({
              en: "A create or edit form sends Input, a list of cards shows Light, a detail view shows the full Model, and the totals above a list read Insight.",
              ko: "생성·수정 폼은 Input을 보내고, 카드 목록은 Light를 보여주고, 상세 화면은 전체 Model을 보여주고, 목록 위의 합계는 Insight를 읽습니다.",
            })}
          />
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="document-and-service"
          title={l.trans({ en: "Document And Service", ko: "Document와 Service" })}
        >
          <Docs.Title>{l.trans({ en: "Document And Service", ko: "Document와 Service" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The document file turns the model shape into stored data. It defines the database-facing model and the filter shape used when the application searches or sorts records.",
                ko: "document 파일은 모델 형태를 저장 가능한 데이터로 바꿉니다. 데이터베이스에서 사용할 모델과, 앱이 데이터를 검색하거나 정렬할 때 쓰는 필터 형태를 정의합니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
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
              className="w-full"
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
            <Docs.Figure
              title={l.trans({
                en: "Service decides, document changes itself",
                ko: "service는 결정하고, document는 스스로 바뀝니다",
              })}
              image="document-and-service"
              prompt={`
              A large process in the upper middle of the frame, labelled "Service" on its top band with a smaller
              second line "which record · when to save". Inside it, one folded-corner page, traced as the red accent,
              labelled "Document" with a smaller second line "validate · change · return this", with a small circular
              arrow curling around its top right corner. A database cylinder centred below the process, labelled
              "Database". On the left, an arrow rises from the database into the page, labelled "load". On the right,
              an arrow falls from the page back into the database, labelled "save".
            `}
              alt={l.trans({
                en: "The service loads a document from the database, the document validates and changes itself and returns itself, and the service saves it back.",
                ko: "service가 데이터베이스에서 document를 불러오고, document가 스스로 검증하고 바꾼 뒤 자기 자신을 돌려주면, service가 다시 저장합니다.",
              })}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="filter-methods"
          title={l.trans({ en: "What A Filter Generates", ko: "필터가 만들어 주는 것" })}
        >
          <Docs.Title>{l.trans({ en: "What A Filter Generates", ko: "필터가 만들어 주는 것" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A query you declare in the document file is not one method. Akan generates fifteen from it, named after the filter key: declare byOwner and you have listByOwner, countByOwner, updateOneByOwner, and twelve more, on both the model and the service.",
                ko: "document 파일에 선언한 query 하나는 메서드 하나가 아닙니다. Akan은 필터 키를 붙여 열다섯 개를 만듭니다. byOwner를 선언하면 listByOwner, countByOwner, updateOneByOwner를 비롯한 열다섯 개가 model과 service 양쪽에 생깁니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/shop/lib/product/product.document.ts"
              code={`export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    byOwner: filter()
      .arg("ownerId", ID)
      .query((ownerId) => ({ owner: ownerId })),
  },
  sort: {},
})) {}`}
            />
            <Docs.Figure
              title={l.trans({ en: "One filter, fifteen methods", ko: "필터 하나, 메서드 열다섯" })}
              image="filter-generates"
              prompt={`
              A small luggage tag at the left, labelled "byOwner" with a smaller second line "one filter". Three
              arrows leave it to the right, reaching three rounded boxes stacked top to bottom. The top box holds a
              small open book and is labelled "9 Reads" with a smaller second line "list · find · pick · count". The
              middle box holds a small blank slip of paper and is labelled "1 Query" with a smaller second line "for
              a slice". The bottom box holds a small pencil, its outline traced as the red accent, and is labelled "4
              Writes" with a smaller second line "no hooks".
            `}
              alt={l.trans({
                en: "One filter such as byOwner generates nine reads, one query descriptor for a slice, and five writes that run no hooks.",
                ko: "byOwner 같은 필터 하나가 읽기 아홉 개, slice용 query descriptor 하나, hook을 실행하지 않는 쓰기 다섯 개를 만듭니다.",
              })}
            />
            <div>
              {l.trans({
                en: "Nine of the fifteen read, one only builds a query descriptor, and the remaining five write. Those five are the ones to be careful with: each writes straight to the database, so none of the model's document hooks run:",
                ko: "열다섯 중 아홉은 읽기이고, 하나는 query descriptor를 만들 뿐이며, 나머지 다섯이 쓰기입니다. 조심해야 하는 쪽은 이 다섯입니다. 각각 데이터베이스에 바로 쓰므로 모델의 document hook이 전혀 실행되지 않습니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Method", ko: "메서드" })}
              items={filterMethods.map(({ name, example, en, ko }) => ({
                name,
                example,
                desc: l.trans({ en, ko }),
              }))}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: "Reach for the five writes only on a model whose removal carries no side effect. A model with a cascade, a _postRemove that deletes a stored file, or a live list watching it must be removed one document at a time through remove<Model>(id) — a query-level write cannot run any of that.",
                ko: "이 다섯 개의 쓰기는 삭제에 부수 효과가 없는 모델에만 씁니다. cascade가 있거나, 저장된 파일을 지우는 _postRemove가 있거나, 실시간 목록이 지켜보고 있는 모델은 remove<Model>(id)로 한 건씩 삭제해야 합니다. 쿼리 단위 쓰기로는 그중 무엇도 실행할 수 없습니다.",
              })}
            </Docs.Alert>
            <div>
              {l.trans({
                en: "Every model already carries an any filter, so listAny and countAny exist before you declare anything.",
                ko: "모든 모델에는 any 필터가 이미 있어서, 아무것도 선언하지 않아도 listAny와 countAny가 존재합니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
              className="w-full"
              title="apps/shop/lib/product/product.signal.ts"
              code={`import { Admin } from "@libs/shared/srvkit"; // [!code collapse:19]
import { ID, Int } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
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
  addStock: mutation(cnst.Product, { guards: [Admin] })
    .param("productId", ID)
    .param("count", Int)
    .exec(function (productId, count) {
      return this.productService.addStock(productId, count);
    }),
})) {}`}
            />
            <div>
              {l.trans({
                en: "Every custom endpoint names its own guards array, and the slice names one per verb. The guards are also the MCP exposure decision: an endpoint that declares none is refused from the agent catalogue, so a missing guards array costs visibility as well as authorization.",
                ko: "custom endpoint는 각각 자기 guards 배열을 선언하고, slice는 verb별로 guard를 지정합니다. guards는 MCP 노출 여부까지 결정합니다. guards를 선언하지 않은 endpoint는 agent 카탈로그에서 거부되므로, guards 배열을 빠뜨리면 권한뿐 아니라 노출까지 잃습니다.",
              })}
            </div>
            <div className="space-y-1 pl-2">
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
                <div key={title}>
                  <span className="font-bold text-foreground">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
            <Docs.Figure
              title={l.trans({ en: "Two doors out, one job inside", ko: "밖으로 난 문 둘, 안에서 도는 일 하나" })}
              image="signal-doors"
              prompt={`
              A large server outline on the left two thirds of the frame, labelled "Akan Server" at its top left.
              Inside it, a gear near the centre labelled "service". The server's right wall has two doors, one above
              the other, each with a small padlock on it; the two padlocks are traced as the red accent and labelled
              once "guards". The upper door is labelled "slice" with a smaller second line "data views", and an arrow
              leaves it to a browser outside at the right whose page shows three short list rows. The lower door is
              labelled "endpoint" with a smaller second line "actions", and an arrow leaves it to a second browser
              outside at the right whose page shows one button. Inside the server near its bottom, a small clock
              labelled "internal" with a smaller second line "jobs no page calls", with an arrow from the clock to the
              gear and no door.
            `}
              alt={l.trans({
                en: "A slice and an endpoint are the two doors a page can reach, each behind its guards; an internal signal runs a job inside the server and has no door at all.",
                ko: "slice와 endpoint는 페이지가 닿을 수 있는 두 개의 문이고 각각 guard 뒤에 있습니다. internal signal은 서버 안에서 작업을 돌리며 문이 아예 없습니다.",
              })}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
            <div className="space-y-1 pl-2">
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
                <div key={title}>
                  <span className="font-bold text-foreground">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
            <Docs.Figure
              title={l.trans({ en: "Who calls fetch, who holds st", ko: "fetch를 부르는 쪽, st를 쥐는 쪽" })}
              image="fetch-and-st"
              prompt={`
              A server at the far left labelled "Akan Server". On the right, two large rounded boxes stacked top to
              bottom. The top box is labelled "Server Component" with a smaller second line "page · Unit · View". The
              bottom box is labelled "Client Component" with a smaller second line "Zone · Template · Util". Between
              the bottom box and the server sits a small box traced as the red accent, labelled "Store". Two short
              arrows join the bottom box and the store: one from the store into the box, labelled "st.use"; one from
              the box into the store, labelled "st.do". One arrow leaves the top box and one leaves the store; they
              merge into a single arrow that enters the server, labelled "fetch" once where they join.
            `}
              alt={l.trans({
                en: "A server component calls fetch directly. A client component reads the store with st.use and changes it with st.do, and the store's action is what calls fetch.",
                ko: "서버 컴포넌트는 fetch를 직접 부릅니다. 클라이언트 컴포넌트는 st.use로 store를 읽고 st.do로 바꾸며, fetch를 부르는 것은 store의 action입니다.",
              })}
            />
            <Code.Snippet
              className="w-full"
              title="Server action: call addStock with fetch"
              code={`import { fetch } from "@apps/shop/client";

export const addProductStock = async (productId: string, count: number) => {
  return await fetch.addStock(productId, count);
};`}
            />
            <div>
              {l.trans({
                en: "Endpoint arguments are positional and in declaration order, and the call resolves to whatever the endpoint returns. addStock returns cnst.Product, so the awaited value is the product itself, not a wrapper object.",
                ko: "endpoint 인자는 선언 순서대로 위치 인자로 넘깁니다. 호출 결과는 endpoint가 선언한 반환값 그대로입니다. addStock은 cnst.Product를 반환하므로 await한 값도 감싸는 객체가 아니라 상품 자체입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "This pattern is useful when a page, action, or server-side helper needs to run a business operation. The generated fetch instance calls the server endpoint and returns the typed result.",
                ko: "이 패턴은 페이지, action, 서버 측 helper가 비즈니스 동작을 실행해야 할 때 유용합니다. 생성된 fetch 인스턴스가 서버 endpoint를 호출하고 타입이 지정된 결과를 돌려줍니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
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
              className="w-full"
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
        <Divider />

        <Scroll.Slide
          id="streaming-page-data"
          title={l.trans({ en: "Streaming Page Data", ko: "페이지 데이터 스트리밍" })}
        >
          <Docs.Title>{l.trans({ en: "Streaming Page Data", ko: "페이지 데이터 스트리밍" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "fetch.init<Model><Suffix>, fetch.view<Model>, and fetch.edit<Model> are the three helpers a route uses to load a screen. Each returns a handle that is awaitable and destructurable at the same time: awaiting it gives the payload object, while reading a field off it gives that field's own promise.",
                ko: "fetch.init<Model><Suffix>, fetch.view<Model>, fetch.edit<Model>는 route가 화면 데이터를 불러올 때 쓰는 세 helper입니다. 각각 await도 되고 구조분해도 되는 handle을 반환합니다. await하면 payload 객체를 주고, field를 읽으면 그 field의 promise를 줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "The difference is where the page waits. An awaited call holds the whole route until the query lands, so nothing below it is sent. A promise handed to a Zone or to Load.Stream is awaited inside that component instead, behind a Suspense boundary of its own — the rest of the page is already on the wire, and each section fills in as its own data arrives.",
                ko: "차이는 page가 어디서 기다리는지입니다. await한 호출은 query가 끝날 때까지 route 전체를 붙잡으므로 그 아래 아무것도 전송되지 않습니다. 반면 Zone이나 Load.Stream에 넘긴 promise는 그 component 안에서, 자체 Suspense boundary 뒤에서 await됩니다 — page의 나머지는 이미 전송된 상태이고 각 section은 자기 data가 도착하는 대로 채워집니다.",
              })}
            </div>
            <Docs.Sequence
              title={l.trans({ en: "Where the page waits", ko: "페이지가 기다리는 지점" })}
              actors={{
                browser: { label: l.trans({ en: "Browser", ko: "브라우저" }) },
                route: { label: l.trans({ en: "Route render", ko: "Route 렌더" }) },
                server: { label: l.trans({ en: "Server queries", ko: "서버 쿼리" }) },
              }}
              messages={[
                { from: "browser", to: "route", label: "GET /:lang/shop/:shopId" },
                { from: "route", to: "server", label: "fetch.initProductInShop(shopId)" },
                { from: "route", to: "server", label: "fetch.initOrderInShop(shopId)" },
                {
                  from: "route",
                  to: "browser",
                  dashed: true,
                  label: l.trans({ en: "shell HTML, one boundary per section", ko: "shell HTML, 섹션마다 경계 하나" }),
                },
                {
                  from: "server",
                  to: "browser",
                  dashed: true,
                  label: l.trans({
                    en: "productInitInShop fills the product zone",
                    ko: "productInitInShop이 product zone을 채웁니다",
                  }),
                },
                {
                  from: "server",
                  to: "browser",
                  dashed: true,
                  label: l.trans({
                    en: "orderInitInShop fills the order zone",
                    ko: "orderInitInShop이 order zone을 채웁니다",
                  }),
                },
                {
                  from: "server",
                  to: "browser",
                  dashed: true,
                  label: l.trans({
                    en: "productListInShop fills the Load.Stream",
                    ko: "productListInShop이 Load.Stream을 채웁니다",
                  }),
                },
              ]}
            />
            <Code.Snippet
              className="w-full"
              title="Server page: hand each promise to the section that renders it"
              code={`import { fetch, Order, Product, usePage } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("shopId", ID, { desc: "The shop whose products and orders to show." })
  .render(({ shopId }) => {
    const { l } = usePage();
    const { productInitInShop, productListInShop } = fetch.initProductInShop(shopId);
    const { orderInitInShop } = fetch.initOrderInShop(shopId, { insight: false });

    return (
      <div className="space-y-4">
        <h1 className="font-bold text-3xl">{l("shop.modelName")}</h1>
        <Product.Zone.Card init={productInitInShop} />
        <Order.Zone.Card init={orderInitInShop} />
        <Load.Stream of={productListInShop}>
          {(productList) => <Product.Unit.Total count={productList.length} />}
        </Load.Stream>
      </div>
    );
  });`}
            />
            <div className="space-y-1 pl-2">
              {[
                {
                  title: "x<Model>Init<Suffix>",
                  desc: l.trans({
                    en: "Plain list and insight data. This is the one field that may cross into a client Zone as a prop.",
                    ko: "plain list와 insight data입니다. client Zone의 prop으로 넘길 수 있는 유일한 field입니다.",
                  }),
                },
                {
                  title: "x<Model>List<Suffix> / x<Model>Insight<Suffix>",
                  desc: l.trans({
                    en: "Hydrated model instances, which React Flight refuses as client props. Consume them in a server component or a Load.Stream.",
                    ko: "hydrate된 model instance입니다. React Flight가 client prop으로 거부하므로 server component나 Load.Stream 안에서 사용합니다.",
                  }),
                },
                {
                  title: "x<Model>View / x<Model>Edit",
                  desc: l.trans({
                    en: "The single-model payloads for Load.View and Load.Edit. The sibling x<Model> field is the hydrated model, so it is server-only for the same reason.",
                    ko: "Load.View, Load.Edit에 넘기는 단일 model payload입니다. 형제 field인 x<Model>은 hydrate된 model이므로 같은 이유로 server 전용입니다.",
                  }),
                },
              ].map(({ title, desc }) => (
                <div key={title}>
                  <span className="font-bold text-foreground">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
            <Docs.Alert type="warning">
              {l.trans({
                en: "Await what the page needs immediately and stream the rest. The shell is what SEO snapshots, prerendering, and pre-hydration E2E read, so a value the first screen depends on — an auth gate, a title, an id used to build a link — belongs in an awaited call.",
                ko: "page가 즉시 필요한 것은 await하고 나머지는 스트리밍하세요. shell은 SEO 스냅샷, prerendering, hydration 이전 E2E가 읽는 대상이므로, 첫 화면이 의존하는 값 — 인증 게이트, 제목, link를 만드는 데 쓰는 id — 은 await한 호출에 두어야 합니다.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="common-decisions" title={l.trans({ en: "Common Decisions", ko: "자주 하는 판단" })}>
          <Docs.Title>{l.trans({ en: "Common Decisions", ko: "자주 하는 판단" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "When you are not sure where to put code, start with the business question. The data layer is easier to design when each file answers one kind of question.",
                ko: "코드를 어디에 둘지 헷갈릴 때는 비즈니스 질문에서 시작하면 됩니다. 각 파일이 한 종류의 질문에 답한다고 생각하면 데이터 레이어를 설계하기 쉬워집니다.",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Question", ko: "질문" })}
              items={layerQuestions.map(({ en, ko, file }) => ({
                name: <span className="font-sans">{l.trans({ en, ko })}</span>,
                desc: <code>{file}</code>,
              }))}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: "Keep page files focused on user experience. If the rule would still matter when another page, mobile app, or admin screen uses the same feature, it usually belongs in the data layer.",
                ko: "페이지 파일은 사용자 경험에 집중시키는 것이 좋습니다. 다른 페이지, 모바일 앱, 관리자 화면에서도 같은 규칙이 필요하다면 보통 그 규칙은 데이터 레이어에 두는 것이 맞습니다.",
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
