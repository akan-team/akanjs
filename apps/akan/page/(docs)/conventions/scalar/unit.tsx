import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="unit-overview" title="scalar.Unit.tsx">
        <Docs.Title>scalar.Unit.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar Unit is a small reusable display component for a scalar value. It is used inside a parent domain card, row, detail page, or table cell.",
              ko: "scalar Unit은 scalar 값을 표시하기 위한 작은 재사용 display component입니다. 상위 domain card, row, detail page, table cell 안에서 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use it when the same scalar should look the same across several parent modules. For example, Product, Order, and Invoice can all reuse `Price.Unit.Label`.",
              ko: "여러 상위 module에서 같은 scalar를 같은 모습으로 보여줘야 할 때 사용합니다. 예를 들어 Product, Order, Invoice가 모두 `Price.Unit.Label`을 재사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-shape" title={l.trans({ en: "File Shape", ko: "파일 형태" })}>
        <Docs.Title>{l.trans({ en: "File Shape", ko: "파일 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Place the Unit beside the scalar. Export small variants by display purpose, such as `Label`, `Summary`, or `Badge`.",
              ko: "Unit은 scalar 옆에 둡니다. `Label`, `Summary`, `Badge`처럼 표시 목적에 맞는 작은 variant를 export합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          code={`lib/
└── __scalar/
    └── price/
        ├── price.constant.ts
        └── price.Unit.tsx`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="scalar-unit" title={l.trans({ en: "Scalar Unit Example", ko: "Scalar Unit 예시" })}>
        <Docs.Title>{l.trans({ en: "Scalar Unit Example", ko: "Scalar Unit 예시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The scalar Unit receives a scalar value and renders it. It should not load data, manage a list, or trigger model actions.",
              ko: "scalar Unit은 scalar 값을 받아 렌더링합니다. 데이터를 load하거나 list를 관리하거나 model action을 실행하지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.Unit.tsx"
          code={`import { cnst } from "@apps/myapp/client";

interface LabelProps {
  price: cnst.Price;
  className?: string;
}

export const Label = ({ price, className }: LabelProps) => (
  <span className={className}>
    {price.amount.toLocaleString()} {price.currency}
  </span>
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="parent-usage" title={l.trans({ en: "Use From Parent Unit", ko: "상위 Unit에서 사용" })}>
        <Docs.Title>{l.trans({ en: "Use From Parent Unit", ko: "상위 Unit에서 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A parent module Unit can import the scalar Unit and pass the embedded scalar value from its model. This keeps display formatting reusable while the parent card still decides the surrounding layout.",
              ko: "상위 module Unit은 scalar Unit을 import하고 model 안의 embedded scalar 값을 넘길 수 있습니다. 표시 formatting은 재사용하고, 주변 layout은 상위 card가 결정합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.Unit.tsx"
          code={`import { Layout } from "akanjs/ui";
import { cnst, Price } from "@apps/myapp/client";

export const Card = ({ product }: { product: cnst.Product }) => (
  <Layout.Unit className="rounded-xl border border-base-300 p-4">
    <div className="font-bold">{product.name}</div>
    <Price.Label price={product.price} className="text-base-content/70" />
  </Layout.Unit>
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="variants" title={l.trans({ en: "Small Variants", ko: "작은 variant" })}>
        <Docs.Title>{l.trans({ en: "Small Variants", ko: "작은 variant" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Add variants only when the same scalar needs different display sizes. Keep each variant focused on rendering the scalar value.",
              ko: "같은 scalar가 서로 다른 표시 크기를 필요로 할 때만 variant를 추가합니다. 각 variant는 scalar 값을 렌더링하는 데 집중합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.Unit.tsx"
          code={`export const Compact = ({ price }: { price: Price }) => (
  <span>{price.amount.toLocaleString()}</span>
);

export const Detail = ({ price }: { price: Price }) => (
  <div>
    <div>Amount: {price.amount.toLocaleString()}</div>
    <div>Currency: {price.currency}</div>
  </div>
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
