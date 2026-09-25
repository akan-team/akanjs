import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="template-overview" title="scalar.Template.tsx">
        <Docs.Title>scalar.Template.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar Template is a small reusable form component for editing a scalar value inside a parent domain form.",
              ko: "scalar Template은 상위 domain form 안에서 scalar 값을 편집하기 위한 작은 재사용 form component입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use it when several parent modules edit the same value shape. For example, Product, Order, and Invoice can all reuse `Price.Template`.",
              ko: "여러 상위 module이 같은 값 형태를 편집할 때 사용합니다. 예를 들어 Product, Order, Invoice가 모두 `Price.Template`을 재사용할 수 있습니다.",
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
              en: "Place the Template beside the scalar. The component is usually a client component because it receives a value and calls `onChange` when an input changes.",
              ko: "Template은 scalar 옆에 둡니다. input이 바뀔 때 value를 받고 `onChange`를 호출하므로 보통 client component입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          code={`lib/
└── __scalar/
    └── price/
        ├── price.constant.ts
        └── price.Template.tsx`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="scalar-template" title={l.trans({ en: "Scalar Template Example", ko: "Scalar Template 예시" })}>
        <Docs.Title>{l.trans({ en: "Scalar Template Example", ko: "Scalar Template 예시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The scalar Template receives `value` and `onChange`. It does not load data or submit the parent form. It only edits the scalar value.",
              ko: "scalar Template은 `value`와 `onChange`를 받습니다. 데이터를 load하거나 상위 form을 submit하지 않고, scalar 값만 편집합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.Template.tsx"
          code={`"use client";

import { cnst, usePage } from "@apps/myapp/client";
import { Field } from "@libs/shared/ui";

interface GeneralProps {
  value: cnst.Price;
  onChange: (price: cnst.Price) => void;
}

export const General = ({ value, onChange }: GeneralProps) => {
  const { l } = usePage();

  return (
    <div className="space-y-4">
      <Field.Number
        label={l("price.amount")}
        value={value.amount}
        onChange={(amount) => onChange({ ...value, amount })}
      />
      <Field.Text
        label={l("price.currency")}
        value={value.currency}
        onChange={(currency) => onChange({ ...value, currency })}
      />
    </div>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="parent-usage" title={l.trans({ en: "Use From Parent Form", ko: "상위 form에서 사용" })}>
        <Docs.Title>{l.trans({ en: "Use From Parent Form", ko: "상위 form에서 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The parent module keeps its normal form state. It passes the embedded scalar value to the scalar Template and uses the generated setter to store the changed value.",
              ko: "상위 module은 기존 form state를 그대로 유지합니다. embedded scalar 값을 scalar Template에 넘기고, 변경된 값은 generated setter로 저장합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.Template.tsx"
          code={`"use client";

import { st } from "@apps/myapp/client";
import * as Price from "../__scalar/price/price.Template";

export const General = () => {
  const productForm = st.use.productForm();

  return (
    <div className="space-y-6">
      <input
        value={productForm.name}
        onChange={(event) => st.do.setNameOnProduct(event.target.value)}
      />
      <Price.General
        value={productForm.price}
        onChange={st.do.setPriceOnProduct}
      />
    </div>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="custom-ui" title={l.trans({ en: "Field Or Custom UI", ko: "Field 또는 custom UI" })}>
        <Docs.Title>{l.trans({ en: "Field Or Custom UI", ko: "Field 또는 custom UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Field components when they match the scalar input. If the scalar needs a special interaction, it is fine to use plain inputs, buttons, or an app-specific component.",
              ko: "scalar input에 맞는 Field component가 있다면 사용합니다. scalar에 특별한 interaction이 필요하다면 일반 input, button 또는 app 전용 component를 사용해도 괜찮습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, `Address.Template` might use normal text fields, while `Coordinate.Template` might use a map picker.",
              ko: "예를 들어 `Address.Template`은 일반 text field를 사용하고, `Coordinate.Template`은 map picker를 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
