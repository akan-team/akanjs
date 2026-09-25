import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="scalar-overview" title={l.trans({ en: "Scalar Overview", ko: "Scalar 개요" })}>
        <Docs.Title>{l.trans({ en: "Scalar Overview", ko: "Scalar 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar is a small reusable value object. Use it when the same group of fields appears inside multiple domain models.",
              ko: "scalar는 작고 재사용 가능한 value object입니다. 같은 field 묶음이 여러 domain model 안에서 반복될 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, a product, order, and invoice may all need a price value. Instead of rewriting `amount` and `currency` every time, define a `Price` scalar once and embed it wherever it is needed.",
              ko: "예를 들어 product, order, invoice가 모두 price 값을 필요로 할 수 있습니다. 매번 `amount`와 `currency`를 다시 쓰는 대신 `Price` scalar를 한 번 정의하고 필요한 곳에 embed합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use Scalar", ko: "Scalar를 쓰는 경우" })}>
        <Docs.Title>{l.trans({ en: "When To Use Scalar", ko: "Scalar를 쓰는 경우" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use a scalar when the value is stored as part of another model. Use a normal module model when the data needs its own list page, permissions, service methods, or independent lifecycle.",
              ko: "다른 model의 일부로 저장되는 값이면 scalar를 사용합니다. 독립적인 list page, permission, service method, lifecycle이 필요하면 일반 module model을 사용합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good scalar examples: Price, Address, ContactInfo, Coordinate, FileMeta.",
                ko: "좋은 scalar 예시: Price, Address, ContactInfo, Coordinate, FileMeta.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Good module model examples: Product, Order, User, Post, Ticket.",
                ko: "좋은 module model 예시: Product, Order, User, Post, Ticket.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="product.constant.ts"
          code={`import { via } from "akanjs/constant";
import { Price } from "../__scalar/price/price.constant";

export class ProductInput extends via((field) => ({
  name: field(String),
  price: field(Price),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-map" title={l.trans({ en: "Scalar Files", ko: "Scalar 파일" })}>
        <Docs.Title>{l.trans({ en: "Scalar Files", ko: "Scalar 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalar files live under `lib/__scalar/<scalarName>`. Start with abstract, constant, dictionary, and document files. Add Template or Unit files only when the scalar needs reusable UI.",
              ko: "Scalar 파일은 `lib/__scalar/<scalarName>` 아래에 둡니다. abstract, constant, dictionary, document 파일로 시작하고, 재사용 UI가 필요할 때만 Template 또는 Unit 파일을 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          code={`lib/
└── __scalar/
    └── price/
        ├── price.abstract.md
        ├── price.constant.ts
        ├── price.dictionary.ts
        ├── price.document.ts
        ├── price.Template.tsx
        └── price.Unit.tsx`}
        />
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code>*.abstract.md</code>:{" "}
              {l.trans({
                en: "explains value meaning, validation intent, reuse rules, and agent notes.",
                ko: "값의 의미, validation 의도, 재사용 규칙, agent note를 설명합니다.",
              })}
            </li>
            <li>
              <code>*.constant.ts</code>:{" "}
              {l.trans({
                en: "defines the scalar fields and enum values.",
                ko: "scalar field와 enum 값을 정의합니다.",
              })}
            </li>
            <li>
              <code>*.dictionary.ts</code>:{" "}
              {l.trans({
                en: "adds labels and descriptions for the scalar fields.",
                ko: "scalar field의 label과 description을 추가합니다.",
              })}
            </li>
            <li>
              <code>*.document.ts</code>:{" "}
              {l.trans({
                en: "optionally adds small value helper methods.",
                ko: "필요하면 작은 value helper method를 추가합니다.",
              })}
            </li>
            <li>
              <code>*.Template.tsx</code>:{" "}
              {l.trans({
                en: "renders a reusable editor for the scalar inside a parent form.",
                ko: "상위 form 안에서 scalar를 편집하는 재사용 editor를 렌더링합니다.",
              })}
            </li>
            <li>
              <code>*.Unit.tsx</code>:{" "}
              {l.trans({
                en: "renders a reusable display for the scalar inside a parent card or detail page.",
                ko: "상위 card나 detail page 안에서 scalar를 표시하는 재사용 renderer를 렌더링합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="small-example" title={l.trans({ en: "Small Example", ko: "작은 예시" })}>
        <Docs.Title>{l.trans({ en: "Small Example", ko: "작은 예시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar should be easy to understand on its own. The example below defines only the value shape; the parent module decides how to save, load, and render it.",
              ko: "scalar는 그 자체로 이해하기 쉬워야 합니다. 아래 예시는 값의 형태만 정의하고, 저장, 로딩, 렌더링 방식은 상위 module이 결정합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
